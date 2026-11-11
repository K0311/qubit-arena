import {
  applyAction,
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
import { Room, roomConfig, type Connection, type Session } from './room';
import { realScheduler, type Scheduler } from './scheduler';

export type GameServerOptions = {
  scheduler?: Scheduler;
  /** Sees every outgoing message before it is encoded; tests audit it (T-S-03). */
  onSend?: (session: Session, msg: ServerMessage) => void;
};

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
  private readonly sessions = new Map<string, Session>();
  private readonly rooms = new Map<string, Room>();
  private nextSessionId = 1;

  constructor(options: GameServerOptions = {}) {
    this.scheduler = options.scheduler ?? realScheduler();
    this.onSend = options.onSend;
  }

  // ---- connection layer ------------------------------------------------------------------

  /** `token` is for reconnection (P-3.3); for now every connection is a new session. */
  connect(conn: Connection, token?: string): Session {
    void token;
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
      this.broadcastRoom(room);
      return;
    }
    this.leaveRoom(session);
    this.sessions.delete(session.token);
  }

  receive(session: Session, raw: string): void {
    const parsed = parseClientMessage(raw);
    if (!parsed.ok) {
      this.error(session, fail('BAD_MESSAGE', parsed.error));
      return;
    }
    const problem = this.handle(session, parsed.msg);
    if (problem) this.error(session, problem);
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

  /** Hook for P-3.3 bot seats; a seat's human is gone (disconnected or left). */
  protected onSeatLost(room: Room, p: PlayerId): void {
    void room;
    void p;
  }

  protected closeRoom(room: Room): void {
    this.rooms.delete(room.code);
  }

  private maybeQuickStart(room: Room): void {
    if (room.quick && room.status === 'WAITING' && room.isFull()) this.startGame(room);
  }

  // ---- game ------------------------------------------------------------------------------

  protected startGame(room: Room): void {
    // One seeded RNG per match; the seed stays in this closure (architecture.md §6).
    room.rng = mulberry32(newSeed());
    const { state, events } = createGame(room.config, room.rng);
    room.state = state;
    room.status = 'PLAYING';
    this.broadcastRoom(room);
    this.pushGame(room, events);
    this.afterGameChange(room);
  }

  private act(session: Session, build: (player: PlayerId) => Action): Failure | void {
    const room = session.room;
    if (!room?.state) return fail('WRONG_PHASE', 'no game is running');
    const player = room.seatOf(session);
    if (!player) return fail('NOT_SEATED', 'spectators cannot play');
    return this.apply(room, build(player));
  }

  /** The only path from an action to the game state. */
  protected apply(room: Room, action: Action): Failure | void {
    if (!room.state || !room.rng) return fail('WRONG_PHASE', 'no game is running');
    const res = applyAction(room.state, action, room.rng);
    if (res.error) return fail(res.error.code, res.error.message);
    if (res.events.length === 0) return;
    room.state = res.state;
    this.pushGame(room, res.events);
    if (res.state.phase === 'FINISHED') {
      room.status = 'FINISHED';
      this.broadcastRoom(room);
    }
    this.afterGameChange(room);
  }

  /** Hook for P-3.3 clocks and bots. */
  protected afterGameChange(room: Room): void {
    void room;
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

  protected broadcastRoom(room: Room): void {
    room.version++;
    for (const s of room.members()) this.sendRoom(room, s);
  }

  protected sendRoom(room: Room, session: Session): void {
    this.send(session, {
      type: 'ROOM_STATE',
      stateVersion: room.version,
      room: room.info(),
      you: { seat: room.roleOf(session), host: room.host === session },
    });
  }

  protected error(session: Session, f: Failure): void {
    this.send(session, { type: 'ERROR', code: f.code, message: f.message.slice(0, 200) });
  }

  protected send(session: Session, msg: ServerMessage): void {
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
