import { describe, expect, it } from 'vitest';
import { abs, c } from '../src/complex';
import { inner, vectorApproxEqual } from '../src/matrix';
import { GATE_TABLE, SINGLE_GATES, type SingleGate } from '../src/gates';
import { POSITIONS, type BallPosition, type Position } from '../src/states';
import { mulberry32, type Rng } from '../src/rng';
import {
  applyCnot,
  applySingleGate,
  ballPosition,
  blochLength,
  kickoffState,
  measureFootball,
  norm,
  partnerPosition,
  productState,
  reducedBloch,
  type TwoQubitState,
} from '../src/quantum';

const TOL = 1e-9;
const FOG_ENTRY: readonly Position[] = ['ZERO', 'ONE', 'PLUS_I', 'MINUS_I'];

const expectNormalised = (s: TwoQubitState) => expect(Math.abs(norm(s) - 1)).toBeLessThan(TOL);
const fogFrom = (ball: Position) => applyCnot(productState('PLUS', ball));

describe('partner qubit, CNOT and fog (SE-2)', () => {
  it.each(FOG_ENTRY)('T-C-01: partner |+⟩, football %s → CNOT → FOG', (ball) => {
    const s = fogFrom(ball);
    expect(ballPosition(s)).toBe('FOG');
    expect(blochLength(reducedBloch(s, 'FOOTBALL'))).toBeLessThan(TOL);
    expect(blochLength(reducedBloch(s, 'PARTNER'))).toBeLessThan(TOL);
    expectNormalised(s);
  });

  it('T-C-02: partner |+⟩, football PLUS → CNOT changes nothing', () => {
    const before = productState('PLUS', 'PLUS');
    const after = applyCnot(before);
    expect(vectorApproxEqual(after, before)).toBe(true);
    expect(ballPosition(after)).toBe('PLUS');
    expect(partnerPosition(after)).toBe('PLUS');
  });

  it('T-C-03: partner |+⟩, football MINUS → football stays MINUS, partner becomes |−⟩', () => {
    const after = applyCnot(productState('PLUS', 'MINUS'));
    expect(ballPosition(after)).toBe('MINUS');
    expect(partnerPosition(after)).toBe('MINUS');
  });

  it('T-C-04: two CNOTs in a row restore the previous state', () => {
    for (const p of POSITIONS) {
      for (const f of POSITIONS) {
        const before = productState(p, f);
        const after = applyCnot(applyCnot(before));
        expect(abs(inner(before, after))).toBeCloseTo(1, 9);
        expect(vectorApproxEqual(after, before)).toBe(true);
      }
    }
  });

  it('T-C-05: Bell state |00⟩+|11⟩ has football Bloch vector (0, 0, 0)', () => {
    const h = 1 / Math.SQRT2;
    const bell: TwoQubitState = [c(h, 0), c(0, 0), c(0, 0), c(h, 0)];
    const [x, y, z] = reducedBloch(bell, 'FOOTBALL');
    expect(Math.abs(x)).toBeLessThan(TOL);
    expect(Math.abs(y)).toBeLessThan(TOL);
    expect(Math.abs(z)).toBeLessThan(TOL);
    expect(ballPosition(bell)).toBe('FOG');
  });

  it.each(SINGLE_GATES)('T-C-06: in the fog, %s keeps the ball in FOG and normalised', (gate) => {
    for (const ball of FOG_ENTRY) {
      const s = applySingleGate(fogFrom(ball), gate);
      expect(ballPosition(s)).toBe('FOG');
      expectNormalised(s);
    }
  });

  it.each(FOG_ENTRY)(
    'T-C-07: in the fog (from %s), Measure gives ZERO/ONE 45–55 %% and collapses the partner',
    (ball) => {
      const fog = fogFrom(ball);
      let zeros = 0;
      for (let seed = 0; seed < 4000; seed++) {
        const { state, outcome } = measureFootball(fog, mulberry32(seed));
        expect(ballPosition(state)).toBe(outcome);
        const partner = partnerPosition(state);
        expect(partner).not.toBe('FOG');
        expectNormalised(state);
        if (ball === 'ZERO') {
          // Bell state: the partner is perfectly correlated with the football.
          expect(partner).toBe(outcome);
        }
        if (outcome === 'ZERO') zeros++;
      }
      expect(zeros / 4000).toBeGreaterThanOrEqual(0.45);
      expect(zeros / 4000).toBeLessThanOrEqual(0.55);
    },
  );

  it('T-C-08: CNOT acts as I with partner |0⟩ and as X with partner |1⟩', () => {
    for (const f of POSITIONS) {
      const with0 = applyCnot(productState('ZERO', f));
      expect(ballPosition(with0)).toBe(f);
      expect(partnerPosition(with0)).toBe('ZERO');
      const with1 = applyCnot(productState('ONE', f));
      expect(ballPosition(with1)).toBe(GATE_TABLE.X[f]);
      expect(partnerPosition(with1)).toBe('ONE');
    }
    // And after a real measurement out of the fog the partner is |0⟩ or |1⟩.
    const seen = new Set<string>();
    for (let seed = 0; seen.size < 2; seed++) {
      const { state } = measureFootball(fogFrom('ZERO'), mulberry32(seed));
      const partner = partnerPosition(state);
      seen.add(String(partner));
      const ball = ballPosition(state) as Position;
      const expected = partner === 'ZERO' ? ball : GATE_TABLE.X[ball];
      expect(ballPosition(applyCnot(state))).toBe(expected);
    }
  });

  it('T-C-09: Clifford invariant: after 200 random cards the ball is always a position or FOG', () => {
    type Op = SingleGate | 'CNOT' | 'MEASURE';
    const ops: readonly Op[] = [...SINGLE_GATES, 'CNOT', 'MEASURE'];
    const valid = new Set<BallPosition>([...POSITIONS, 'FOG']);
    for (let seed = 0; seed < 1000; seed++) {
      const rng: Rng = mulberry32(seed);
      let s = kickoffState(rng.next() < 0.5 ? 'ZERO' : 'ONE');
      for (let step = 0; step < 200; step++) {
        const op = ops[Math.floor(rng.next() * ops.length)] as Op;
        if (op === 'CNOT') s = applyCnot(s);
        else if (op === 'MEASURE') s = measureFootball(s, rng).state;
        else s = applySingleGate(s, op);
        const pos = ballPosition(s);
        if (!valid.has(pos) || Math.abs(norm(s) - 1) > TOL) {
          throw new Error(`invariant broken at seed ${seed}, step ${step}, op ${op}`);
        }
      }
    }
  });

  it.each(['ZERO', 'ONE'] as const)(
    'T-C-10: kickoff with ball %s resets the partner to |+⟩',
    (ball) => {
      const s = kickoffState(ball);
      expect(partnerPosition(s)).toBe('PLUS');
      expect(ballPosition(s)).toBe(ball);
      expectNormalised(s);
    },
  );
});

