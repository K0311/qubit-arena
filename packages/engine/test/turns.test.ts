import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/rng';
import { applyAction } from '../src/game';
import { applyCnot, ballPosition, productState } from '../src/quantum';
import type { Action, Card, GameState, PlayerId } from '../src/types';
import { cards, deepFreeze, scenario } from './helpers';

const play = (s: GameState, player: PlayerId, c: Card, seed = 1) =>
  applyAction(s, { type: 'PLAY_CARD', player, cardId: c.id }, mulberry32(seed));

const first = (cs: readonly Card[]) => cs[0] as Card;

describe('turns (rules.md §6)', () => {
  it('T-R-05: played card leaves the hand, goes to discard, player draws back to 4', () => {
    const hand = cards('I', 'X', 'Y', 'Z');
    const deck = cards('S', 'I');
    const s = scenario('SOLO', { turn: 'P1', ball: 'ZERO', hands: { P1: hand }, deck });
    const { state, error } = play(s, 'P1', first(hand));
    expect(error).toBeUndefined();
    const ids = (state.hands.P1 ?? []).map((c) => c.id);
    expect(ids).not.toContain(first(hand).id);
    expect(state.hands.P1).toHaveLength(4);
    expect(ids).toContain(first(deck).id);
    expect(state.deck).toHaveLength(1);
    expect(state.discard.at(-1)).toEqual(first(hand));
  });

  it('T-R-06 / T-R-18: with an empty deck nobody draws; play continues until all hands are empty', () => {
    const p1 = cards('I');
    const p2 = cards('I', 'I');
    let s = scenario('SOLO', {
      turn: 'P1',
      ball: 'ZERO',
      hands: { P1: p1, P2: p2 },
      deck: [],
      score: { BLUE: 1, RED: 0 },
    });
    s = play(s, 'P1', first(p1)).state;
    expect(s.hands.P1).toHaveLength(0);
    expect(s.phase).toBe('PLAYING');
    expect(s.turn).toBe('P2');
    s = play(s, 'P2', first(p2)).state;
    // P1 has no cards left, so the turn goes straight back to P2.
    expect(s.turn).toBe('P2');
    const last = applyAction(
      s,
      { type: 'PLAY_CARD', player: 'P2', cardId: (p2[1] as Card).id },
      mulberry32(1),
    );
    expect(last.state.phase).toBe('FINISHED');
    expect(last.state.endReason).toBe('NO_CARDS');
    expect(last.state.winner).toBe('BLUE');
  });

  it('T-R-07: wrong player acts → rejected, state unchanged', () => {
    const s = scenario('SOLO', { turn: 'P1' });
    const c = first(s.hands.P2 ?? []);
    const res = play(s, 'P2', c);
    expect(res.error?.code).toBe('NOT_YOUR_TURN');
    expect(res.state).toBe(s);
    expect(res.events).toEqual([]);
  });

  it('T-R-08: card not in hand → rejected', () => {
    const s = scenario('SOLO', { turn: 'P1' });
    const res = applyAction(s, { type: 'PLAY_CARD', player: 'P1', cardId: 99_999 }, mulberry32(1));
    expect(res.error?.code).toBe('CARD_NOT_IN_HAND');
    expect(res.state).toBe(s);
  });

  it('T-R-09: there is no pass action', () => {
    const s = scenario('SOLO', { turn: 'P1' });
    const pass = { type: 'PASS', player: 'P1' } as unknown as Action;
    const res = applyAction(s, pass, mulberry32(1));
    expect(res.error?.code).toBe('UNKNOWN_ACTION');
    expect(res.state).toBe(s);
  });

  it('rejects a player who is not seated (P3 in Solo)', () => {
    const s = scenario('SOLO', { turn: 'P1' });
    const res = applyAction(s, { type: 'PLAY_CARD', player: 'P3', cardId: 1 }, mulberry32(1));
    expect(res.error?.code).toBe('NOT_YOUR_TURN');
  });

  it('never mutates the input state', () => {
    const hand = cards('H', 'X', 'Y', 'Z');
    const s = deepFreeze(scenario('TEAM', { turn: 'P1', ball: 'ZERO', hands: { P1: hand } }));
    expect(() => play(s, 'P1', first(hand))).not.toThrow();
  });

  it('T-R-23: turn timer → a random single-qubit card from the hand', () => {
    for (let seed = 0; seed < 200; seed++) {
      const hand = cards('MEASURE', 'CNOT', 'X', 'MEASURE');
      const s = scenario('SOLO', { turn: 'P1', ball: 'ZERO', hands: { P1: hand } });
      const { state, events } = applyAction(s, { type: 'TIMEOUT', player: 'P1' }, mulberry32(seed));
      const played = events.find((e) => e.type === 'CARD_PLAYED');
      expect(played).toMatchObject({ card: { kind: 'X' }, byTimeout: true });
      expect(state.turn).toBe('P2');
    }
  });

  it('T-R-23: with no single-qubit card, the timer plays a random card', () => {
    const hand = cards('MEASURE', 'CNOT');
    const s = scenario('SOLO', { turn: 'P1', ball: 'ZERO', hands: { P1: hand } });
    const { events } = applyAction(s, { type: 'TIMEOUT', player: 'P1' }, mulberry32(4));
    const played = events.find((e) => e.type === 'CARD_PLAYED');
    expect(['MEASURE', 'CNOT']).toContain(
      (played as { card: Card } | undefined)?.card.kind ?? 'none',
    );
  });

  it('T-R-23: a timeout for the wrong player is rejected', () => {
    const s = scenario('SOLO', { turn: 'P1' });
    expect(applyAction(s, { type: 'TIMEOUT', player: 'P2' }, mulberry32(1)).error?.code).toBe(
      'NOT_YOUR_TURN',
    );
  });
});

