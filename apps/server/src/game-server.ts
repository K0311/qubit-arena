import {
  applyAction,
  botAction,
  createGame,
  mulberry32,
  viewFor,
  type Action,
  type GameEvent,
  type Mode,
  type PlayerId,
} from '@qa/engine';
import {
  encodeMessage,
  parseClientMessage,
  PROTOCOL_VERSION,
  type ClientMessage,
  type ErrorCode,
  type ServerMessage,
} from '@qa/protocol';
import { newRoomCode, newSeed, newToken } from './random';
import { LIMITS, newLimiter, type Limiter, type Limits } from './rate-limit';
import { Room, roomConfig, type Connection, type Session } from './room';
import { realScheduler, type Scheduler } from './scheduler';

export type GameServerOptions = {
  scheduler?: Scheduler;
  /** Sees every outgoing message before it is encoded; tests audit it (T-S-03). */
  onSend?: (session: Session, msg: ServerMessage) => void;
  /** How long a disconnected seat waits before a bot plays for it (rules.md §10: 30 s). */
  botDelayMs?: number;
  /** A bot waits this long before each move so people can follow it. */
  botThinkMs?: number;
  /** Flood limits per connection (defaults in rate-limit.ts). */
  limits?: Limits;
};

/** rules.md §13 [OPEN] item 3 default. */
export const BOT_DELAY_MS = 30_000;

type Failure = { code: ErrorCode; message: string };
const fail = (code: ErrorCode, message: string): Failure => ({ code, message });

/**
 * Lobby, rooms and matches (architecture.md §6), independent of the transport so the same
 * logic runs behind `ws` and in tests. The client only sends intents; every rule runs in
 * @qa/engine here, and each connection only ever gets its own viewFor() (rules.md §9).
 */
export class GameServer {
  readonly scheduler: Scheduler;
  private readonly onSend: GameServerOptions['onSend'];
  private readonly botDelayMs: number;
  private readonly botThinkMs: number;
  private readonly limits: Limits;
  private readonly sessions = new Map<string, Session>();
  private readonly limiters = new WeakMap<Session, Limiter>();
  private readonly rooms = new Map<string, Room>();
  private nextSessionId = 1;

  constructor(options: GameServerOptions = {}) {
    this.scheduler = options.scheduler ?? realScheduler();
    this.onSend = options.onSend;
    this.botDelayMs = options.botDelayMs ?? BOT_DELAY_MS;
    this.botThinkMs = options.botThinkMs ?? 1_000;
    this.limits = options.limits ?? LIMITS;
  }

  // ---- connection layer ------------------------------------------------------------------

  /** A known token gets its old session back, seat included (rules.md §10, T-S-06). */
  connect(conn: Connection, token?: string): Session {
    const known = token ? this.sessions.get(token) : undefined;
    if (known) {
      this.reattach(known, conn);
      return known;
    }
    const session: Session = {
      id: this.nextSessionId++,
      token: newToken(),
      name: 'Player',
      conn,
      room: null,
    };
    this.sessions.set(session.token, session);
    this.send(session, {
      type: 'WELCOME',
      protocolVersion: PROTOCOL_VERSION,
      token: session.token,
    });
    return session;
  }

  private reattach(session: Session, conn: Connection): void {
    const old = session.conn;
    session.conn = conn;
    // A second tab with the same token takes over; the old socket's close is then ignored.
    old?.close();
    this.send(session, {
      type: 'WELCOME',
      protocolVersion: PROTOCOL_VERSION,
      token: session.token,
    });
    const room = session.room;
    if (!room) return;
    const p = room.seatOf(session);
    if (p) this.seatBack(room, p);
    this.broadcastRoom(room);
    this.sendView(room, session);
  }

