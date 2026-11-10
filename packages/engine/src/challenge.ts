import { shuffle } from './deck';
import { GATE_TABLE, SINGLE_GATES, type SingleGate } from './gates';
import { finishGame, type Step } from './outcome';
import type { Rng } from './rng';
import { sideOf } from './seats';
import { POSITIONS, type Position } from './states';
import type { Action, ActionError, ChallengeState, GameEvent, GameState, Side } from './types';

export type Question = {
  readonly id: string;
  readonly prompt: string;
  readonly choices: readonly string[];
  /** Index into `choices`. Server only: never put this in a view. */
  readonly answer: number;
  /** Set for questions generated from the gate table. */
  readonly gate?: SingleGate;
  readonly from?: Position;
};

const LABEL: Readonly<Record<Position, string>> = {
  ZERO: '|0⟩',
  PLUS: '|+⟩',
  MINUS_I: '|−i⟩',
  ONE: '|1⟩',
  MINUS: '|−⟩',
  PLUS_I: '|i⟩',
};
const GATE_LABEL: Readonly<Record<SingleGate, string>> = {
  H: 'H',
  S: 'S',
  X: 'X',
  Y: 'Y',
  Z: 'Z',
  SX: '√X',
  I: 'I',
};

// Gate questions come from GATE_TABLE (itself computed from the matrices), so the quiz can
// never disagree with the board. Only moves that change the position are asked.
const GATE_QUESTIONS: readonly Question[] = SINGLE_GATES.flatMap((gate) =>
  POSITIONS.filter((from) => GATE_TABLE[gate][from] !== from).map((from) => ({
    id: `gate-${gate}-${from}`,
    prompt: `The ball is at ${LABEL[from]}. Where does the ${GATE_LABEL[gate]} card send it?`,
    choices: POSITIONS.map((p) => LABEL[p]),
    answer: POSITIONS.indexOf(GATE_TABLE[gate][from]),
    gate,
    from,
  })),
);

// Hand-written questions on states, measurement and CNOT (rules.md §2–§4).
const CONCEPT_QUESTIONS: readonly Question[] = [
  {
    id: 'measure-plus',
    prompt: 'You play Measure with the ball at |+⟩. What is the chance it lands on |0⟩?',
    choices: ['0 %', '25 %', '50 %', '100 %'],
    answer: 2,
  },
  {
    id: 'measure-zero',
    prompt: 'You play Measure with the ball at |0⟩. What happens?',
    choices: [
      'It moves to |1⟩',
      'It stays at |0⟩ (failed punt)',
      'It moves to |+⟩',
      'It enters the fog',
    ],
    answer: 1,
  },
  {
    id: 'measure-i',
    prompt: 'Measure with the ball at |i⟩ can land on…',
    choices: ['|+⟩ or |−⟩', 'only |i⟩', 'only |0⟩', '|0⟩ or |1⟩'],
    answer: 3,
  },
  {
    id: 'bloch-zero',
    prompt: 'Which Bloch vector (x, y, z) is the state |0⟩?',
    choices: ['(0, 0, −1)', '(+1, 0, 0)', '(0, 0, +1)', '(0, +1, 0)'],
    answer: 2,
  },
  {
    id: 'bloch-minus',
    prompt: 'Which state has the Bloch vector (−1, 0, 0)?',
    choices: ['|−⟩', '|+⟩', '|1⟩', '|−i⟩'],
    answer: 0,
  },
  {
    id: 'global-phase',
    prompt: 'Y|0⟩ = i|1⟩. Which position is the ball at?',
    choices: ['|i⟩', '|1⟩', '|0⟩', '|−i⟩'],
    answer: 1,
  },
  {
    id: 'cnot-fog',
    prompt: 'Partner at |+⟩, ball at |0⟩. After CNOT the ball is…',
    choices: ['at |1⟩', 'at |+⟩', 'still at |0⟩, not entangled', 'in the fog (entangled)'],
    answer: 3,
  },
  {
    id: 'cnot-plus',
    prompt: 'Partner at |+⟩, ball at |+⟩. What does CNOT do?',
    choices: [
      'The ball enters the fog',
      'Nothing changes',
      'The ball moves to |−⟩',
      'The partner moves to |0⟩',
    ],
    answer: 1,
  },
  {
    id: 'cnot-kickback',
    prompt: 'Partner at |+⟩, ball at |−⟩. What happens after CNOT?',
    choices: [
      'The ball enters the fog',
      'The ball moves to |+⟩',
      'The partner becomes |−⟩; the ball stays at |−⟩',
      'Nothing changes at all',
    ],
    answer: 2,
  },
  {
    id: 'one-way-arrows',
    prompt: 'Which cards draw one-way arrows on the board?',
    choices: ['H and X', 'S and √X', 'Y and Z', 'I and H'],
    answer: 1,
  },
];

