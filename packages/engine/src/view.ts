import { questionById } from './challenge';
import { partnerPosition, ballPosition, type TwoQubitState } from './quantum';
import { sideOf } from './seats';
import type { BallPosition } from './states';
import type {
  Card,
  EndReason,
  GameConfig,
  GameEvent,
  GameState,
  Phase,
  PlayerId,
  Side,
  Winner,
} from './types';

export type Viewer = PlayerId | 'SPECTATOR';

export type ChallengeView = {
  readonly index: number;
  readonly scores: Readonly<Record<Side, number>>;
  readonly answered: Readonly<Record<Side, boolean>>;
  /** The current question without its answer; upcoming questions are never included. */
  readonly question: {
    readonly id: string;
    readonly prompt: string;
    readonly choices: readonly string[];
  };
};

/** What one connection may see (rules.md §9). Built per viewer, never broadcast as one object. */
export type GameView = {
  readonly viewer: Viewer;
  readonly config: GameConfig;
  readonly phase: Phase;
  readonly turn: PlayerId;
  readonly score: Readonly<Record<Side, number>>;
  readonly qubits: TwoQubitState;
  readonly ball: BallPosition;
  readonly partner: BallPosition;
  /** Own hand, plus the teammate's hand in Team mode. */
  readonly hands: Readonly<Partial<Record<PlayerId, readonly Card[]>>>;
  readonly handCounts: Readonly<Partial<Record<PlayerId, number>>>;
  readonly deckCount: number;
  readonly discard: readonly Card[];
  readonly timeUp: boolean;
  readonly log: readonly GameEvent[];
  readonly version: number;
  readonly endReason?: EndReason;
  readonly winner?: Winner;
  readonly challenge?: ChallengeView;
};

function challengeView(state: GameState): ChallengeView | undefined {
  const ch = state.challenge;
  const id = ch?.questionIds[ch.index];
  if (!ch || state.phase !== 'CHALLENGE' || id === undefined) return undefined;
  const q = questionById(id);
  return {
    index: ch.index,
    scores: ch.scores,
    answered: { BLUE: ch.answers.BLUE !== undefined, RED: ch.answers.RED !== undefined },
    question: { id: q.id, prompt: q.prompt, choices: q.choices },
  };
}

export function viewFor(state: GameState, viewer: Viewer): GameView {
  const seated = Object.keys(state.hands) as PlayerId[];
  const mySide = viewer === 'SPECTATOR' ? undefined : sideOf(state.config.mode, viewer);
  const canSee = (p: PlayerId) =>
    viewer !== 'SPECTATOR' &&
    (p === viewer || (state.config.mode === 'TEAM' && sideOf('TEAM', p) === mySide));

  const hands: Partial<Record<PlayerId, readonly Card[]>> = {};
  const handCounts: Partial<Record<PlayerId, number>> = {};
  for (const p of seated) {
    const hand = state.hands[p] ?? [];
    handCounts[p] = hand.length;
    if (canSee(p)) hands[p] = hand;
  }

  const challenge = challengeView(state);
  return {
    viewer,
    config: state.config,
    phase: state.phase,
    turn: state.turn,
    score: state.score,
    qubits: state.qubits,
    ball: ballPosition(state.qubits),
    partner: partnerPosition(state.qubits),
    hands,
    handCounts,
    deckCount: state.deck.length,
    discard: state.discard,
    timeUp: state.timeUp,
    log: state.log,
    version: state.version,
    ...(state.endReason ? { endReason: state.endReason } : {}),
    ...(state.winner ? { winner: state.winner } : {}),
    ...(challenge ? { challenge } : {}),
  };
}
