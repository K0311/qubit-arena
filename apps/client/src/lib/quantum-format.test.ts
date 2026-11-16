import { describe, expect, it } from 'vitest';
import {
  applyCnot,
  applySingleGate,
  c,
  kickoffState,
  productState,
  type Position,
} from '@qa/engine';
import { describeState, formatAmplitude, formatPair, formatVector } from './quantum-format';

const h = Math.SQRT1_2;

describe('amplitude text (ui-spec §7.4)', () => {
  it.each([
    [c(1), '1'],
    [c(-1), '−1'],
    [c(0, 1), 'i'],
    [c(0, -1), '−i'],
    [c(h), '1/√2'],
    [c(-h), '−1/√2'],
    [c(0, h), 'i/√2'],
    [c(0.5, 0.5), 'e^(iπ/4)/√2'],
    [c(0.5), '1/2'],
    [c(0), '0'],
  ])('%o → %s', (z, text) => expect(formatAmplitude(z)).toBe(text));
});

describe('state panel values from the engine', () => {
  it('single qubit at kickoff: |0⟩, 100/0, z = +1, no global phase', () => {
    const d = describeState(kickoffState('ZERO'));
    expect(d.single).toEqual({ alpha: expect.anything(), beta: expect.anything() });
    expect(formatAmplitude(d.single!.alpha)).toBe('1');
    expect(formatAmplitude(d.single!.beta)).toBe('0');
    expect(d.p0).toBeCloseTo(1);
    expect(d.p1).toBeCloseTo(0);
    expect(formatVector(d.bloch)).toBe('(0.00, 0.00, 1.00)');
    expect(d.globalPhase).toBeNull();
  });

  it('|+⟩ is 50/50 and the Bloch vector points along +x', () => {
    const d = describeState(productState('PLUS', 'PLUS'));
    expect(formatAmplitude(d.single!.alpha)).toBe('1/√2');
    expect(formatAmplitude(d.single!.beta)).toBe('1/√2');
    expect(d.p0).toBeCloseTo(0.5);
    expect(formatVector(d.bloch)).toBe('(1.00, 0.00, 0.00)');
  });

  it('Y|0⟩ = i|1⟩: the ball is at |1⟩ with global phase i (rules.md §2.3)', () => {
    const d = describeState(applySingleGate(kickoffState('ZERO'), 'Y'));
    expect(formatAmplitude(d.single!.beta)).toBe('i');
    expect(d.globalPhase).toBe('i');
  });

  it('in the fog: no single-qubit form, the pair as (|00⟩ + |11⟩) / √2, both vectors 0', () => {
    const fog = applyCnot(kickoffState('ZERO'));
    const d = describeState(fog);
    expect(d.single).toBeNull();
    expect(d.pair).toBe('(|00⟩ + |11⟩) / √2');
    expect(d.p0).toBeCloseTo(0.5);
    expect(formatVector(d.bloch)).toBe('(0.00, 0.00, 0.00)');
    expect(formatVector(d.partnerBloch)).toBe('(0.00, 0.00, 0.00)');
  });

  it('formats every product state without decimals', () => {
    const ps: Position[] = ['ZERO', 'ONE', 'PLUS', 'MINUS', 'PLUS_I', 'MINUS_I'];
    for (const p of ps)
      for (const f of ps) expect(formatPair(productState(p, f))).not.toMatch(/\d\.\d/);
  });
});
