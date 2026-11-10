import { abs2, add, c, conj, mul, scale, TOLERANCE, type Complex } from './complex';
import { applyToVector, identity, kron, kronVector, type Matrix, type Vector } from './matrix';
import { CNOT, GATES, SINGLE_GATES, type SingleGate } from './gates';
import {
  POSITION_AMPLITUDES,
  positionOfBloch,
  type BallPosition,
  type BlochVector,
  type Position,
} from './states';
import type { Rng } from './rng';

/**
 * Two-qubit state: 4 amplitudes in the basis |p f⟩ = |00⟩, |01⟩, |10⟩, |11⟩,
 * partner first, football second (rules.md §4.1). Index = 2·p + f.
 */
export type TwoQubitState = Vector;
export type Qubit = 'PARTNER' | 'FOOTBALL';
export type KickoffPosition = Extract<Position, 'ZERO' | 'ONE'>;

const amp = (s: TwoQubitState, p: number, f: number): Complex => s[2 * p + f] ?? c(0);

export function productState(partner: Position, football: Position): TwoQubitState {
  return kronVector(POSITION_AMPLITUDES[partner], POSITION_AMPLITUDES[football]);
}

/** State at every kickoff: partner reset to |+⟩ (rules.md §4.2), ball at ZERO or ONE. */
export function kickoffState(ball: KickoffPosition): TwoQubitState {
  return productState('PLUS', ball);
}

// I ⊗ G for each card, built once: cards act on the football only.
const ON_FOOTBALL: Readonly<Record<SingleGate, Matrix>> = Object.fromEntries(
  SINGLE_GATES.map((g) => [g, kron(identity(2), GATES[g])]),
) as Record<SingleGate, Matrix>;

export function applySingleGate(state: TwoQubitState, gate: SingleGate): TwoQubitState {
  return applyToVector(ON_FOOTBALL[gate], state);
}

export function applyCnot(state: TwoQubitState): TwoQubitState {
  return applyToVector(CNOT, state);
}

export function norm(state: TwoQubitState): number {
  return Math.sqrt(state.reduce((sum, a) => sum + abs2(a), 0));
}

export type MeasureResult = {
  readonly state: TwoQubitState;
  readonly outcome: KickoffPosition;
};

/**
 * Projective z-measurement of the football with the Born rule, then renormalise
 * (rules.md §3.3, §4.4). The partner collapses through the correlation automatically.
 */
export function measureFootball(state: TwoQubitState, rng: Rng): MeasureResult {
  const p0 = abs2(amp(state, 0, 0)) + abs2(amp(state, 1, 0));
  const f = rng.next() < p0 ? 0 : 1;
  const pOutcome = f === 0 ? p0 : 1 - p0;
  const k = 1 / Math.sqrt(pOutcome);
  const next = state.map((a, i) => (i % 2 === f ? scale(a, k) : c(0)));
  return { state: next, outcome: f === 0 ? 'ZERO' : 'ONE' };
}

/** Reduced Bloch vector of one qubit, from its 2×2 reduced density matrix. */
export function reducedBloch(state: TwoQubitState, qubit: Qubit): BlochVector {
  // ρ[a][b] = Σ_other ψ(a, other) · conj ψ(b, other)
  const pick = (mine: number, other: number) =>
    qubit === 'FOOTBALL' ? amp(state, other, mine) : amp(state, mine, other);
  const rho = (a: number, b: number) =>
    add(mul(pick(a, 0), conj(pick(b, 0))), mul(pick(a, 1), conj(pick(b, 1))));
  const r01 = rho(0, 1);
  return [2 * r01.re, -2 * r01.im, rho(0, 0).re - rho(1, 1).re];
}

export function blochLength(v: BlochVector): number {
  return Math.hypot(...v);
}

/**
 * Length ≈ 1 → a position; ≈ 0 → FOG (rules.md §4.3). Anything else would break the
 * Clifford invariant (rules.md §4.1), so it throws instead of guessing.
 */
export function qubitPosition(state: TwoQubitState, qubit: Qubit): BallPosition {
  const v = reducedBloch(state, qubit);
  const len = blochLength(v);
  if (len <= TOLERANCE) return 'FOG';
  const pos = Math.abs(len - 1) <= TOLERANCE ? positionOfBloch(v) : null;
  if (pos === null) {
    throw new Error(`Clifford invariant broken: ${qubit} Bloch vector (${v.join(', ')})`);
  }
  return pos;
}

export const ballPosition = (state: TwoQubitState): BallPosition =>
  qubitPosition(state, 'FOOTBALL');

export const partnerPosition = (state: TwoQubitState): BallPosition =>
  qubitPosition(state, 'PARTNER');
