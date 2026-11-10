import { TOLERANCE } from './complex';
import { deckSize } from './deck';
import { ballPosition, norm } from './quantum';
import { sideOf } from './seats';
import type { GameState, Side } from './types';

/**
 * architecture.md §4.3 invariants. Returns a list of problems (empty = fine) so tests and
 * debug builds can report every broken rule at once. Pass `prev` to check transitions.
 */
export function checkInvariants(state: GameState, prev?: GameState): string[] {
  const problems: string[] = [];
  const hands = Object.values(state.hands).map((h) => h ?? []);
  const all = [...state.deck, ...state.discard, ...hands.flat()];

  const expected = deckSize(state.config.deckCounts);
  if (all.length !== expected) problems.push(`card count ${all.length} ≠ deck size ${expected}`);
  if (new Set(all.map((c) => c.id)).size !== all.length) problems.push('duplicate card id');
  if (hands.some((h) => h.length > state.config.handSize))
    problems.push('a hand is over the limit');

  if (Math.abs(norm(state.qubits) - 1) > TOLERANCE) problems.push('state is not normalised');
  try {
    ballPosition(state.qubits);
  } catch (e) {
    problems.push(String(e));
  }

  if (prev) {
    for (const side of ['BLUE', 'RED'] as const satisfies readonly Side[]) {
      const gained = state.score[side] - prev.score[side];
      if (gained < 0) problems.push(`${side} score decreased`);
      if (gained > 1) problems.push(`${side} scored more than 1 in one action`);
      if (gained > 0 && sideOf(prev.config.mode, prev.turn) !== side) {
        problems.push(`${side} scored on the other side's turn`);
      }
    }
  }
  return problems;
}
