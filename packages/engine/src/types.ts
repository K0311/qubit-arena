import type { SingleGate } from './gates';
import type { KickoffPosition, TwoQubitState } from './quantum';
import type { BallPosition } from './states';

export type CardKind = SingleGate | 'MEASURE' | 'CNOT';
export type Card = { readonly id: number; readonly kind: CardKind };

export type Side = 'BLUE' | 'RED';
export type PlayerId = 'P1' | 'P2' | 'P3' | 'P4';
export type Mode = 'SOLO' | 'TEAM';
export type Phase = 'LOBBY' | 'KICKOFF' | 'PLAYING' | 'CHALLENGE' | 'FINISHED';
export type EndReason = 'TARGET' | 'TIME' | 'NO_CARDS' | 'CHALLENGE' | 'DRAW';
export type Winner = Side | 'DRAW';

export type DeckCounts = Readonly<Record<CardKind, number>>;

export type GameConfig = {
  readonly mode: Mode;
  readonly targetScore: number;
  /** Clocks run on the server; the engine only stores them for the view. */
  readonly timeLimitMs: number;
  readonly turnTimerMs: number;
  readonly handSize: number;
  readonly deckCounts: DeckCounts;
  /** Quantum Challenge: keep asking after a tie (rules.md §8.1). */
  readonly suddenDeath: boolean;
  /** Regular Quantum Challenge questions before sudden death (rules.md §8.1: five). */
  readonly challengeQuestions: number;
};

/** Only seated players have an entry (P1–P2 in Solo, P1–P4 in Team). */
export type Hands = Readonly<Partial<Record<PlayerId, readonly Card[]>>>;

export type ChallengeState = {
  /** Shuffled question ids: the first `challengeQuestions` are regular, the rest sudden death. */
  readonly questionIds: readonly string[];
  readonly index: number;
  /** Answers to the current question; the first submission of a side counts. */
  readonly answers: Readonly<Partial<Record<Side, number>>>;
  readonly scores: Readonly<Record<Side, number>>;
};

export type GameEvent =
  | { readonly type: 'OPENING_ROLL'; readonly blue: number; readonly red: number }
  | { readonly type: 'KICKOFF'; readonly side?: Side; readonly ball: KickoffPosition }
  | {
      readonly type: 'CARD_PLAYED';
      readonly player: PlayerId;
      readonly card: Card;
      readonly from: BallPosition;
      readonly to: BallPosition;
      readonly byTimeout: boolean;
    }
  | { readonly type: 'MEASURED'; readonly outcome: KickoffPosition }
  | { readonly type: 'TOUCHDOWN'; readonly side: Side; readonly player: PlayerId }
  | { readonly type: 'TIME_UP' }
  | { readonly type: 'CHALLENGE_STARTED'; readonly questions: number }
  | { readonly type: 'CHALLENGE_ANSWERED'; readonly side: Side }
  | {
      readonly type: 'CHALLENGE_RESULT';
      readonly questionId: string;
      readonly correctChoice: number;
      readonly correct: Readonly<Record<Side, boolean>>;
    }
  | { readonly type: 'GAME_OVER'; readonly reason: EndReason; readonly winner: Winner };

export type GameState = {
  readonly config: GameConfig;
  readonly phase: Phase;
  /** 4 amplitudes |p f⟩ (partner first). */
  readonly qubits: TwoQubitState;
  readonly hands: Hands;
  /** Server only: never sent to a client (rules.md §9). */
  readonly deck: readonly Card[];
  readonly discard: readonly Card[];
  readonly turn: PlayerId;
  readonly score: Readonly<Record<Side, number>>;
  /** The game clock ran out; the game ends after the current turn (rules.md §8). */
  readonly timeUp: boolean;
  readonly log: readonly GameEvent[];
  readonly version: number;
  readonly endReason?: EndReason;
  readonly winner?: Winner;
  readonly challenge?: ChallengeState;
};

export type Action =
  | { readonly type: 'PLAY_CARD'; readonly player: PlayerId; readonly cardId: number }
  /** The server's turn timer ran out for this player (rules.md §6.2). */
  | { readonly type: 'TIMEOUT'; readonly player: PlayerId }
  /** The server's game clock ran out (rules.md §8 item 2). */
  | { readonly type: 'TIME_UP' }
  | {
      readonly type: 'CHALLENGE_ANSWER';
      readonly player: PlayerId;
      readonly questionId: string;
      readonly choice: number;
    };

export type ErrorCode =
  | 'UNKNOWN_ACTION'
  | 'WRONG_PHASE'
  | 'NOT_YOUR_TURN'
  | 'NOT_SEATED'
  | 'CARD_NOT_IN_HAND'
  | 'EMPTY_HAND'
  | 'WRONG_QUESTION'
  | 'ALREADY_ANSWERED'
  | 'BAD_CHOICE';

export type ActionError = { readonly code: ErrorCode; readonly message: string };

export type ApplyResult = {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
  /** Set when the action was rejected; `state` is then the input state, unchanged. */
  readonly error?: ActionError;
};