  /** The socket closed. Only acts if `conn` is still the session's live connection. */
  disconnect(session: Session, conn: Connection): void {
    if (session.conn !== conn) return;
    session.conn = null;
    const room = session.room;
    if (!room) {
      this.sessions.delete(session.token);
      return;
    }
    if (room.status === 'PLAYING' && room.seatOf(session)) {
      // rules.md §10: a player who disconnects keeps their seat.
      const p = room.seatOf(session);
      if (p) this.onSeatLost(room, p);
      this.broadcastRoom(room);
      return;
    }
    this.leaveRoom(session);
    this.sessions.delete(session.token);
  }

  receive(session: Session, raw: string): void {
    const parsed = parseClientMessage(raw);
    // PING stays free so a throttled client can still keep its connection alive.
    const isPing = parsed.ok && parsed.msg.type === 'PING';
    if (!isPing && !this.limiter(session).messages.take(this.scheduler.now())) {
      this.error(session, fail('RATE_LIMITED', 'too many messages'));
      return;
    }
    if (!parsed.ok) {
      this.error(session, fail('BAD_MESSAGE', parsed.error));
      return;
    }
    const problem = this.handle(session, parsed.msg);
    if (problem) this.error(session, problem);
  }

  private limiter(session: Session): Limiter {
    let l = this.limiters.get(session);
    if (!l) {
      l = newLimiter(this.scheduler.now(), this.limits);
      this.limiters.set(session, l);
    }
    return l;
  }

  // ---- messages --------------------------------------------------------------------------

  private handle(session: Session, msg: ClientMessage): Failure | void {
    switch (msg.type) {
      case 'PING':
        this.send(session, { type: 'PONG', t: msg.t });
        return;
      case 'CREATE_ROOM': {
        const problem = this.leaveForNewRoom(session);
        if (problem) return problem;
        session.name = msg.playerName;
        const room = this.newRoom(
          msg.mode,
          msg.visibility,
          msg.name,
          roomConfig(msg.mode, msg.settings),
        );
        this.sit(room, session, 'P1', false);
        room.host = session;
        this.broadcastRoom(room);
        return;
      }
      case 'JOIN_ROOM':
        return this.join(session, msg.code, msg.role, msg.playerName);
      case 'QUICK_MATCH':
        return this.quickMatch(session, msg.mode, msg.playerName);
      case 'TAKE_SEAT': {
        const room = session.room;
        if (!room) return fail('NOT_IN_ROOM', 'join a room first');
        if (room.status !== 'WAITING') return fail('GAME_IN_PROGRESS', 'seats are locked');
        if (!room.seats.has(msg.seat))
          return fail('BAD_MESSAGE', `${room.mode} has no seat ${msg.seat}`);
        const seat = room.seats.get(msg.seat);
        if (seat?.session === session) return;
        if (seat) return fail('SEAT_TAKEN', `${msg.seat} is taken`);
        this.unseat(room, session);
        this.sit(room, session, msg.seat, false);
        this.broadcastRoom(room);
        return;
      }
      case 'READY': {
        const room = session.room;
        const p = room?.seatOf(session);
        if (!room || !p) return fail('NOT_SEATED', 'take a seat first');
        if (room.status !== 'WAITING') return fail('GAME_IN_PROGRESS', 'the game has started');
        const seat = room.seats.get(p);
        if (seat) seat.ready = msg.ready;
        this.broadcastRoom(room);
        return;
      }
      case 'START_GAME': {
        const room = session.room;
        if (!room) return fail('NOT_IN_ROOM', 'join a room first');
        if (room.host !== session) return fail('NOT_HOST', 'only the host can start');
        if (room.status !== 'WAITING') return fail('GAME_IN_PROGRESS', 'the game has started');
        const seats = [...room.seats.values()];
        if (!seats.every((s) => s?.ready)) {
          return fail('NOT_ALL_READY', 'every seat must be filled and ready');
        }
        this.startGame(room);
        return;
      }
      case 'PLAY_CARD':
        return this.act(session, (player) => ({ type: 'PLAY_CARD', player, cardId: msg.cardId }));
      case 'CHALLENGE_ANSWER':
        return this.act(session, (player) => ({
          type: 'CHALLENGE_ANSWER',
          player,
          questionId: msg.questionId,
          choice: msg.choice,
        }));
      case 'CHAT':
        return this.chat(session, msg.text);
      case 'LEAVE':
        if (!session.room) return fail('NOT_IN_ROOM', 'not in a room');
        this.leaveRoom(session);
        return;
    }
  }

