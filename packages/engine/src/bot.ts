import { questionById } from './challenge';
import { abs2 } from './complex';
import { applyGate, SINGLE_GATES } from './gates';
import { applyCnot, applySingleGate, ballPosition, type TwoQubitState } from './quantum';
import type { Rng } from './rng';
import { END_ZONE, otherSide, sideOf } from './seats';
import { POSITIONS, type BallPosition, type Position } from './states';
import type { Action, Card, GameState, PlayerId, Side } from './types';

/** EASY is the random bot v1 of rules.md §10; NORMAL is the greedy bot (P-6.4). */
export type BotLevel = 'EASY' | 'NORMAL';
export const BOT_LEVELS: readonly BotLevel[] = ['EASY', 'NORMAL'];

const pick = <T>(xs: readonly T[], rng: Rng): T | undefined =>
  xs[Math.floor(rng.next() * xs.length)];

/**
 * A bot's move for one seat: a card on its turn, a random answer in the Quantum Challenge.
 * Takes the seat so a bot can never act for a human on another side. Used for disconnected
 * seats, Bot Arena seats and simulation. Returns null when this seat has nothing to do now.
 */
export function botAction(
  state: GameState,
  player: PlayerId,
  rng: Rng,
  level: BotLevel = 'EASY',
): Action | null {
  if (state.phase === 'PLAYING') {
    if (state.turn !== player) return null;
    const hand = state.hands[player] ?? [];
    const card = level === 'NORMAL' ? greedyCard(state, player, hand, rng) : pick(hand, rng);
    return card ? { type: 'PLAY_CARD', player, cardId: card.id } : null;
  }
  const ch = state.challenge;
  const id = ch?.questionIds[ch.index];
  if (state.phase !== 'CHALLENGE' || !ch || id === undefined) return null;
  if (ch.answers[sideOf(state.config.mode, player)] !== undefined) return null;
  // Both levels guess: a bot that knew the answers would read what players cannot see.
  return {
    type: 'CHALLENGE_ANSWER',
    player,
    questionId: id,
    choice: Math.floor(rng.next() * questionById(id).choices.length),
  };
}

// ---- greedy (P-6.4) ----------------------------------------------------------------------

/**
 * Steps between positions using single-qubit gates (the gate lines of the board), from the
 * gate matrices by breadth-first search, never a hard-coded table.
 */
const STEPS: Readonly<Record<Position, Readonly<Record<Position, number>>>> = (() => {
  const out = {} as Record<Position, Record<Position, number>>;
  for (const from of POSITIONS) {
    const dist = { [from]: 0 } as Record<Position, number>;
    let frontier: Position[] = [from];
    while (frontier.length > 0) {
      const next: Position[] = [];
      for (const p of frontier) {
        for (const g of SINGLE_GATES) {
          const q = applyGate(g, p);
          if (dist[q] === undefined) {
            dist[q] = dist[p] + 1;
            next.push(q);
          }
        }
      }
      frontier = next;
    }
    out[from] = dist;
  }
  return out;
})();

/** The fog counts as this many steps from either end zone: worse than any next-door square. */
const FOG_STEPS = 1.5;

const stepsTo = (ball: BallPosition, zone: Position): number =>
  ball === 'FOG' ? FOG_STEPS : STEPS[ball][zone];

/**
 * Where the football can end up after a card, with probabilities. Measure is the only random
 * card; its odds come from the amplitudes, never from the server's RNG (no peeking).
 */
function outcomes(qubits: TwoQubitState, card: Card): { ball: BallPosition; p: number }[] {
  if (card.kind === 'CNOT') return [{ ball: ballPosition(applyCnot(qubits)), p: 1 }];
  if (card.kind !== 'MEASURE') {
    return [{ ball: ballPosition(applySingleGate(qubits, card.kind)), p: 1 }];
  }
  // Football bit f is the low bit of the basis index |p f⟩ (quantum.ts).
  const p0 = qubits.reduce((sum, a, i) => (i % 2 === 0 ? sum + abs2(a) : sum), 0);
  return [
    { ball: 'ZERO' as const, p: p0 },
    { ball: 'ONE' as const, p: 1 - p0 },
  ].filter((o) => o.p > 1e-9);
}

/**
 * Value of the ball landing at `to` for `side`, in priority order (claude-code-prompts P-6.4):
 * (1) a touchdown (rules.md §7), (2)–(3) fewer steps to its own end zone, with the fog counted
 * as FOG_STEPS so leaving it only wins when the new square is closer, (4) more steps from the
 * other side's end zone.
 */
function value(from: BallPosition, to: BallPosition, side: Side): number {
  const mine = END_ZONE[side];
  if (to === mine && from !== mine) return 1_000;
  // Sitting in its own zone without scoring: it has to leave and come back first.
  const own = to === mine ? 1 : stepsTo(to, mine);
  return -10 * own + stepsTo(to, END_ZONE[otherSide(side)]);
}

function greedyCard(
  state: GameState,
  player: PlayerId,
  hand: readonly Card[],
  rng: Rng,
): Card | undefined {
  const side = sideOf(state.config.mode, player);
  const from = ballPosition(state.qubits);
  let best: Card[] = [];
  let bestScore = -Infinity;
  for (const card of hand) {
    const score = outcomes(state.qubits, card).reduce(
      (sum, o) => sum + o.p * value(from, o.ball, side),
      0,
    );
    if (score > bestScore + 1e-9) {
      best = [card];
      bestScore = score;
    } else if (Math.abs(score - bestScore) <= 1e-9) {
      best.push(card);
    }
  }
  return pick(best, rng);
}
