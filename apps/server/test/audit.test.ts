import { describe, expect, it, vi } from 'vitest';
import {
  mulberry32,
  sideOf,
  TURN_ORDER,
  type GameState,
  type Mode,
  type PlayerId,
  type Rng,
} from '@qa/engine';
import {
  encodeMessage,
  parseServerMessage,
  type ClientMessage,
  type ServerMessage,
} from '@qa/protocol';
import { GameServer } from '../src/game-server';
import type { Connection, Session } from '../src/room';
import { ManualScheduler } from '../src/scheduler';

// Fixed match seeds so the 50 games are the same every run, and the audit knows each seed.
const seeds: number[] = [];
vi.mock('../src/random', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/random')>();
  return {
    ...real,
    newSeed: () => {
      const seed = (0x9e3779b1 * (seeds.length + 1)) >>> 0;
      seeds.push(seed);
      return seed;
    },
  };
});

const NO_LIMITS = {
  messages: { capacity: 1e6, perSecond: 1e6 },
  chat: { capacity: 1e6, perSecond: 1e6 },
};

/** In-memory client: the GameServer is transport-free, so 50 games run in a second. */
class MemClient implements Connection {
  readonly msgs: ServerMessage[] = [];
  session!: Session;
  constructor(private readonly server: GameServer) {
    this.session = server.connect(this);
  }
  send(text: string): void {
    const res = parseServerMessage(text);
    if (!res.ok) throw new Error(`invalid server message: ${res.error}`);
    this.msgs.push(res.msg);
  }
  close(): void {}
  say(msg: ClientMessage): void {
    this.server.receive(this.session, encodeMessage(msg));
  }
  latest<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }> {
    for (let i = this.msgs.length - 1; i >= 0; i--) {
      const m = this.msgs[i];
      if (m?.type === type) return m as Extract<ServerMessage, { type: T }>;
    }
    throw new Error(`no ${type}`);
  }
}

type Card = { id: number; kind: string };
function cardsIn(x: unknown, out: Card[] = []): Card[] {
  if (Array.isArray(x)) for (const v of x) cardsIn(v, out);
  else if (x && typeof x === 'object') {
    const o = x as Record<string, unknown>;
    if (typeof o.id === 'number' && typeof o.kind === 'string') out.push(o as Card);
    for (const v of Object.values(o)) cardsIn(v, out);
  }
  return out;
}

/**
 * T-S-03: what one outgoing message may not contain (rules.md §9): the deck, the seed, the
 * card kinds in an opponent's hand, or upcoming quiz questions and answers.
 */
function audit(session: Session, msg: ServerMessage, leaks: string[]): void {
  const text = encodeMessage(msg);
  const fail = (why: string) => leaks.push(`${msg.type} to session ${session.id}: ${why}`);
  for (const key of ['"deck"', '"seed"', '"rng"', '"questionIds"', '"answers"', '"answer"']) {
    if (text.includes(key)) fail(`has key ${key}`);
  }
  for (const seed of seeds) {
    if (new RegExp(`(^|[^0-9.])${seed}($|[^0-9.])`).test(text)) fail(`has seed ${seed}`);
  }
  const room = session.room;
  const state: GameState | null | undefined = room?.state;
  if (!room || !state) return;
  const role = room.roleOf(session);
  const mySide = role && role !== 'SPECTATOR' ? sideOf(state.config.mode, role) : undefined;
  const hidden = new Set<number>(state.deck.map((c) => c.id));
  for (const [p, hand] of Object.entries(state.hands) as [PlayerId, Card[]][]) {
    if (sideOf(state.config.mode, p) !== mySide) for (const c of hand) hidden.add(c.id);
  }
  for (const c of cardsIn(msg)) if (hidden.has(c.id)) fail(`reveals hidden card ${c.id}`);
  if (msg.type === 'GAME_VIEW') {
    for (const p of Object.keys(msg.view.hands) as PlayerId[]) {
      if (sideOf(state.config.mode, p) !== mySide) fail(`shows ${p}'s hand`);
    }
  }
  const ch = state.challenge;
  if (ch) {
    for (const id of ch.questionIds.slice(ch.index + 1)) {
      if (text.includes(`"${id}"`)) fail(`shows upcoming question ${id}`);
    }
  }
}

type Stats = { messages: number; challenges: number; botMoves: number; timeouts: number };