  private join(
    session: Session,
    code: string,
    role: 'PLAYER' | 'SPECTATOR',
    name: string,
  ): Failure | void {
    const room = this.rooms.get(code);
    if (!room) return fail('ROOM_NOT_FOUND', `no room ${code}`);
    if (session.room === room) return fail('BAD_MESSAGE', 'already in this room');
    const mine = room.seatOf(session);
    if (role === 'PLAYER' && room.status === 'PLAYING' && mine) {
      // Back to the seat they left during the game (rules.md §10: until they return).
      const problem = this.leaveForNewRoom(session);
      if (problem) return problem;
      session.room = room;
      this.seatBack(room, mine);
      this.broadcastRoom(room);
      this.sendView(room, session);
      return;
    }
    if (role === 'PLAYER') {
      if (room.status !== 'WAITING') return fail('GAME_IN_PROGRESS', 'join as a spectator');
      const seat = room.freeSeat();
      if (!seat) return fail('ROOM_FULL', 'no free seat');
      const problem = this.leaveForNewRoom(session);
      if (problem) return problem;
      session.name = name;
      this.sit(room, session, seat, room.quick);
    } else {
      const problem = this.leaveForNewRoom(session);
      if (problem) return problem;
      session.name = name;
      room.spectators.add(session);
      session.room = room;
    }
    this.broadcastRoom(room);
    if (room.state) this.sendView(room, session);
    this.maybeQuickStart(room);
  }

  private quickMatch(session: Session, mode: Mode, name: string): Failure | void {
    const open = [...this.rooms.values()].find(
      (r) => r.quick && r.mode === mode && r.status === 'WAITING' && !r.isFull(),
    );
    if (open) return this.join(session, open.code, 'PLAYER', name);
    const problem = this.leaveForNewRoom(session);
    if (problem) return problem;
    session.name = name;
    const room = this.newRoom(mode, 'PUBLIC', 'Quick match', roomConfig(mode), true);
    this.sit(room, session, 'P1', true);
    room.host = session;
    this.broadcastRoom(room);
  }

  private chat(session: Session, text: string): Failure | void {
    const room = session.room;
    const from = room?.seatOf(session);
    if (!room || !from) return fail('NOT_SEATED', 'only players can chat');
    if (!this.limiter(session).chat.take(this.scheduler.now())) {
      return fail('RATE_LIMITED', 'too many chat messages');
    }
    // rules.md §9: team chat is seen by that team only (in Solo the team is one player).
    const side = room.sideOf(from);
    const msg: ServerMessage = {
      type: 'CHAT',
      from,
      name: session.name,
      text,
      at: this.scheduler.now(),
    };
    for (const [p, seat] of room.seats) {
      if (seat && room.isConnected(seat) && room.sideOf(p) === side) this.send(seat.session, msg);
    }
  }

  // ---- rooms -----------------------------------------------------------------------------

  private newRoom(
    mode: Mode,
    visibility: 'PUBLIC' | 'PRIVATE',
    name: string,
    config: ReturnType<typeof roomConfig>,
    quick = false,
  ): Room {
    const code = newRoomCode((c) => this.rooms.has(c));
    const room = new Room(code, name, mode, visibility, config, quick);
    this.rooms.set(code, room);
    return room;
  }

  private sit(room: Room, session: Session, p: PlayerId, ready: boolean): void {
    room.spectators.delete(session);
    room.seats.set(p, { session, ready, left: false, bot: false });
    session.room = room;
  }

  private unseat(room: Room, session: Session): void {
    const p = room.seatOf(session);
    if (p) room.seats.set(p, null);
    room.spectators.delete(session);
  }

