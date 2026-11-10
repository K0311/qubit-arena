import { c } from './complex';
import { applyToVector, type Matrix } from './matrix';
import { POSITION_AMPLITUDES, POSITIONS, positionOf, type Position } from './states';

/** Single-qubit gate cards (rules.md §3.1). `SX` is √X. */
export type SingleGate = 'H' | 'S' | 'X' | 'Y' | 'Z' | 'SX' | 'I';
export const SINGLE_GATES: readonly SingleGate[] = ['H', 'S', 'X', 'Y', 'Z', 'SX', 'I'];

const h = 1 / Math.SQRT2;
const r = (x: number) => c(x);

export const GATES: Readonly<Record<SingleGate, Matrix>> = {
  H: [
    [r(h), r(h)],
    [r(h), r(-h)],
  ],
  S: [
    [r(1), r(0)],
    [r(0), c(0, 1)],
  ],
  X: [
    [r(0), r(1)],
    [r(1), r(0)],
  ],
  Y: [
    [r(0), c(0, -1)],
    [c(0, 1), r(0)],
  ],
  Z: [
    [r(1), r(0)],
    [r(0), r(-1)],
  ],
  SX: [
    [c(0.5, 0.5), c(0.5, -0.5)],
    [c(0.5, -0.5), c(0.5, 0.5)],
  ],
  I: [
    [r(1), r(0)],
    [r(0), r(1)],
  ],
};

/** CNOT with control = partner (first qubit), target = football (second), rules.md §4.1. */
export const CNOT: Matrix = [
  [r(1), r(0), r(0), r(0)],
  [r(0), r(1), r(0), r(0)],
  [r(0), r(0), r(0), r(1)],
  [r(0), r(0), r(1), r(0)],
];

/** Where a single-qubit gate sends a position, computed from the matrix. */
export function applyGate(gate: SingleGate, from: Position): Position {
  const to = positionOf(applyToVector(GATES[gate], POSITION_AMPLITUDES[from]));
  // Unreachable for Clifford gates; guards against a typo in a matrix.
  if (to === null) throw new Error(`${gate} on ${from} left the six positions`);
  return to;
}

const buildTable = (): Readonly<Record<SingleGate, Readonly<Record<Position, Position>>>> =>
  Object.fromEntries(
    SINGLE_GATES.map((g) => [g, Object.fromEntries(POSITIONS.map((p) => [p, applyGate(g, p)]))]),
  ) as Record<SingleGate, Record<Position, Position>>;

/** Gate table generated from the matrices (never hard-coded; see rules.md §3.2). */
export const GATE_TABLE = buildTable();
