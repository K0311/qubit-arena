import { describe, expect, it } from 'vitest';
import { abs, abs2, add, approxEqual, c, conj, mul, scale, sub, TOLERANCE } from '../src/complex';

describe('complex', () => {
  it('uses the 1e-9 tolerance from CLAUDE.md', () => {
    expect(TOLERANCE).toBe(1e-9);
  });

  it('adds and subtracts', () => {
    expect(add(c(1, 2), c(3, -4))).toEqual(c(4, -2));
    expect(sub(c(1, 2), c(3, -4))).toEqual(c(-2, 6));
  });

  it('multiplies, including i * i = -1', () => {
    expect(mul(c(1, 2), c(3, 4))).toEqual(c(-5, 10));
    expect(mul(c(0, 1), c(0, 1))).toEqual(c(-1, 0));
  });

  it('scales by a real number', () => {
    expect(scale(c(1, -2), 3)).toEqual(c(3, -6));
  });

  it('conjugates', () => {
    expect(conj(c(1, 2))).toEqual(c(1, -2));
  });

  it('computes modulus and squared modulus', () => {
    expect(abs(c(3, 4))).toBe(5);
    expect(abs2(c(3, 4))).toBe(25);
  });

  it('compares within tolerance', () => {
    expect(approxEqual(c(1, 1), c(1 + 1e-12, 1 - 1e-12))).toBe(true);
    expect(approxEqual(c(1, 1), c(1 + 1e-6, 1))).toBe(false);
    expect(approxEqual(c(1, 1), c(1.1, 1), 0.2)).toBe(true);
  });

  it('does not mutate its inputs', () => {
    const a = Object.freeze(c(1, 2));
    const b = Object.freeze(c(3, 4));
    expect(() => [add(a, b), sub(a, b), mul(a, b), conj(a), scale(a, 2)]).not.toThrow();
    expect(a).toEqual(c(1, 2));
  });
});
