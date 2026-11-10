import { describe, expect, it } from 'vitest';
import { c } from '../src/complex';
import {
  applyToVector,
  dagger,
  identity,
  inner,
  isUnitary,
  kron,
  kronVector,
  matMul,
  matrixApproxEqual,
  vectorApproxEqual,
  type Matrix,
} from '../src/matrix';

const r = (x: number) => c(x, 0);
const i = c(0, 1);

describe('matrix', () => {
  it('builds identity matrices', () => {
    expect(identity(2)).toEqual([
      [r(1), r(0)],
      [r(0), r(1)],
    ]);
    expect(identity(4)).toHaveLength(4);
  });

  it('multiplies 2x2 matrices', () => {
    const a: Matrix = [
      [r(1), r(2)],
      [r(3), r(4)],
    ];
    const b: Matrix = [
      [r(0), r(1)],
      [r(1), r(0)],
    ];
    expect(matMul(a, b)).toEqual([
      [r(2), r(1)],
      [r(4), r(3)],
    ]);
  });

  it('multiplies 4x4 matrices (identity is neutral)', () => {
    const m = kron(
      [
        [r(1), r(2)],
        [r(3), r(4)],
      ],
      [
        [r(0), i],
        [i, r(0)],
      ],
    );
    expect(matrixApproxEqual(matMul(identity(4), m), m)).toBe(true);
    expect(matrixApproxEqual(matMul(m, identity(4)), m)).toBe(true);
  });

  it('computes the Kronecker product (first factor is the outer block)', () => {
    const x: Matrix = [
      [r(0), r(1)],
      [r(1), r(0)],
    ];
    // I ⊗ X is block-diagonal: X acts on the second qubit.
    expect(kron(identity(2), x)).toEqual([
      [r(0), r(1), r(0), r(0)],
      [r(1), r(0), r(0), r(0)],
      [r(0), r(0), r(0), r(1)],
      [r(0), r(0), r(1), r(0)],
    ]);
  });

  it('computes the Kronecker product of vectors', () => {
    expect(kronVector([r(1), r(0)], [r(0), r(1)])).toEqual([r(0), r(1), r(0), r(0)]);
  });

  it('applies a matrix to a vector', () => {
    const y: Matrix = [
      [r(0), c(0, -1)],
      [i, r(0)],
    ];
    expect(applyToVector(y, [r(1), r(0)])).toEqual([r(0), i]);
  });

  it('computes the conjugate transpose', () => {
    // Tolerance compare: conj(0) is -0, which toEqual treats as different from 0.
    const d = dagger([
      [r(1), c(0, 2)],
      [c(3, 1), r(4)],
    ]);
    expect(
      matrixApproxEqual(d, [
        [r(1), c(3, -1)],
        [c(0, -2), r(4)],
      ]),
    ).toBe(true);
  });

  it('computes the inner product <a|b> (conjugating a)', () => {
    expect(inner([i, r(0)], [i, r(0)])).toEqual(r(1));
    expect(inner([i, r(0)], [r(1), r(0)])).toEqual(c(0, -1));
  });

  it('detects unitary and non-unitary matrices', () => {
    expect(isUnitary(identity(4))).toBe(true);
    expect(
      isUnitary([
        [r(1), r(1)],
        [r(0), r(1)],
      ]),
    ).toBe(false);
  });

  it('compares vectors within tolerance', () => {
    expect(vectorApproxEqual([r(1), r(0)], [r(1 + 1e-12), r(0)])).toBe(true);
    expect(vectorApproxEqual([r(1), r(0)], [r(1), r(0), r(0)])).toBe(false);
  });

  it('rejects mismatched dimensions', () => {
    expect(() => matMul(identity(2), identity(4))).toThrow();
    expect(() => applyToVector(identity(4), [r(1), r(0)])).toThrow();
  });
});
