// Minimal complex arithmetic. The engine only needs 2×2 and 4×4 Clifford maths,
// so a tiny immutable value type beats pulling in a numeric library.

export type Complex = { readonly re: number; readonly im: number };

/** Tolerance for every floating-point comparison in the engine (CLAUDE.md). */
export const TOLERANCE = 1e-9;

export const c = (re: number, im = 0): Complex => ({ re, im });

export const add = (a: Complex, b: Complex): Complex => c(a.re + b.re, a.im + b.im);

export const sub = (a: Complex, b: Complex): Complex => c(a.re - b.re, a.im - b.im);

export const mul = (a: Complex, b: Complex): Complex =>
  c(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);

export const scale = (a: Complex, k: number): Complex => c(a.re * k, a.im * k);

export const conj = (a: Complex): Complex => c(a.re, -a.im);

/** Squared modulus |a|²; avoids a square root where only probabilities are needed. */
export const abs2 = (a: Complex): number => a.re * a.re + a.im * a.im;

export const abs = (a: Complex): number => Math.hypot(a.re, a.im);

export const approxEqual = (a: Complex, b: Complex, tol = TOLERANCE): boolean =>
  Math.abs(a.re - b.re) <= tol && Math.abs(a.im - b.im) <= tol;
