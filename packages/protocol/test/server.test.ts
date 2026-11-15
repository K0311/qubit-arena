import { describe, expect, it } from 'vitest';
import {
  applyAction,
  botAction,
  createGame,
  defaultConfig,
  FIRST_PLAYER,
  mulberry32,
  TURN_ORDER,
  viewFor,
  type GameState,
  type Mode,
  type PlayerId,
} from '@qa/engine';
import {
  encodeMessage,
  parseServerMessage,
  PROTOCOL_VERSION,
  type ServerMessage,
} from '../src/index';

const gameView = (state: GameState, viewer: PlayerId | 'SPECTATOR', stateVersion = 1) => ({
  type: 'GAME_VIEW' as const,
  stateVersion,
  view: viewFor(state, viewer),
  clocks: { gameMs: 600_000, turnMs: 45_000, logGameMs: state.log.map(() => 900_000) },
});

const accept = (msg: unknown) => {
  const res = parseServerMessage(msg);
  if (!res.ok) throw new Error(res.error);
  return res.msg;
};
const reject = (msg: unknown) => expect(parseServerMessage(msg).ok).toBe(false);

/** Plays one bot game and yields every GAME_VIEW and EVENT the server would send. */
function* serverTraffic(mode: Mode, seed: number): Generator<unknown> {
  const rng = mulberry32(seed);
  let state = createGame(defaultConfig(mode), rng).state;
  for (let version = 1; state.phase !== 'FINISHED' && version < 2000; version++) {
    const seat =
      state.phase === 'PLAYING'
        ? state.turn
        : FIRST_PLAYER[mode][state.challenge?.answers.BLUE === undefined ? 'BLUE' : 'RED'];
    const action = botAction(state, seat, rng);
    if (!action) throw new Error('bot had no action');
    const res = applyAction(state, action, rng);
    state = res.state;
    yield { type: 'EVENT', stateVersion: version, events: res.events };
    for (const viewer of [...TURN_ORDER[mode], 'SPECTATOR'] as const) {
      yield gameView(state, viewer, version);
    }
  }
}

