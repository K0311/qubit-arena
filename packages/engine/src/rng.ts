/**
 * Randomness is injected so the engine stays deterministic: the server seeds one Rng per
 * match from crypto, tests use fixed seeds.
 */
export interface Rng {
  /** Uniform number in [0, 1). */
  next(): number;
}

/** mulberry32: tiny, fast 32-bit PRNG; good enough for card shuffles and coin flips. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}