describe('measurement Born rule (SE-3)', () => {
  it.each(['ZERO', 'ONE'] as const)('measuring %s is a failed punt (never moves)', (ball) => {
    for (let seed = 0; seed < 4000; seed++) {
      const { state, outcome } = measureFootball(productState('PLUS', ball), mulberry32(seed));
      expect(outcome).toBe(ball);
      expect(ballPosition(state)).toBe(ball);
    }
  });

  it.each(['PLUS', 'MINUS', 'PLUS_I', 'MINUS_I'] as const)(
    'measuring %s gives 45–55 %% ZERO over 4,000 trials',
    (ball) => {
      let zeros = 0;
      for (let seed = 0; seed < 4000; seed++) {
        const { outcome } = measureFootball(productState('PLUS', ball), mulberry32(seed));
        if (outcome === 'ZERO') zeros++;
      }
      expect(zeros / 4000).toBeGreaterThanOrEqual(0.45);
      expect(zeros / 4000).toBeLessThanOrEqual(0.55);
    },
  );

  it('measuring an unentangled ball leaves the partner untouched', () => {
    const { state } = measureFootball(productState('MINUS', 'PLUS_I'), mulberry32(3));
    expect(partnerPosition(state)).toBe('MINUS');
  });
});

describe('purity', () => {
  it('quantum operations never mutate their input state', () => {
    const s = Object.freeze(productState('PLUS', 'ZERO').map((a) => Object.freeze(a)));
    expect(() => {
      applySingleGate(s, 'H');
      applyCnot(s);
      measureFootball(s, mulberry32(1));
    }).not.toThrow();
    expect(vectorApproxEqual(s, productState('PLUS', 'ZERO'))).toBe(true);
  });

  it('rejects a state that is neither a position nor fog (invariant guard)', () => {
    // cos/sin mix of |00⟩ and |11⟩ is partially entangled: Bloch length strictly between 0 and 1.
    const s: TwoQubitState = [c(Math.cos(0.3), 0), c(0, 0), c(0, 0), c(Math.sin(0.3), 0)];
    expect(() => ballPosition(s)).toThrow();
  });
});
