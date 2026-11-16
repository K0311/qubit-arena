import { describe, expect, it } from 'vitest';
import { applyGate, BLOCH_VECTORS, POSITIONS, SINGLE_GATES } from '@qa/engine';
import { GATE_ROTATION, lerpVec, rotate } from './rotate';

const close = (a: readonly number[], b: readonly number[]) =>
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 9));

describe('Bloch rotation per gate (visual-design §4)', () => {
  it('rotating each position by the gate axis lands where the engine sends the ball', () => {
    for (const g of SINGLE_GATES) {
      for (const p of POSITIONS) {
        const r = GATE_ROTATION[g];
        const out = r ? rotate(BLOCH_VECTORS[p], r.axis, r.angle) : BLOCH_VECTORS[p];
        close(out, BLOCH_VECTORS[applyGate(g, p)]);
      }
    }
  });

  it('uses the axes and angles of the spec: H about (x+z)/√2, S and √X a quarter turn', () => {
    expect(GATE_ROTATION.I).toBeNull();
    expect(GATE_ROTATION.S!.angle).toBeCloseTo(Math.PI / 2);
    expect(GATE_ROTATION.SX!.angle).toBeCloseTo(Math.PI / 2);
    close(GATE_ROTATION.H!.axis, [Math.SQRT1_2, 0, Math.SQRT1_2]);
    // Half way through an X the vector of |0⟩ points along −y (the rotation passes |−i⟩).
    close(rotate([0, 0, 1], [1, 0, 0], Math.PI / 2), [0, -1, 0]);
  });

  it('lerps vectors, e.g. shrinking to the centre in the fog', () => {
    close(lerpVec([0, 0, 1], [0, 0, 0], 0.25), [0, 0, 0.75]);
  });
});