export const QUESTION_BANK: readonly Question[] = [...CONCEPT_QUESTIONS, ...GATE_QUESTIONS];

const BY_ID: ReadonlyMap<string, Question> = new Map(QUESTION_BANK.map((q) => [q.id, q]));

export function questionById(id: string): Question {
  const q = BY_ID.get(id);
  if (!q) throw new Error(`unknown question ${id}`);
  return q;
}

/** Tie at the end → CHALLENGE phase with a random question order (rules.md §8.1). */
export function startChallenge(state: GameState, rng: Rng): Step {
  const challenge: ChallengeState = {
    questionIds: shuffle(
      QUESTION_BANK.map((q) => q.id),
      rng,
    ),
    index: 0,
    answers: {},
    scores: { BLUE: 0, RED: 0 },
  };
  return {
    state: { ...state, phase: 'CHALLENGE', challenge },
    events: [{ type: 'CHALLENGE_STARTED', questions: state.config.challengeQuestions }],
  };
}

const reject = (code: ActionError['code'], message: string): ActionError => ({ code, message });

export function answerChallenge(
  state: GameState,
  action: Extract<Action, { type: 'CHALLENGE_ANSWER' }>,
): Step | ActionError {
  const ch = state.challenge;
  if (state.phase !== 'CHALLENGE' || !ch) return reject('WRONG_PHASE', 'no challenge running');
  if (state.hands[action.player] === undefined)
    return reject('NOT_SEATED', `${action.player} is not seated`);
  const currentId = ch.questionIds[ch.index];
  if (currentId === undefined || action.questionId !== currentId) {
    return reject('WRONG_QUESTION', 'that is not the current question');
  }
  const q = questionById(currentId);
  if (!Number.isInteger(action.choice) || action.choice < 0 || action.choice >= q.choices.length) {
    return reject('BAD_CHOICE', 'choice out of range');
  }
  const side = sideOf(state.config.mode, action.player);
  // rules.md §13 #2 default: in Team mode the first submission of the side counts.
  if (ch.answers[side] !== undefined) return reject('ALREADY_ANSWERED', `${side} already answered`);

  const answers = { ...ch.answers, [side]: action.choice };
  const answered: GameEvent = { type: 'CHALLENGE_ANSWERED', side };
  if (answers.BLUE === undefined || answers.RED === undefined) {
    return { state: { ...state, challenge: { ...ch, answers } }, events: [answered] };
  }
  return resolveQuestion(state, ch, q, { BLUE: answers.BLUE, RED: answers.RED }, answered);
}

function resolveQuestion(
  state: GameState,
  ch: ChallengeState,
  q: Question,
  answers: Record<Side, number>,
  answered: GameEvent,
): Step {
  const correct = { BLUE: answers.BLUE === q.answer, RED: answers.RED === q.answer };
  const scores = {
    BLUE: ch.scores.BLUE + (correct.BLUE ? 1 : 0),
    RED: ch.scores.RED + (correct.RED ? 1 : 0),
  };
  const events: GameEvent[] = [
    answered,
    { type: 'CHALLENGE_RESULT', questionId: q.id, correctChoice: q.answer, correct },
  ];
  const regular = state.config.challengeQuestions;
  const asked = ch.index + 1;
  const scored = { ...state, challenge: { ...ch, answers: {}, scores } };
  const end = (winner: Side | 'DRAW'): Step => {
    const done = finishGame(scored, winner === 'DRAW' ? 'DRAW' : 'CHALLENGE', winner);
    return { state: done.state, events: [...events, ...done.events] };
  };
  const next = (): Step =>
    asked < ch.questionIds.length
      ? { state: { ...scored, challenge: { ...scored.challenge, index: asked } }, events }
      : end('DRAW'); // Bank exhausted in sudden death: nobody can be separated.

  if (asked < regular) return next();
  if (asked === regular) {
    if (scores.BLUE !== scores.RED) return end(scores.BLUE > scores.RED ? 'BLUE' : 'RED');
    return state.config.suddenDeath ? next() : end('DRAW');
  }
  // Sudden death: decided only when one side is right and the other wrong.
  if (correct.BLUE !== correct.RED) return end(correct.BLUE ? 'BLUE' : 'RED');
  return next();
}
