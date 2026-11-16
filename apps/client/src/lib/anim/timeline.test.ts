import { describe, expect, it } from 'vitest';
import type { BallPosition, Card, GameEvent } from '@qa/engine';
import { durationOf, sampleStep, stepsFor } from './timeline';

const play = (kind: Card['kind'], from: BallPosition, to: BallPosition): GameEvent => ({
  type: 'CARD_PLAYED',
  player: 'P1',
  card: { id: 1, kind },
  from,
  to,
  byTimeout: false,
});

const log: GameEvent[] = [
  { type: 'OPENING_ROLL', blue: 5, red: 2 },
  { type: 'KICKOFF', ball: 'ZERO' },
  play('H', 'ZERO', 'PLUS'),
  { type: 'TOUCHDOWN', side: 'BLUE', player: 'P1' },
  { type: 'KICKOFF', side: 'BLUE', ball: 'ONE' },
  play('CNOT', 'ONE', 'FOG'),
  play('X', 'FOG', 'FOG'),
  play('MEASURE', 'FOG', 'ZERO'),
  { type: 'MEASURED', outcome: 'ZERO' },
  play('MEASURE', 'ZERO', 'ZERO'),
  { type: 'MEASURED', outcome: 'ZERO' },
  play('I', 'ZERO', 'ZERO'),
];

describe('engine events → animation steps (visual-design §4)', () => {
  const steps = stepsFor(log, 0, log.length);

  it('makes one step per animated event, in order', () => {
    expect(steps.map((s) => s.kind)).toEqual([
      'roll',
      'kickoff',
      'hop',
      'touchdown',
      'kickoff',
      'fogIn',
      'fogStay',
      'measure',
      'measure',
      'hop',
    ]);
  });

  it('hops along an arc: 1.1 high when moving, 0.35 when the ball stays', () => {
    const h = steps[2]!;
    expect(h).toMatchObject({ kind: 'hop', from: 'ZERO', to: 'PLUS', height: 1.1, card: 'H' });
    const mid = sampleStep(h, 0.5);
    expect(mid.lift).toBeCloseTo(1.1);
    expect(sampleStep(h, 1).lift).toBeCloseTo(0);
    expect(steps[9]).toMatchObject({ kind: 'hop', height: 0.35 });
  });

  it('rotates the Bloch vector about the gate axis: H takes |0⟩ (z) to |+⟩ (x)', () => {
    const h = steps[2]!;
    const start = sampleStep(h, 0).bloch;
    const end = sampleStep(h, 1).bloch;
    expect(start[2]).toBeCloseTo(1);
    expect(end[0]).toBeCloseTo(1);
    // Half way the vector is still unit length: it turns, it does not shrink.
    expect(Math.hypot(...sampleStep(h, 0.5).bloch)).toBeCloseTo(1);
  });

  it('kickoff: high hop from the centre, partner back to |+⟩', () => {
    expect(steps[1]).toMatchObject({ kind: 'kickoff', from: 'CENTER', to: 'ZERO', height: 2.2 });
    expect(sampleStep(steps[4]!, 1).partner[0]).toBeCloseTo(1);
  });

  it('fog: both vectors shrink to the centre, the cloud grows, a link joins the spheres', () => {
    const f = steps[5]!;
    const end = sampleStep(f, 1);
    expect(Math.hypot(...end.bloch)).toBeCloseTo(0);
    expect(Math.hypot(...end.partner)).toBeCloseTo(0);
    expect(end.fog).toBeCloseTo(1);
    expect(end.link).toBeCloseTo(1);
    expect(end.visible).toBe(false);
  });

  it('measure out of the fog: shake first, then the cloud shrinks into the ball at the result', () => {
    const m = steps[7]!;
    expect(m).toMatchObject({ kind: 'measure', from: 'CENTER', to: 'ZERO' });
    expect(sampleStep(m, 0.15).shake).toBeGreaterThan(0);
    const end = sampleStep(m, 1);
    expect(end.fog).toBeCloseTo(0);
    expect(end.visible).toBe(true);
    expect(end.bloch[2]).toBeCloseTo(1);
  });

  it('failed punt: a small hop on the spot', () => {
    expect(steps[8]).toMatchObject({ kind: 'measure', from: 'ZERO', to: 'ZERO', height: 0.35 });
  });

  it('touchdown bounces and spins on the end zone', () => {
    const t = steps[3]!;
    expect(t).toMatchObject({ kind: 'touchdown', at: 'PLUS' });
    expect(sampleStep(t, 0.15).lift).toBeGreaterThan(0);
    expect(sampleStep(t, 1).lift).toBeCloseTo(0);
  });

  it('opening roll shows the dice the server rolled', () => {
    expect(sampleStep(steps[0]!, 1).dice).toEqual({ blue: 5, red: 2, rolling: false });
    expect(sampleStep(steps[0]!, 0.2).dice?.rolling).toBe(true);
  });

  it('durations: about 1 s per move, scaled by speed; reduce motion keeps moves short and still', () => {
    const h = steps[2]!;
    expect(durationOf(h, { speed: 1, reduce: false })).toBe(1000);
    expect(durationOf(h, { speed: 2, reduce: false })).toBe(500);
    expect(durationOf(h, { speed: 1, reduce: true })).toBe(250);
    expect(sampleStep(steps[7]!, 0.15, true).shake).toBe(0);
    expect(sampleStep(h, 0.5, true).lift).toBe(0);
  });
});
