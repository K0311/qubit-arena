import { describe, expect, it } from 'vitest';
import {
  applyAction,
  botAction,
  createGame,
  defaultConfig,
  FIRST_PLAYER,
  mulberry32,
  type GameState,
  type PlayerId,
  type Side,
} from '@qa/engine';
import { GameServer } from '../src/game-server';
import { ManualScheduler } from '../src/scheduler';
import { MemClient, NO_LIMITS } from './mem-client';

/** A Team game that reached the Quantum Challenge, played out by engine bots. */
function challengeState(): GameState {
  // Small decks and a low target make tied games, and so the Challenge, common.
  const config = {
    ...defaultConfig('TEAM'),
    targetScore: 2,
    deckCounts: { H: 3, X: 3, Y: 2, Z: 2, S: 2, SX: 2, I: 1, MEASURE: 3, CNOT: 2 },
  };
  for (let seed = 1; seed < 500; seed++) {
    const rng = mulberry32(seed);
    let state = createGame(config, rng).state;
    while (state.phase === 'PLAYING') {
      const action = botAction(state, state.turn, rng);
      if (!action) break;
      state = applyAction(state, action, rng).state;
    }
    if (state.phase === 'CHALLENGE') return state;
  }
  throw new Error('no seed reached the Challenge');
}

function setup() {
  const clock = new ManualScheduler();
  const server = new GameServer({ scheduler: clock, limits: NO_LIMITS });
  const clients = {} as Record<PlayerId, MemClient>;
  clients.P1 = new MemClient(server);
  clients.P1.say({
    type: 'CREATE_ROOM',
    mode: 'TEAM',
    visibility: 'PRIVATE',
    name: 'R',
    playerName: 'P1',
  });
  const code = clients.P1.latest('ROOM_STATE').room.code;
  for (const p of ['P2', 'P3', 'P4'] as const) {
    clients[p] = new MemClient(server);
    clients[p].say({ type: 'JOIN_ROOM', code, role: 'PLAYER', playerName: p });
  }
  for (const c of Object.values(clients)) c.say({ type: 'READY', ready: true });
  clients.P1.say({ type: 'START_GAME' });
  const room = server.room(code)!;
  // Jump straight to the tie-breaker.
  room.state = challengeState();
  const answered = (side: Side) => room.state!.challenge?.answers[side] !== undefined;
  const index = () => room.state!.challenge?.index;
  return { server, clock, clients, room, answered, index };
}

describe('T-S-10 Quantum Challenge bots (rules.md §8.1)', () => {
  it('a bot answers for its side only when that side has no connected human', () => {
    const { server, clock, clients, room, answered, index } = setup();
    expect(room.state!.phase).toBe('CHALLENGE');
    expect(FIRST_PLAYER.TEAM.BLUE).toBe('P1');

    // Blue: P2 drops and becomes a bot, but P1 is still here, so Blue waits for P1.
    clients.P2.drop();
    clock.advance(30_000);
    expect(room.seats.get('P2')?.bot).toBe(true);
    clock.advance(5_000);
    expect(answered('BLUE')).toBe(false);

    // Red: both players drop; once their bots are on, a bot answers for Red.
    clients.P3.drop();
    clients.P4.drop();
    clock.advance(30_000);
    clock.advance(1_000);
    expect(index()).toBe(0);
    expect(answered('RED')).toBe(true);
    expect(answered('BLUE')).toBe(false);

    // P1 drops too: Blue has no connected human now, so the P2 bot answers.
    const token = clients.P1.session.token;
    clients.P1.drop();
    clock.advance(1_000);
    expect(index()).toBe(1);

    // P1 comes back: the bots stop answering for Blue again; Red's bots go on.
    new MemClient(server, token);
    clock.advance(5_000);
    expect(index()).toBe(1);
    expect(answered('RED')).toBe(true);
    expect(answered('BLUE')).toBe(false);
  });

  it('a human answer still counts while a teammate is a bot', () => {
    const { clock, clients, room, answered, index } = setup();
    clients.P2.drop();
    clock.advance(31_000);
    expect(answered('BLUE')).toBe(false);
    // The test jumped the state, so P1 has no view of the question yet: read the live id.
    const id = room.state!.challenge!.questionIds[index()!]!;
    clients.P1.say({ type: 'CHALLENGE_ANSWER', questionId: id, choice: 0 });
    expect(answered('BLUE')).toBe(true);
  });
});
