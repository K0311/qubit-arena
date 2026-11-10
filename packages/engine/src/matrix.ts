import { add, approxEqual, c, conj, mul, TOLERANCE, type Complex } from './complex';

export type Vector = readonly Complex[];
export type Matrix = readonly (readonly Complex[])[];

const ZERO = c(0);
const ONE = c(1);

function assertSquare(m: Matrix): number {
  const n = m.length;
  if (n === 0 || m.some((row) => row.length !== n)) {
    throw new Error(`expected a non-empty square matrix, got ${n} rows`);
  }
  return n;
}

const at = <T>(xs: readonly T[], i: number): T => {
  const x = xs[i];
  if (x === undefined) throw new Error(`index ${i} out of range`);
  return x;
};

export function identity(n: number): Matrix {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? ONE : ZERO)),
  );
}

export function matMul(a: Matrix, b: Matrix): Matrix {
  const n = assertSquare(a);
  if (assertSquare(b) !== n)
    throw new Error(`cannot multiply ${n}×${n} by ${b.length}×${b.length}`);
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      let sum = ZERO;
      for (let k = 0; k < n; k++) sum = add(sum, mul(at(at(a, i), k), at(at(b, k), j)));
      return sum;
    }),
  );
}

/** Kronecker product A ⊗ B: A picks the block, B fills it (first factor = first qubit). */
export function kron(a: Matrix, b: Matrix): Matrix {
  const n = assertSquare(a);
  const m = assertSquare(b);
  return Array.from({ length: n * m }, (_, i) =>
    Array.from({ length: n * m }, (_, j) =>
      mul(at(at(a, Math.floor(i / m)), Math.floor(j / m)), at(at(b, i % m), j % m)),
    ),
  );
}

/** Tensor product of state vectors |a⟩ ⊗ |b⟩. */
export function kronVector(a: Vector, b: Vector): Vector {
  return a.flatMap((x) => b.map((y) => mul(x, y)));
}

export function applyToVector(m: Matrix, v: Vector): Vector {
  const n = assertSquare(m);
  if (v.length !== n)
    throw new Error(`cannot apply ${n}×${n} matrix to vector of length ${v.length}`);
  return m.map((row) => row.reduce((sum, x, j) => add(sum, mul(x, at(v, j))), ZERO));
}

/** Conjugate transpose M†. */
export function dagger(m: Matrix): Matrix {
  const n = assertSquare(m);
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => conj(at(at(m, j), i))),
  );
}

/** Inner product ⟨a|b⟩ (the bra side is conjugated). */
export function inner(a: Vector, b: Vector): Complex {
  if (a.length !== b.length) throw new Error('vector length mismatch');
  return a.reduce((sum, x, i) => add(sum, mul(conj(x), at(b, i))), ZERO);
}

export function vectorApproxEqual(a: Vector, b: Vector, tol = TOLERANCE): boolean {
  return a.length === b.length && a.every((x, i) => approxEqual(x, at(b, i), tol));
}

export function matrixApproxEqual(a: Matrix, b: Matrix, tol = TOLERANCE): boolean {
  return a.length === b.length && a.every((row, i) => vectorApproxEqual(row, at(b, i), tol));
}

export function isUnitary(m: Matrix, tol = TOLERANCE): boolean {
  return matrixApproxEqual(matMul(dagger(m), m), identity(assertSquare(m)), tol);
}