describe('server → client messages (architecture.md §5)', () => {
  it.each([
    ['SOLO', 1],
    ['SOLO', 2],
    ['TEAM', 3],
    ['TEAM', 4],
  ] as const)('every GAME_VIEW and EVENT of a whole %s game parses (seed %i)', (mode, seed) => {
    let count = 0;
    for (const msg of serverTraffic(mode, seed)) {
      accept(msg);
      accept(JSON.parse(encodeMessage(msg as ServerMessage)));
      count++;
    }
    expect(count).toBeGreaterThan(20);
  });

  it('accepts views mid-Challenge and after the game (questions, winner, end reason)', () => {
    // Long games with ties reach the Challenge; keep playing seeds until one does.
    let sawChallenge = false;
    for (let seed = 10; seed < 60 && !sawChallenge; seed++) {
      for (const msg of serverTraffic('SOLO', seed)) {
        const m = accept(msg);
        if (m.type === 'GAME_VIEW' && m.view.challenge) sawChallenge = true;
      }
    }
    expect(sawChallenge).toBe(true);
  });

  describe('hidden data (rules.md §9, safety net for T-S-03)', () => {
    const state = createGame(defaultConfig('TEAM'), mulberry32(7)).state;
    const view = viewFor(state, 'P1');
    const clocks = { gameMs: 0, turnMs: null, logGameMs: [] };

    it('rejects a GAME_VIEW that carries the deck or the seed', () => {
      reject({ type: 'GAME_VIEW', stateVersion: 1, clocks, view: { ...view, deck: state.deck } });
      reject({ type: 'GAME_VIEW', stateVersion: 1, clocks, view: { ...view, seed: 1234 } });
      reject({
        type: 'GAME_VIEW',
        stateVersion: 1,
        clocks,
        view: { ...view, challenge: undefined, x: 1 },
      });
    });

    it('rejects a Challenge view that leaks the answer', () => {
      const challenge = {
        index: 0,
        scores: { BLUE: 0, RED: 0 },
        answered: { BLUE: false, RED: false },
        question: { id: 'q', prompt: 'p', choices: ['a', 'b'], answer: 1 },
      };
      reject({ type: 'GAME_VIEW', stateVersion: 1, clocks, view: { ...view, challenge } });
    });
  });

  describe('GAME_VIEW clocks (ui-spec §7.1 clocks, §7.5 log times)', () => {
    const state = createGame(defaultConfig('SOLO'), mulberry32(1)).state;
    const base = gameView(state, 'P1');

    it('accepts a running turn and a turn with no timer', () => {
      accept(base);
      accept({ ...base, clocks: { ...base.clocks, turnMs: null } });
    });

    it('rejects a view without clocks, negative times or extra fields', () => {
      const noClocks: Partial<typeof base> = { ...base };
      delete noClocks.clocks;
      reject(noClocks);
      reject({ ...base, clocks: { ...base.clocks, gameMs: -1 } });
      reject({ ...base, clocks: { ...base.clocks, logGameMs: [-5] } });
      reject({ ...base, clocks: { ...base.clocks, seed: 1 } });
    });
  });

  it('requires stateVersion on GAME_VIEW, EVENT and ROOM_STATE', () => {
    const state = createGame(defaultConfig('SOLO'), mulberry32(1)).state;
    reject({ type: 'GAME_VIEW', view: viewFor(state, 'P1') });
    reject({ type: 'EVENT', events: [{ type: 'TIME_UP' }] });
    reject({ type: 'GAME_VIEW', stateVersion: -1, view: viewFor(state, 'P1') });
  });

  const room = {
    code: 'QX7-42',
    name: 'Room A',
    mode: 'TEAM' as const,
    visibility: 'PUBLIC' as const,
    status: 'WAITING' as const,
    settings: { ...defaultConfig('TEAM') },
    seats: {
      P1: { name: 'Ann', ready: true, connected: true, bot: false, host: true },
      P2: null,
      P3: { name: 'Bot 1', ready: true, connected: true, bot: true, host: false },
      P4: { name: 'Cy', ready: false, connected: false, bot: false, host: false },
    },
    spectators: 2,
  };

  it.each<[string, ServerMessage]>([
    ['WELCOME', { type: 'WELCOME', protocolVersion: PROTOCOL_VERSION, token: 'a'.repeat(32) }],
    ['ROOM_STATE', { type: 'ROOM_STATE', stateVersion: 3, room, you: { seat: 'P1', host: true } }],
    [
      'ROOM_STATE (spectator)',
      { type: 'ROOM_STATE', stateVersion: 3, room, you: { seat: 'SPECTATOR', host: false } },
    ],
    ['CHAT', { type: 'CHAT', from: 'P2', name: 'Bo', text: 'measure now', at: 1_700_000_000_000 }],
    ['ERROR (engine code)', { type: 'ERROR', code: 'NOT_YOUR_TURN', message: "it is P3's turn" }],
    ['ERROR (protocol code)', { type: 'ERROR', code: 'ROOM_NOT_FOUND', message: 'no such room' }],
    ['PONG', { type: 'PONG', t: 123 }],
    [
      'ROOM_LIST',
      {
        type: 'ROOM_LIST',
        rooms: [
          {
            code: 'QX7-42',
            name: 'Room A',
            mode: 'TEAM',
            status: 'WAITING',
            players: 3,
            seats: 4,
            spectators: 0,
            settings: { ...defaultConfig('TEAM') },
          },
        ],
      },
    ],
    ['ROOM_LIST (empty)', { type: 'ROOM_LIST', rooms: [] }],
  ])('accepts a valid %s', (_, msg) => {
    expect(accept(msg)).toEqual(msg);
  });

  it('rejects malformed server messages', () => {
    reject({ type: 'ERROR', code: 'SOMETHING_ELSE', message: 'x' });
    reject({ type: 'WELCOME', protocolVersion: PROTOCOL_VERSION, token: 'short' });
    reject({
      type: 'ROOM_STATE',
      stateVersion: 1,
      room: { ...room, seats: { P5: null } },
      you: { seat: null, host: false },
    });
    reject({ type: 'CHAT', from: 'P1', name: 'a', text: 'x'.repeat(201), at: 1 });
    // A room summary never says who sits where or carries a token.
    reject({ type: 'ROOM_LIST', rooms: [{ ...room, players: 1, seats: 2 }] });
    reject('{"type":');
  });
});