  /** Before moving rooms: a player in a running game must not abandon it silently. */
  private leaveForNewRoom(session: Session): Failure | void {
    const room = session.room;
    if (!room) return;
    if (room.status === 'PLAYING' && room.seatOf(session)) {
      return fail('GAME_IN_PROGRESS', 'leave your game first');
    }
    this.leaveRoom(session);
  }

  leaveRoom(session: Session): void {
    const room = session.room;
    if (!room) return;
    session.room = null;
    const p = room.seatOf(session);
    if (room.status === 'PLAYING' && p) {
      // The seat stays in the game (rules.md §10); only this session stops watching it.
      const seat = room.seats.get(p);
      if (seat) seat.left = true;
      this.onSeatLost(room, p);
    } else {
      this.unseat(room, session);
    }
    if (room.host === session) {
      room.host = [...room.seats.values()].find((s) => s && !s.left)?.session ?? null;
    }
    if (room.isEmpty()) {
      this.closeRoom(room);
      return;
    }
    this.broadcastRoom(room);
  }

  /** A seat's human is gone (disconnected or left): a bot takes over after the delay. */
  private onSeatLost(room: Room, p: PlayerId): void {
    if (room.status !== 'PLAYING') return;
    this.scheduler.clear(room.timers.seats.get(p));
    room.timers.seats.set(
      p,
      this.scheduler.set(() => {
        room.timers.seats.delete(p);
        const seat = room.seats.get(p);
        if (!seat || room.status !== 'PLAYING') return;
        seat.bot = true;
        this.broadcastRoom(room);
        this.scheduleBot(room);
      }, this.botDelayMs),
    );
  }

  /** The human is back: cancel the pending bot or stop the running one. */
  private seatBack(room: Room, p: PlayerId): void {
    const seat = room.seats.get(p);
    if (!seat) return;
    this.scheduler.clear(room.timers.seats.get(p));
    room.timers.seats.delete(p);
    seat.left = false;
    if (seat.bot) {
      seat.bot = false;
      this.scheduleBot(room);
    }
  }

  private closeRoom(room: Room): void {
    // Disconnected players' sessions only existed to get back into this room.
    for (const seat of room.seats.values()) {
      if (seat && seat.session.room === room && !seat.session.conn) {
        seat.session.room = null;
        this.sessions.delete(seat.session.token);
      }
    }
    this.stopClocks(room);
    for (const t of room.timers.seats.values()) this.scheduler.clear(t);
    room.timers.seats.clear();
    this.rooms.delete(room.code);
  }

  private maybeQuickStart(room: Room): void {
    if (room.quick && room.status === 'WAITING' && room.isFull()) this.startGame(room);
  }

  // ---- game ------------------------------------------------------------------------------

  private startGame(room: Room): void {
    // One seeded RNG per match; the seed stays in this closure (architecture.md §6).
    room.rng = mulberry32(newSeed());
    const { state, events } = createGame(room.config, room.rng);
    room.state = state;
    room.status = 'PLAYING';
    this.broadcastRoom(room);
    this.pushGame(room, events);
    // Game clock (rules.md §8 item 2); the engine ends the game after the current turn.
    room.timers.game = this.scheduler.set(() => {
      room.timers.game = undefined;
      this.apply(room, { type: 'TIME_UP' });
    }, room.config.timeLimitMs);
    this.afterGameChange(room, events);
  }

  private act(session: Session, build: (player: PlayerId) => Action): Failure | void {
    const room = session.room;
    if (!room?.state) return fail('WRONG_PHASE', 'no game is running');
    const player = room.seatOf(session);
    if (!player) return fail('NOT_SEATED', 'spectators cannot play');
    return this.apply(room, build(player));
  }

