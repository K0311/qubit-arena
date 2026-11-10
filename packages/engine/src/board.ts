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

/**
 * Angle of each position on the board circle, in degrees counter-clockwise from +x (y up).
 * Same layout as the Blender prototype: the end zones face each other like a football
 * field (|+⟩ at the top, |−⟩ at the bottom) and the rules.md §2.1 order runs clockwise,
 * 60° apart, starting from |0⟩ at the upper left.
 */
export const BOARD_ANGLE_DEG: Readonly<Record<Position, number>> = Object.fromEntries(
  POSITIONS.map((p, k) => [p, 150 - 60 * k]),
) as Record<Position, number>;

/** Position on a unit circle (y up); the client scales it to its board radius. */
export function boardPoint(p: Position): { readonly x: number; readonly y: number } {
  const a = (BOARD_ANGLE_DEG[p] * Math.PI) / 180;
  return { x: Math.cos(a), y: Math.sin(a) };
}

export type BoardEdge = {
  readonly a: Position;
  readonly b: Position;
  /** true: one-way arrow a → b; false: two-way line a ↔ b. */
  readonly directed: boolean;
  /** Every card that moves the ball along this edge, in card order, e.g. ['H', 'X', 'Z']. */
  readonly gates: readonly SingleGate[];
};

/**
 * One drawable edge per pair of positions with all its gate labels, as on the original board
 * and the Blender prototype (13 edges: 5 lines, 8 arrows). Built from boardLines().
 */
export function boardEdges(): readonly BoardEdge[] {
  const edges = new Map<
    string,
    { a: Position; b: Position; directed: boolean; gates: SingleGate[] }
  >();
  for (const l of boardLines()) {
    const key = `${l.from}|${l.to}|${l.twoWay}`;
    const edge = edges.get(key) ?? { a: l.from, b: l.to, directed: !l.twoWay, gates: [] };
    edge.gates.push(l.gate);
    edges.set(key, edge);
  }
  return [...edges.values()];
}
