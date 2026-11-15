import { describe, expect, it } from 'vitest';
import { SINGLE_GATES } from '@qa/engine';
import { boardEffect } from './gate-effects';

describe('board effect lines generated from the engine (ui-spec §8.2)', () => {
  it('match the Board effect column of the §8.2 table', () => {
    const lines = Object.fromEntries(SINGLE_GATES.map((g) => [g, boardEffect(g)]));
    expect(lines).toEqual({
      I: 'stays everywhere',
      X: '|0⟩ ↔ |1⟩, |i⟩ ↔ |−i⟩ · |+⟩, |−⟩ stay',
      Y: '|0⟩ ↔ |1⟩, |+⟩ ↔ |−⟩ · |i⟩, |−i⟩ stay',
      Z: '|+⟩ ↔ |−⟩, |i⟩ ↔ |−i⟩ · |0⟩, |1⟩ stay',
      H: '|0⟩ ↔ |+⟩, |1⟩ ↔ |−⟩, |i⟩ ↔ |−i⟩',
      S: '|+⟩ → |i⟩ → |−⟩ → |−i⟩ → |+⟩ · |0⟩, |1⟩ stay',
      SX: '|0⟩ → |−i⟩ → |1⟩ → |i⟩ → |0⟩ · |+⟩, |−⟩ stay',
    });
  });

  it('snapshot of every line, so a change to the engine shows up in review', () => {
    expect(SINGLE_GATES.map((g) => `${g}: ${boardEffect(g)}`)).toMatchSnapshot();
  });
});
