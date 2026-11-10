import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/rng';
import { createGame, defaultConfig } from '../src/game';
import { checkInvariants } from '../src/invariants';
import { c } from '../src/complex';
import type { GameState } from '../src/types';

// The simulation trusts checkInvariants, so make sure it really catches each broken rule.
describe('checkInvariants (architecture.md §4.3)', () => {
  const ok = createGame(defaultConfig('SOLO'), mulberry32(2)).state;
  const hand = ok.hands.P1 ?? [];

  it('passes a fresh game', () => {
    expect(checkInvariants(ok)).toEqual([]);
  });

  it.each<[string, GameState, RegExp]>([
    ['a lost card', { ...ok, deck: ok.deck.slice(1) }, /card count/],
    ['a duplicated card', { ...ok, deck: [...ok.deck.slice(1), hand[0] as never] }, /duplicate/],
    [
      'a hand over 4',
      {
        ...ok,
        hands: { ...ok.hands, P1: [...hand, ...ok.deck.slice(0, 1)] },
        deck: ok.deck.slice(1),
      },
      /over the limit/,
    ],
    ['an unnormalised state', { ...ok, qubits: [c(1), c(1), c(0), c(0)] }, /normalised/],
    [
      'a partially entangled ball',
      { ...ok, qubits: [c(Math.cos(0.3)), c(0), c(0), c(Math.sin(0.3))] },
      /Clifford invariant/,
    ],
  ])('detects %s', (_, broken, message) => {
    expect(checkInvariants(broken).join('\n')).toMatch(message);
  });

  it('detects a decreasing score, a +2 jump and scoring on the other side’s turn', () => {
    const prev: GameState = { ...ok, turn: 'P1', score: { BLUE: 2, RED: 2 } };
    expect(checkInvariants({ ...prev, score: { BLUE: 1, RED: 2 } }, prev).join()).toMatch(
      /decreased/,
    );
    expect(checkInvariants({ ...prev, score: { BLUE: 4, RED: 2 } }, prev).join()).toMatch(
      /more than 1/,
    );
    expect(checkInvariants({ ...prev, score: { BLUE: 2, RED: 3 } }, prev).join()).toMatch(
      /other side/,
    );
    expect(checkInvariants({ ...prev, score: { BLUE: 3, RED: 2 } }, prev)).toEqual([]);
  });
});