/** One online game with a spectator, chat, timeouts, a dropped player and the Challenge. */
function playGame(i: number, server: GameServer, clock: ManualScheduler, stats: Stats): void {
  const rnd: Rng = mulberry32(i + 1);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd.next() * xs.length)]!;
  const mode: Mode = i % 2 === 0 ? 'SOLO' : 'TEAM';
  // Small decks and targets make ties, and so the Quantum Challenge, common.
  const settings: Extract<ClientMessage, { type: 'CREATE_ROOM' }>['settings'] =
    i % 3 === 0
      ? {
          targetScore: 2,
          deckCounts: { H: 3, X: 3, Y: 2, Z: 2, S: 2, SX: 2, I: 1, MEASURE: 3, CNOT: 2 },
        }
      : i % 3 === 1
        ? { timeLimitMs: 60_000, turnTimerMs: 10_000 }
        : {};

  const clients = {} as Record<PlayerId, MemClient>;
  const host = new MemClient(server);
  host.say({
    type: 'CREATE_ROOM',
    mode,
    visibility: i % 2 ? 'PUBLIC' : 'PRIVATE',
    name: `Audit ${i}`,
    playerName: 'P1',
    settings,
  });
  const code = host.latest('ROOM_STATE').room.code;
  clients.P1 = host;
  // Joiners take the first free seat: P2, then P3, P4.
  for (const p of [...TURN_ORDER[mode]].sort().filter((s) => s !== 'P1')) {
    const c = new MemClient(server);
    c.say({ type: 'JOIN_ROOM', code, role: 'PLAYER', playerName: p });
    clients[p] = c;
  }
  const spectator = new MemClient(server);
  spectator.say({ type: 'JOIN_ROOM', code, role: 'SPECTATOR', playerName: 'Spec' });
  for (const c of Object.values(clients)) c.say({ type: 'READY', ready: true });
  host.say({ type: 'START_GAME' });
  const room = server.room(code)!;
  expect(room.status).toBe('PLAYING');

  // Every other game, one player drops: a bot takes the seat after 30 s (rules.md §10).
  const dropped = new Set<PlayerId>();
  if (i % 2 === 1) {
    const p = pick(TURN_ORDER[mode].filter((s) => s !== 'P1'));
    server.disconnect(clients[p].session, clients[p]);
    dropped.add(p);
    clock.advance(30_000);
  }

  for (let step = 0; step < 3000 && room.state!.phase !== 'FINISHED'; step++) {
    const state = room.state!;
    if (rnd.next() < 0.05) {
      const p = pick(TURN_ORDER[mode].filter((s) => !dropped.has(s)));
      clients[p].say({ type: 'CHAT', text: `step ${step}` });
    }
    if (state.phase === 'PLAYING') {
      const p = state.turn;
      if (dropped.has(p)) {
        stats.botMoves++;
        clock.advance(1_000);
      } else if (rnd.next() < 0.1) {
        stats.timeouts++;
        clock.advance(state.config.turnTimerMs);
      } else {
        const hand = clients[p].latest('GAME_VIEW').view.hands[p] ?? [];
        clients[p].say({ type: 'PLAY_CARD', cardId: pick(hand).id });
      }
      continue;
    }
    // Quantum Challenge: each side's first connected player answers; bots answer for the rest.
    stats.challenges += state.challenge?.index === 0 ? 1 : 0;
    let anyHuman = false;
    for (const side of ['BLUE', 'RED'] as const) {
      if (state.challenge?.answers[side] !== undefined) continue;
      const p = TURN_ORDER[mode].find((s) => sideOf(mode, s) === side && !dropped.has(s));
      if (!p) continue;
      const q = clients[p].latest('GAME_VIEW').view.challenge!.question;
      clients[p].say({
        type: 'CHALLENGE_ANSWER',
        questionId: q.id,
        choice: Math.floor(rnd.next() * q.choices.length),
      });
      anyHuman = true;
      break;
    }
    if (!anyHuman) clock.advance(1_000);
  }
  expect(room.state!.phase).toBe('FINISHED');
  expect(spectator.latest('GAME_VIEW').view.winner).toBeDefined();
  for (const c of [...Object.values(clients), spectator]) c.say({ type: 'LEAVE' });
}

describe('T-S-03 hidden data audit (rules.md §9)', () => {
  it('no message in 50 online games carries the deck, the seed, opponents’ cards or upcoming questions', () => {
    const leaks: string[] = [];
    const stats: Stats = { messages: 0, challenges: 0, botMoves: 0, timeouts: 0 };
    const clock = new ManualScheduler();
    const server = new GameServer({
      scheduler: clock,
      limits: NO_LIMITS,
      onSend: (session, msg) => {
        stats.messages++;
        audit(session, msg, leaks);
      },
    });
    for (let i = 0; i < 50; i++) playGame(i, server, clock, stats);

    expect(leaks.slice(0, 10)).toEqual([]);
    expect(seeds).toHaveLength(50);
    expect(server.roomCount).toBe(0);
    // The run really covered the risky paths.
    expect(stats.messages).toBeGreaterThan(10_000);
    expect(stats.botMoves).toBeGreaterThan(50);
    expect(stats.timeouts).toBeGreaterThan(50);
    expect(stats.challenges).toBeGreaterThan(0);
  });

  it('the audit itself catches a leak', () => {
    const leaks: string[] = [];
    const clock = new ManualScheduler();
    let leakNext = false;
    const server = new GameServer({
      scheduler: clock,
      onSend: (session, msg) => {
        if (leakNext && msg.type === 'GAME_VIEW' && session.room?.state) {
          // Simulate a server bug: put an opponent's card into the discard pile shown.
          const state = session.room.state;
          const opp = Object.entries(state.hands).find(([p]) => p !== msg.view.viewer)![1]!;
          audit(session, { ...msg, view: { ...msg.view, discard: [opp[0]!] } }, leaks);
          return;
        }
        audit(session, msg, leaks);
      },
    });
    const a = new MemClient(server);
    a.say({ type: 'CREATE_ROOM', mode: 'SOLO', visibility: 'PUBLIC', name: 'R', playerName: 'A' });
    const b = new MemClient(server);
    b.say({
      type: 'JOIN_ROOM',
      code: a.latest('ROOM_STATE').room.code,
      role: 'PLAYER',
      playerName: 'B',
    });
    a.say({ type: 'READY', ready: true });
    b.say({ type: 'READY', ready: true });
    leakNext = true;
    a.say({ type: 'START_GAME' });
    expect(leaks.length).toBeGreaterThan(0);
    expect(leaks[0]).toMatch(/hidden card/);
  });
});
