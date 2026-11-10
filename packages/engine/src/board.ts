import { GATE_TABLE, SINGLE_GATES, type SingleGate } from './gates';
import { POSITIONS, type Position } from './states';

export type BoardLine = {
  readonly gate: SingleGate;
  readonly from: Position;
  readonly to: Position;
  /** true: A ↔ B line; false: one-way arrow from → to. */
  readonly twoWay: boolean;
};

/**
 * Lines and arrows for the board, derived from GATE_TABLE (rules.md §2.4) so the client
 * never draws a hand-made board. Two-way lines are listed once, from the lower board index.
 */
export function boardLines(): readonly BoardLine[] {
  const index = (p: Position) => POSITIONS.indexOf(p);
  return SINGLE_GATES.flatMap((gate) =>
    POSITIONS.flatMap((from): BoardLine[] => {
      const to = GATE_TABLE[gate][from];
      if (to === from) return [];
      const twoWay = GATE_TABLE[gate][to] === from;
      if (twoWay && index(from) > index(to)) return [];
      return [{ gate, from, to, twoWay }];
    }),
  );
}
