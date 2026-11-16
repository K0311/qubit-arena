import { describe, expect, it } from 'vitest';
import { botAction } from '../src/bot';
import { applyAction, createGame, defaultConfig } from '../src/game';
import { applyCnot, productState } from '../src/quantum';
import { mulberry32 } from '../src/rng';
import { sideOf } from '../src/seats';
import type { Card, GameState, Mode, PlayerId, Side } from '../src/types';
import { cards, scenario } from './helpers';

const kindOf = (s: GameState, p: PlayerId, action: ReturnType<typeof botAction>) => {
  expect(action?.type).toBe('PLAY_CARD');
  const id = (action as { cardId: number }).cardId;
  return (s.hands[p] as readonly Card[]).find((c) => c.id === id)?.kind;
};

describe('P-6.4 greedy bot (NORMAL level)', () => {
  it('(1) takes a touchdown when a card scores one', () => {
    // Blue scores at |+⟩; from |0⟩ only H gets there (rules.md §3.2).
    const s = scenario('SOLO', {
      turn: 'P1',
      ball: 'ZERO',
      hands: { P1: cards('X', 'Z', 'H', 'I') },
    });
    for (let seed = 1; seed <= 20; seed++) {
      expect(kindOf(s, 'P1', botAction(s, 'P1', mulberry32(seed), 'NORMAL'))).toBe('H');
    }
  });

  it('(2) leaves the fog when a position is better than staying in it', () => {
    // Football |0⟩ + CNOT with the partner at |+⟩ → fog (rules.md §4.3); a second CNOT undoes it.
    const s: GameState = {
      ...scenario('SOLO', { turn: 'P1', hands: { P1: cards('I', 'CNOT', 'Z', 'S') } }),
      qubits: applyCnot(productState('PLUS', 'ZERO')),
    };
    expect(kindOf(s, 'P1', botAction(s, 'P1', mulberry32(1), 'NORMAL'))).toBe('CNOT');
  });

  it('(3) moves one step closer to its own end zone', () => {
    // Red's end zone is |−⟩. From |0⟩: X → |1⟩ (one H away from |−⟩); I stays two steps away.
    const s = scenario('SOLO', { turn: 'P2', ball: 'ZERO', hands: { P2: cards('I', 'X') } });
    expect(kindOf(s, 'P2', botAction(s, 'P2', mulberry32(1), 'NORMAL'))).toBe('X');
  });

  it('(4) keeps the ball away from the other side’s end zone', () => {
    // Red, ball |0⟩: H → |+⟩ (Blue's zone) or X → |1⟩; both are one step from |−⟩.
    const s = scenario('SOLO', { turn: 'P2', ball: 'ZERO', hands: { P2: cards('H', 'X') } });
    for (let seed = 1; seed <= 20; seed++) {
      expect(kindOf(s, 'P2', botAction(s, 'P2', mulberry32(seed), 'NORMAL'))).toBe('X');
    }
  });

  it('breaks ties with the RNG', () => {
    const s = scenario('SOLO', {
      turn: 'P1',
      ball: 'ZERO',
      hands: { P1: cards('I', 'I', 'I', 'I') },
    });
    const picked = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      picked.add((botAction(s, 'P1', mulberry32(seed), 'NORMAL') as { cardId: number }).cardId);
    }
    expect(picked.size).toBeGreaterThan(1);
  });

  it('EASY stays the random v1 bot (rules.md §10) and is the default', () => {
    const s = scenario('SOLO', {
      turn: 'P1',
      ball: 'ZERO',
      hands: { P1: cards('X', 'Z', 'H', 'I') },
    });
    const easy = new Set<string | undefined>();
    for (let seed = 1; seed <= 40; seed++) {
      expect(botAction(s, 'P1', mulberry32(seed))).toEqual(
        botAction(s, 'P1', mulberry32(seed), 'EASY'),
      );
      easy.add(kindOf(s, 'P1', botAction(s, 'P1', mulberry32(seed), 'EASY')));
    }
    expect(easy.size).toBeGreaterThan(1);
  });

  it('beats the random bot in more than 60 % of 1,000 games', () => {
    const play = (mode: Mode, seed: number, greedy: Side) => {
      const rng = mulberry32(seed);
      let state = createGame(defaultConfig(mode), rng).state;
      for (let step = 0; step < 2_000 && state.phase !== 'FINISHED'; step++) {
        const p =
          state.phase === 'PLAYING'
            ? state.turn
            : (['P1', 'P2', 'P3', 'P4'] as const).find(
                (q) =>
                  (mode === 'TEAM' || q === 'P1' || q === 'P2') &&
                  state.challenge?.answers[sideOf(mode, q)] === undefined,
              );
        if (!p) break;
        const level = sideOf(mode, p) === greedy ? 'NORMAL' : 'EASY';
        const action = botAction(state, p, rng, level);
        if (!action) break;
        state = applyAction(state, action, rng).state;
      }
      return state.winner;
    };
    let wins = 0;
    const games = 1_000;
    for (let i = 0; i < games; i++) {
      // Half the games each side is greedy, so the opening roll and seat order even out.
      const greedy: Side = i % 2 === 0 ? 'BLUE' : 'RED';
      if (play(i % 4 < 2 ? 'SOLO' : 'TEAM', i + 1, greedy) === greedy) wins++;
    }
    expect(wins / games).toBeGreaterThan(0.6);
  });
});
