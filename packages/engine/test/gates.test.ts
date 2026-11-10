import { describe, expect, it } from 'vitest';
import { abs, c } from '../src/complex';
import { applyToVector, isUnitary } from '../src/matrix';
import { applyGate, CNOT, GATE_TABLE, GATES, SINGLE_GATES, type SingleGate } from '../src/gates';
import { POSITION_AMPLITUDES, positionOf, type Position } from '../src/states';

// Hand-typed from docs/rules.md §3.2. Do NOT compute this table: it is the acceptance oracle.
// Columns follow the rules.md column order: |0⟩, |1⟩, |+⟩, |−⟩, |i⟩, |−i⟩.
const COLUMNS: readonly Position[] = ['ZERO', 'ONE', 'PLUS', 'MINUS', 'PLUS_I', 'MINUS_I'];
const EXPECTED: Record<SingleGate, readonly Position[]> = {
  H: ['PLUS', 'MINUS', 'ZERO', 'ONE', 'MINUS_I', 'PLUS_I'],
  S: ['ZERO', 'ONE', 'PLUS_I', 'MINUS_I', 'MINUS', 'PLUS'],
  X: ['ONE', 'ZERO', 'PLUS', 'MINUS', 'MINUS_I', 'PLUS_I'],
  Y: ['ONE', 'ZERO', 'MINUS', 'PLUS', 'PLUS_I', 'MINUS_I'],
  Z: ['ZERO', 'ONE', 'MINUS', 'PLUS', 'MINUS_I', 'PLUS_I'],
  SX: ['MINUS_I', 'PLUS_I', 'PLUS', 'MINUS', 'ZERO', 'ONE'],
  I: ['ZERO', 'ONE', 'PLUS', 'MINUS', 'PLUS_I', 'MINUS_I'],
};
const ROW_ORDER: readonly SingleGate[] = ['H', 'S', 'X', 'Y', 'Z', 'SX', 'I'];

const cases = ROW_ORDER.flatMap((gate, row) =>
  COLUMNS.map((from, col) => ({
    id: `T-G-${String(row * COLUMNS.length + col + 1).padStart(2, '0')}`,
    gate,
    from,
    to: EXPECTED[gate][col] as Position,
  })),
);

describe('single-qubit gates (SE-1)', () => {
  it('covers exactly 42 cases', () => {
    expect(cases).toHaveLength(42);
  });

  it.each(cases)('$id: $gate on $from → $to', ({ gate, from, to }) => {
    expect(applyGate(gate, from)).toBe(to);
  });

  it('T-G-43: every gate matrix is unitary', () => {
    for (const gate of SINGLE_GATES) {
      expect(isUnitary(GATES[gate]), gate).toBe(true);
    }
    expect(isUnitary(CNOT), 'CNOT').toBe(true);
  });

  it('T-G-44: global phase is ignored (Y|0⟩ = i|1⟩ is ONE)', () => {
    const out = applyToVector(GATES.Y, POSITION_AMPLITUDES.ZERO);
    // The raw amplitudes differ from |1⟩ by the phase i ...
    expect(out[1]).toEqual(c(0, 1));
    expect(abs(out[0] ?? c(1, 0))).toBe(0);
    // ... but the position is still ONE.
    expect(positionOf(out)).toBe('ONE');
  });

  it('T-G-45: GATE_TABLE generated from matrices equals the expected table', () => {
    for (const gate of ROW_ORDER) {
      COLUMNS.forEach((from, col) => {
        expect(GATE_TABLE[gate][from], `${gate} on ${from}`).toBe(EXPECTED[gate][col]);
      });
    }
  });

  it('positionOf returns null for a state that is not one of the six positions', () => {
    expect(positionOf([c(Math.cos(0.3), 0), c(Math.sin(0.3), 0)])).toBeNull();
  });
});