describe('scoring (rules.md §7)', () => {
  it('T-R-10: Blue moves the ball into PLUS on a Blue turn → Blue +1, Blue kicks off', () => {
    const hand = cards('H', 'I', 'I', 'I');
    const s = scenario('SOLO', { turn: 'P1', ball: 'ZERO', hands: { P1: hand } });
    const { state, events } = play(s, 'P1', first(hand));
    expect(state.score).toEqual({ BLUE: 1, RED: 0 });
    expect(events.find((e) => e.type === 'TOUCHDOWN')).toMatchObject({ side: 'BLUE' });
    expect(events.find((e) => e.type === 'KICKOFF')).toMatchObject({ side: 'BLUE' });
  });

  it('T-R-11: Blue moves the ball into MINUS (Red zone) → no score', () => {
    const hand = cards('H', 'I', 'I', 'I');
    const s = scenario('SOLO', { turn: 'P1', ball: 'ONE', hands: { P1: hand } });
    const { state, events } = play(s, 'P1', first(hand));
    expect(ballPosition(state.qubits)).toBe('MINUS');
    expect(state.score).toEqual({ BLUE: 0, RED: 0 });
    expect(events.some((e) => e.type === 'TOUCHDOWN')).toBe(false);
  });

  it('T-R-12: ball already at PLUS, Blue plays I → no score', () => {
    const hand = cards('I', 'I', 'I', 'I');
    const s = scenario('SOLO', { turn: 'P1', ball: 'PLUS', hands: { P1: hand } });
    const { state } = play(s, 'P1', first(hand));
    expect(ballPosition(state.qubits)).toBe('PLUS');
    expect(state.score).toEqual({ BLUE: 0, RED: 0 });
  });

  it('T-R-13: ball at MINUS (pushed by Blue), Red plays a card that leaves it there → no score', () => {
    const hand = cards('I', 'I', 'I', 'I');
    const s = scenario('SOLO', { turn: 'P2', ball: 'MINUS', hands: { P2: hand } });
    const { state } = play(s, 'P2', first(hand));
    expect(ballPosition(state.qubits)).toBe('MINUS');
    expect(state.score).toEqual({ BLUE: 0, RED: 0 });
  });

  it('T-R-14: ball in the fog never scores', () => {
    const hand = cards('H', 'I', 'I', 'I');
    const fog = applyCnot(productState('PLUS', 'ZERO'));
    const s = { ...scenario('SOLO', { turn: 'P1', hands: { P1: hand } }), qubits: fog };
    const { state, events } = play(s, 'P1', first(hand));
    expect(ballPosition(state.qubits)).toBe('FOG');
    expect(events.some((e) => e.type === 'TOUCHDOWN')).toBe(false);
  });

  it('T-R-15: Measure at ZERO is a failed punt: nothing changes, the turn is used', () => {
    const hand = cards('MEASURE', 'I', 'I', 'I');
    const s = scenario('SOLO', { turn: 'P1', ball: 'ZERO', hands: { P1: hand } });
    const { state, events } = play(s, 'P1', first(hand));
    expect(ballPosition(state.qubits)).toBe('ZERO');
    expect(state.turn).toBe('P2');
    expect(state.discard.at(-1)?.kind).toBe('MEASURE');
    expect(events.find((e) => e.type === 'MEASURED')).toMatchObject({ outcome: 'ZERO' });
  });
});

