import { describe, expect, it } from 'vitest';
import { applyCnot, productState, type CardKind, type Position, type Side } from '@qa/engine';
import { previewMove } from './preview';

const at = (football: Position, partner: Position = 'PLUS') => productState(partner, football);
const fog = () => applyCnot(at('ZERO'));
const p = (kind: CardKind, qubits: ReturnType<typeof at>, side: Side = 'BLUE') =>
  previewMove(qubits, kind, side);

describe('move preview on the public state (rules.md §6.1 step 2, ui-spec §7.3)', () => {
  it('normal move: card line, target and edge', () => {
    expect(p('H', at('ZERO'))).toMatchObject({
      line: 'H → |+⟩',
      targets: ['PLUS'],
      edge: { from: 'ZERO', to: 'PLUS' },
      touchdown: true,
      note: 'TOUCHDOWN +1',
    });
    expect(p('S', at('PLUS_I'))).toMatchObject({ line: 'S → |−⟩', targets: ['MINUS'] });
  });

  it('ball stays', () => {
    expect(p('I', at('PLUS_I'))).toMatchObject({
      line: 'stays at |i⟩',
      targets: ['PLUS_I'],
      edge: null,
      touchdown: false,
    });
  });

  it('touchdown only into your own zone; the other zone and staying never score', () => {
    expect(p('Z', at('MINUS'), 'BLUE')).toMatchObject({ touchdown: true, note: 'TOUCHDOWN +1' });
    expect(p('Z', at('PLUS'), 'BLUE')).toMatchObject({
      touchdown: false,
      note: "NO SCORE — Red's endzone",
    });
    expect(p('Z', at('PLUS'), 'RED')).toMatchObject({ touchdown: true });
    expect(p('X', at('PLUS'), 'BLUE')).toMatchObject({
      line: 'stays at |+⟩',
      touchdown: false,
      note: 'NO SCORE — must leave and re-enter',
    });
    expect(p('Y', at('MINUS'), 'BLUE')).toMatchObject({ note: 'TOUCHDOWN +1' });
    expect(p('Y', at('PLUS'), 'RED')).toMatchObject({ note: 'TOUCHDOWN +1' });
    expect(p('Y', at('MINUS'), 'RED')).toMatchObject({ note: "NO SCORE — Blue's endzone" });
  });

  it('measure: 50/50 off the z axis, failed punt on it', () => {
    expect(p('MEASURE', at('PLUS'))).toMatchObject({
      line: '→ |0⟩/|1⟩ 50 %',
      targets: ['ZERO', 'ONE'],
      touchdown: false,
    });
    expect(p('MEASURE', at('ONE'))).toMatchObject({
      line: 'failed punt',
      targets: ['ONE'],
      edge: null,
    });
  });

  it('CNOT with the partner at |+⟩ (rules.md §4.3)', () => {
    for (const ball of ['ZERO', 'ONE', 'PLUS_I', 'MINUS_I'] as const) {
      expect(p('CNOT', at(ball))).toMatchObject({ line: 'enters the fog', targets: [] });
    }
    expect(p('CNOT', at('PLUS'))).toMatchObject({ line: 'nothing changes', targets: ['PLUS'] });
    expect(p('CNOT', at('MINUS'))).toMatchObject({
      line: 'partner → |−⟩',
      targets: ['MINUS'],
      touchdown: false,
    });
  });

  it('in the fog (rules.md §4.4)', () => {
    expect(p('H', fog())).toMatchObject({ line: 'stays in fog', targets: [] });
    expect(p('MEASURE', fog())).toMatchObject({
      line: 'measure: 50 % |0⟩ / 50 % |1⟩',
      targets: ['ZERO', 'ONE'],
    });
    expect(p('CNOT', fog())).toMatchObject({ line: 'leaves fog → |0⟩', targets: ['ZERO'] });
  });

  it('after a measurement CNOT acts like X when the partner is |1⟩', () => {
    expect(p('CNOT', at('PLUS_I', 'ONE'))).toMatchObject({
      line: 'CNOT → |−i⟩',
      targets: ['MINUS_I'],
    });
  });
});
