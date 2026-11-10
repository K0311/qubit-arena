import { describe, expect, it } from 'vitest';
import { botAction } from '../src/bot';
import { applyAction } from '../src/game';
import { mulberry32 } from '../src/rng';
import type { Card, GameState, Mode } from '../src/types';
import { cards, scenario } from './helpers';

/** Reach the CHALLENGE phase: 0–0, time up, one more card. */
function toChallenge(mode: Mode): GameState {
  const hand = cards('I', 'I', 'I', 'I');
  let s = scenario(mode, { turn: 'P1', ball: 'ZERO', hands: { P1: hand } });
  s = applyAction(s, { type: 'TIME_UP' }, mulberry32(1)).state;
  return applyAction(
    s,
    { type: 'PLAY_CARD', player: 'P1', cardId: (hand[0] as Card).id },
    mulberry32(1),
  ).state;
}

describe('bot seats (rules.md §8.1, §10)', () => {
  describe('in the Quantum Challenge', () => {
    it('human P1 vs bot P2: the bot answers for its own side while Blue is still thinking', () => {
      const s = toChallenge('SOLO');
      const action = botAction(s, 'P2', mulberry32(3));
      expect(action).toMatchObject({ type: 'CHALLENGE_ANSWER', player: 'P2' });

      const res = applyAction(s, action as NonNullable<typeof action>, mulberry32(3));
      expect(res.error).toBeUndefined();
      expect(res.state.challenge?.answers.RED).toBeDefined();
      expect(res.state.challenge?.answers.BLUE).toBeUndefined();
    });

    it('Team: a bot in seat P2 answers as P2, not as the first player of its side', () => {
      expect(botAction(toChallenge('TEAM'), 'P2', mulberry32(3))).toMatchObject({ player: 'P2' });
    });

    it('does nothing once its side has answered', () => {
      const s = toChallenge('SOLO');
      const first = botAction(s, 'P2', mulberry32(3));
      const after = applyAction(s, first as NonNullable<typeof first>, mulberry32(3)).state;
      expect(botAction(after, 'P2', mulberry32(4))).toBeNull();
    });
  });

  describe('while playing', () => {
    it('plays a card from its own hand on its turn', () => {
      const hand = cards('H', 'X', 'Y', 'Z');
      const s = scenario('SOLO', { turn: 'P2', hands: { P2: hand } });
      const action = botAction(s, 'P2', mulberry32(5));
      expect(action).toMatchObject({ type: 'PLAY_CARD', player: 'P2' });
      expect(hand.map((c) => c.id)).toContain((action as { cardId: number }).cardId);
    });

    it('does nothing when it is not its turn', () => {
      expect(botAction(scenario('SOLO', { turn: 'P1' }), 'P2', mulberry32(5))).toBeNull();
    });
  });

  it('does nothing when the game is over', () => {
    const finished: GameState = { ...scenario('SOLO'), phase: 'FINISHED' };
    expect(botAction(finished, 'P1', mulberry32(5))).toBeNull();
  });
});