describe('end of game (rules.md §8)', () => {
  it('T-R-16: reaching the target score finishes the game (TARGET)', () => {
    const hand = cards('H', 'I', 'I', 'I');
    const s = scenario('SOLO', {
      turn: 'P1',
      ball: 'ZERO',
      hands: { P1: hand },
      score: { BLUE: 6, RED: 3 },
    });
    const { state, events } = play(s, 'P1', first(hand));
    expect(state.phase).toBe('FINISHED');
    expect(state.endReason).toBe('TARGET');
    expect(state.winner).toBe('BLUE');
    expect(events.some((e) => e.type === 'KICKOFF')).toBe(false);
    expect(events.at(-1)).toMatchObject({ type: 'GAME_OVER', reason: 'TARGET', winner: 'BLUE' });
  });

  it('T-R-17: time limit → the game ends after the current turn (TIME)', () => {
    const hand = cards('I', 'I', 'I', 'I');
    let s = scenario('SOLO', {
      turn: 'P1',
      ball: 'ZERO',
      hands: { P1: hand },
      score: { BLUE: 2, RED: 1 },
    });
    s = applyAction(s, { type: 'TIME_UP' }, mulberry32(1)).state;
    expect(s.phase).toBe('PLAYING');
    const { state } = play(s, 'P1', first(hand));
    expect(state.phase).toBe('FINISHED');
    expect(state.endReason).toBe('TIME');
    expect(state.winner).toBe('BLUE');
  });

  it('T-R-19: a tie at the end goes to the Quantum Challenge', () => {
    const hand = cards('I', 'I', 'I', 'I');
    let s = scenario('TEAM', { turn: 'P1', ball: 'ZERO', hands: { P1: hand } });
    s = applyAction(s, { type: 'TIME_UP' }, mulberry32(1)).state;
    const { state, events } = play(s, 'P1', first(hand));
    expect(state.phase).toBe('CHALLENGE');
    expect(state.challenge).toBeDefined();
    expect(events.some((e) => e.type === 'CHALLENGE_STARTED')).toBe(true);
  });

  it('rejects card plays once the game is over', () => {
    const hand = cards('H', 'I', 'I', 'I');
    const s = scenario('SOLO', {
      turn: 'P1',
      ball: 'ZERO',
      hands: { P1: hand },
      score: { BLUE: 6, RED: 0 },
    });
    const done = play(s, 'P1', first(hand)).state;
    const again = applyAction(done, { type: 'PLAY_CARD', player: 'P2', cardId: 1 }, mulberry32(1));
    expect(again.error?.code).toBe('WRONG_PHASE');
  });
});
