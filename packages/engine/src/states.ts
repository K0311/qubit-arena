import { abs, c, TOLERANCE } from './complex';
import { inner, type Vector } from './matrix';

/** Identifiers from rules.md §2.1. */
export type Position = 'ZERO' | 'PLUS' | 'MINUS_I' | 'ONE' | 'MINUS' | 'PLUS_I';
export type BallPosition = Position | 'FOG';
export type BlochVector = readonly [x: number, y: number, z: number];

/** Board order: clockwise from the top (rules.md §2.1 "Index" column). */
export const POSITIONS: readonly Position[] = ['ZERO', 'PLUS', 'MINUS_I', 'ONE', 'MINUS', 'PLUS_I'];

const h = 1 / Math.SQRT2;

/** Amplitudes (α, β) for α|0⟩ + β|1⟩, rules.md §2.1. */
export const POSITION_AMPLITUDES: Readonly<Record<Position, Vector>> = {
  ZERO: [c(1), c(0)],
  PLUS: [c(h), c(h)],
  MINUS_I: [c(h), c(0, -h)],
  ONE: [c(0), c(1)],
  MINUS: [c(h), c(-h)],
  PLUS_I: [c(h), c(0, h)],
};

export const BLOCH_VECTORS: Readonly<Record<Position, BlochVector>> = {
  ZERO: [0, 0, 1],
  PLUS: [1, 0, 0],
  MINUS_I: [0, -1, 0],
  ONE: [0, 0, -1],
  MINUS: [-1, 0, 0],
  PLUS_I: [0, 1, 0],
};

/**
 * Which of the six positions a normalised single-qubit state is at, ignoring global phase
 * (|⟨a|b⟩| ≈ 1, rules.md §2.3). Null if it is none of them.
 */
export function positionOf(state: Vector): Position | null {
  return (
    POSITIONS.find((p) => Math.abs(abs(inner(POSITION_AMPLITUDES[p], state)) - 1) <= TOLERANCE) ??
    null
  );
}

/** Which position a unit Bloch vector points at, or null if none. */
export function positionOfBloch(v: BlochVector): Position | null {
  return (
    POSITIONS.find((p) =>
      BLOCH_VECTORS[p].every((x, i) => Math.abs(x - (v[i] ?? NaN)) <= TOLERANCE),
    ) ?? null
  );
}