  /** The only path from an action to the game state. */
  private apply(room: Room, action: Action): Failure | void {
    if (!room.state || !room.rng) return fail('WRONG_PHASE', 'no game is running');
    const res = applyAction(room.state, action, room.rng);
    if (res.error) return fail(res.error.code, res.error.message);
    if (res.events.length === 0) return;
    room.state = res.state;
    this.pushGame(room, res.events);
    if (res.state.phase === 'FINISHED') {
      room.status = 'FINISHED';
      if (room.isEmpty()) {
        this.closeRoom(room);
        return;
      }
      this.broadcastRoom(room);
    }
    this.afterGameChange(room, res.events);
  }

  /** Restart the turn timer after every card and give bots their move. */
  private afterGameChange(room: Room, events: readonly GameEvent[]): void {
    const state = room.state;
    if (!state || state.phase === 'FINISHED') {
      this.stopClocks(room);
      return;
    }
    if (state.phase !== 'PLAYING') {
      this.scheduler.clear(room.timers.turn);
      room.timers.turn = undefined;
    } else if (!room.timers.turn || events.some((e) => e.type === 'CARD_PLAYED')) {
      this.scheduler.clear(room.timers.turn);
      const player = state.turn;
      // rules.md §6.2: the server plays a card for a silent player.
      room.timers.turn = this.scheduler.set(() => {
        room.timers.turn = undefined;
        this.apply(room, { type: 'TIMEOUT', player });
      }, room.config.turnTimerMs);
    }
    this.scheduleBot(room);
  }

  /** At most one pending bot move per room; recomputed after every change. */
  private scheduleBot(room: Room): void {
    this.scheduler.clear(room.timers.bot);
    room.timers.bot = undefined;
    const state = room.state;
    if (!state || room.status !== 'PLAYING') return;
    const answered = state.challenge?.answers ?? {};
    const due = [...room.seats].find(([p, seat]) => {
      if (!seat?.bot) return false;
      if (state.phase === 'PLAYING') return state.turn === p;
      return state.phase === 'CHALLENGE' && answered[room.sideOf(p)] === undefined;
    });
    if (!due) return;
    const [p] = due;
    room.timers.bot = this.scheduler.set(() => {
      room.timers.bot = undefined;
      if (!room.state || !room.rng || !room.seats.get(p)?.bot) return;
      const action = botAction(room.state, p, room.rng);
      if (action) this.apply(room, action);
    }, this.botThinkMs);
  }

  private stopClocks(room: Room): void {
    for (const key of ['game', 'turn', 'bot'] as const) {
      this.scheduler.clear(room.timers[key]);
      room.timers[key] = undefined;
    }
  }

  // ---- sending ---------------------------------------------------------------------------

  private pushGame(room: Room, events: readonly GameEvent[]): void {
    room.version++;
    const members = room.members();
    if (events.length > 0) {
      for (const s of members) {
        this.send(s, { type: 'EVENT', stateVersion: room.version, events: [...events] });
      }
    }
    for (const s of members) this.sendView(room, s);
  }

  /** Never broadcast one view to everyone: each connection gets its own (architecture.md §5). */
  private sendView(room: Room, session: Session): void {
    const role = room.roleOf(session);
    if (!room.state || !role) return;
    const view = viewFor(room.state, role);
    // The engine's view is deeply readonly; the schema type is not. Same shape (protocol tests).
    this.send(session, { type: 'GAME_VIEW', stateVersion: room.version, view } as ServerMessage);
  }

  private broadcastRoom(room: Room): void {
    room.version++;
    for (const s of room.members()) this.sendRoom(room, s);
  }

  private sendRoom(room: Room, session: Session): void {
    this.send(session, {
      type: 'ROOM_STATE',
      stateVersion: room.version,
      room: room.info(),
      you: { seat: room.roleOf(session), host: room.host === session },
    });
  }

  private error(session: Session, f: Failure): void {
    this.send(session, { type: 'ERROR', code: f.code, message: f.message.slice(0, 200) });
  }

  private send(session: Session, msg: ServerMessage): void {
    this.onSend?.(session, msg);
    session.conn?.send(encodeMessage(msg));
  }

  // ---- for tests and the CLI -------------------------------------------------------------

  room(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  get roomCount(): number {
    return this.rooms.size;
  }
}
