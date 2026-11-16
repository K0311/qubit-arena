import type { BlochVector, SingleGate } from '@qa/engine';

export type Vec = readonly [number, number, number];

/**
 * Each single-qubit card as a rotation of the Bloch sphere (visual-design §4): X, Y, Z half
 * turns about their axes, H a half turn about (x+z)/√2, S and √X quarter turns about z and x.
 * Positive angle = right-hand rule. A test checks every rotation against the engine.
 */
export const GATE_ROTATION: Readonly<Record<SingleGate, { axis: Vec; angle: number } | null>> = {
  X: { axis: [1, 0, 0], angle: Math.PI },
  Y: { axis: [0, 1, 0], angle: Math.PI },
  Z: { axis: [0, 0, 1], angle: Math.PI },
  H: { axis: [Math.SQRT1_2, 0, Math.SQRT1_2], angle: Math.PI },
  S: { axis: [0, 0, 1], angle: Math.PI / 2 },
  SX: { axis: [1, 0, 0], angle: Math.PI / 2 },
  I: null,
};

/** Rodrigues' rotation of v about the unit axis k by angle θ. */
export function rotate(v: Vec | BlochVector, k: Vec, theta: number): Vec {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const dot = v[0] * k[0] + v[1] * k[1] + v[2] * k[2];
  const cross: Vec = [
    k[1] * v[2] - k[2] * v[1],
    k[2] * v[0] - k[0] * v[2],
    k[0] * v[1] - k[1] * v[0],
  ];
  return [0, 1, 2].map((i) => v[i]! * c + cross[i]! * s + k[i]! * dot * (1 - c)) as unknown as Vec;
}

export const lerpVec = (a: Vec, b: Vec, t: number): Vec =>
  [0, 1, 2].map((i) => a[i]! + (b[i]! - a[i]!) * t) as unknown as Vec;

/** Smoothstep easing used for every move (visual-design §4). */
export const smooth = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};
