import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/rng';
import { applyAction, sideOf } from '../src/game';
import { QUESTION_BANK, questionById } from '../src/challenge';
import { GATE_TABLE } from '../src/gates';
import { POSITIONS } from '../src/states';
import type { GameConfig, GameState, Mode, PlayerId, Side } from '../src/types';
import { cards, scenario } from './helpers';

/** Reach the CHALLENGE phase: 0–0, time up, one more card. */
function toChallenge(mode: Mode, config: Partial<GameConfig> = {}): GameState {
  const hand = cards('I', 'I', 'I', 'I');
  let s = scenario(mode, { config, turn: 'P1', ball: 'ZERO', hands: { P1: hand } });
  s = applyAction(s, { type: 'TIME_UP' }, mulberry32(1)).state;
  s = applyAction(
    s,
    { type: 'PLAY_CARD', player: 'P1', cardId: (hand[0] as { id: number }).id },
    mulberry32(1),
  ).state;
  expect(s.phase).toBe('CHALLENGE');
  return s;
}

const current = (s: GameState) => {
  const ch = s.challenge;
  if (!ch) throw new Error('no challenge');
  return questionById(ch.questionIds[ch.index] as string);
};

/** Both sides answer the current question; `right` says who answers correctly. */
function answerRound(s: GameState, right: Record<Side, boolean>): GameState {
  const q = current(s);
  const wrong = (q.answer + 1) % q.choices.length;
  const answerer: Record<Side, PlayerId> =
    s.config.mode === 'SOLO' ? { BLUE: 'P1', RED: 'P2' } : { BLUE: 'P2', RED: 'P3' };
  for (const side of ['BLUE', 'RED'] as const) {
    const res = applyAction(
      s,
      {
        type: 'CHALLENGE_ANSWER',
        player: answerer[side],
        questionId: q.id,
        choice: right[side] ? q.answer : wrong,
      },
      mulberry32(2),
    );
    expect(res.error).toBeUndefined();
    s = res.state;
  }
  return s;
}

describe('question bank (rules.md §8.1)', () => {
  it('has at least 20 well-formed questions with unique ids', () => {
    expect(QUESTION_BANK.length).toBeGreaterThanOrEqual(20);
    expect(new Set(QUESTION_BANK.map((q) => q.id)).size).toBe(QUESTION_BANK.length);
    for (const q of QUESTION_BANK) {
      expect(q.choices.length).toBeGreaterThanOrEqual(2);
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBeLessThan(q.choices.length);
      expect(new Set(q.choices).size, q.id).toBe(q.choices.length);
    }
  });

  it('gate questions agree with GATE_TABLE', () => {
    const gateQs = QUESTION_BANK.filter((q) => q.gate !== undefined);
    expect(gateQs.length).toBeGreaterThan(0);
    for (const q of gateQs) {
      if (!q.gate || !q.from) throw new Error(q.id);
      expect(POSITIONS[q.answer]).toBe(GATE_TABLE[q.gate][q.from]);
    }
  });
});

describe('Quantum Challenge', () => {
  it('starts with 5 random questions and no answers', () => {
    const s = toChallenge('SOLO');
    expect(s.challenge?.index).toBe(0);
    expect(s.challenge?.scores).toEqual({ BLUE: 0, RED: 0 });
    const a = toChallenge('SOLO', {}).challenge?.questionIds;
    expect(a?.length).toBeGreaterThanOrEqual(5);
  });

  it('T-R-20: after 5 questions the side with more correct answers wins', () => {
    let s = toChallenge('SOLO');
    for (let i = 0; i < 5; i++) s = answerRound(s, { BLUE: true, RED: i < 2 });
    expect(s.phase).toBe('FINISHED');
    expect(s.endReason).toBe('CHALLENGE');
    expect(s.winner).toBe('BLUE');
  });

  it('T-R-21: tie with sudden death on → extra questions until one right and one wrong', () => {
    let s = toChallenge('SOLO', { suddenDeath: true });
    for (let i = 0; i < 5; i++) s = answerRound(s, { BLUE: true, RED: true });
    expect(s.phase).toBe('CHALLENGE');
    s = answerRound(s, { BLUE: false, RED: false });
    expect(s.phase).toBe('CHALLENGE');
    s = answerRound(s, { BLUE: true, RED: true });
    expect(s.phase).toBe('CHALLENGE');
    s = answerRound(s, { BLUE: false, RED: true });
    expect(s.phase).toBe('FINISHED');
    expect(s.endReason).toBe('CHALLENGE');
    expect(s.winner).toBe('RED');
  });

  it('T-R-22: tie with sudden death off → draw', () => {
    let s = toChallenge('SOLO', { suddenDeath: false });
    for (let i = 0; i < 5; i++) s = answerRound(s, { BLUE: i % 2 === 0, RED: i % 2 === 0 });
    expect(s.phase).toBe('FINISHED');
    expect(s.endReason).toBe('DRAW');
    expect(s.winner).toBe('DRAW');
  });

  it('Team: the first submission of a side counts; a second one is rejected', () => {
    const s = toChallenge('TEAM');
    const q = current(s);
    const first = applyAction(
      s,
      { type: 'CHALLENGE_ANSWER', player: 'P1', questionId: q.id, choice: q.answer },
      mulberry32(1),
    );
    expect(first.error).toBeUndefined();
    expect(sideOf('TEAM', 'P2')).toBe('BLUE');
    const second = applyAction(
      first.state,
      { type: 'CHALLENGE_ANSWER', player: 'P2', questionId: q.id, choice: 0 },
      mulberry32(1),
    );
    expect(second.error?.code).toBe('ALREADY_ANSWERED');
  });

  it('rejects an answer to a question that is not the current one', () => {
    const s = toChallenge('SOLO');
    const other = QUESTION_BANK.find((q) => q.id !== current(s).id);
    const res = applyAction(
      s,
      { type: 'CHALLENGE_ANSWER', player: 'P1', questionId: other?.id ?? '', choice: 0 },
      mulberry32(1),
    );
    expect(res.error?.code).toBe('WRONG_QUESTION');
  });

  it('rejects challenge answers outside the CHALLENGE phase', () => {
    const s = scenario('SOLO');
    const res = applyAction(
      s,
      { type: 'CHALLENGE_ANSWER', player: 'P1', questionId: 'x', choice: 0 },
      mulberry32(1),
    );
    expect(res.error?.code).toBe('WRONG_PHASE');
  });

  it('rejects an out-of-range choice', () => {
    const s = toChallenge('SOLO');
    const res = applyAction(
      s,
      { type: 'CHALLENGE_ANSWER', player: 'P1', questionId: current(s).id, choice: 99 },
      mulberry32(1),
    );
    expect(res.error?.code).toBe('BAD_CHOICE');
  });
});
