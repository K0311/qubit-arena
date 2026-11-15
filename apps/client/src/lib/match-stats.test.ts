import { describe, expect, it } from 'vitest';
import type { BallPosition, Card, GameEvent } from '@qa/engine';
import { matchStats } from './match-stats';

const play = (
  player: 'P1' | 'P2',
  kind: Card['kind'],
  from: BallPosition,
  to: BallPosition,
): GameEvent => ({
  type: 'CARD_PLAYED',
  player,
  card: { id: 1, kind },
  from,
  to,
  byTimeout: false,
});

describe('result stats from the log (ui-spec §10)', () => {
  it('counts cards, touchdowns, Measure, CNOT, entanglements, failed punts and fog time', () => {
    const log: GameEvent[] = [
      { type: 'KICKOFF', ball: 'ZERO' },
      play('P1', 'CNOT', 'ZERO', 'FOG'),
      play('P2', 'X', 'FOG', 'FOG'),
      play('P1', 'MEASURE', 'FOG', 'ONE'),
      { type: 'MEASURED', outcome: 'ONE' },
      play('P2', 'MEASURE', 'ONE', 'ONE'),
      { type: 'MEASURED', outcome: 'ONE' },
      play('P1', 'H', 'ONE', 'MINUS'),
      play('P2', 'Z', 'MINUS', 'PLUS'),
      { type: 'TOUCHDOWN', side: 'BLUE', player: 'P2' },
      { type: 'GAME_OVER', reason: 'TARGET', winner: 'BLUE' },
    ];
    const ms = [900, 890, 880, 850, 850, 840, 840, 830, 820, 820, 820].map((s) => s * 1000);
    const st = matchStats(log, ms);
    expect(st.turns).toBe(6);
    expect(st.entanglements).toBe(1);
    expect(st.failedPunts).toBe(1);
    expect(st.longestFogMs).toBe(40_000);
    expect(st.players.P1).toEqual({ touchdowns: 0, cards: 3, measures: 1, cnots: 1 });
    expect(st.players.P2).toEqual({ touchdowns: 1, cards: 3, measures: 1, cnots: 0 });
    expect(st.challenge).toBeNull();
  });

  it('adds up Quantum Challenge points', () => {
    const st = matchStats([
      { type: 'CHALLENGE_STARTED', questions: 5 },
      {
        type: 'CHALLENGE_RESULT',
        questionId: 'a',
        correctChoice: 0,
        correct: { BLUE: true, RED: false },
        explanation: 'x',
      },
      {
        type: 'CHALLENGE_RESULT',
        questionId: 'b',
        correctChoice: 1,
        correct: { BLUE: true, RED: true },
        explanation: 'y',
      },
    ]);
    expect(st.challenge).toEqual({ BLUE: 2, RED: 1 });
    expect(st.longestFogMs).toBeNull();
  });
});
