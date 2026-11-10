import { describe, expect, it } from 'vitest';
import { boardLines } from '../src/board';
import type { SingleGate } from '../src/gates';

const linesFor = (gate: SingleGate) => boardLines().filter((l) => l.gate === gate);
const key = (l: { from: string; to: string }) => `${l.from}->${l.to}`;

describe('board lines (rules.md §2.4)', () => {
  it('T-G-46: S and √X give one-way arrows, H/X/Y/Z give two-way lines, I gives none', () => {
    for (const gate of ['S', 'SX'] as const) {
      const lines = linesFor(gate);
      expect(lines.length, gate).toBe(4);
      expect(
        lines.every((l) => !l.twoWay),
        gate,
      ).toBe(true);
    }
    for (const gate of ['H', 'X', 'Y', 'Z'] as const) {
      const lines = linesFor(gate);
      expect(lines.length, gate).toBeGreaterThan(0);
      expect(
        lines.every((l) => l.twoWay),
        gate,
      ).toBe(true);
    }
    expect(linesFor('I')).toEqual([]);
  });

  it('draws the expected lines for H and S', () => {
    expect(linesFor('H').map(key).sort()).toEqual(
      // Two-way lines are listed from the lower board index to the higher (rules.md §2.1 order).
      ['ZERO->PLUS', 'ONE->MINUS', 'MINUS_I->PLUS_I'].sort(),
    );
    expect(linesFor('S').map(key).sort()).toEqual(
      ['PLUS->PLUS_I', 'PLUS_I->MINUS', 'MINUS->MINUS_I', 'MINUS_I->PLUS'].sort(),
    );
  });

  it('lists each two-way line once and never draws a self-loop', () => {
    const all = boardLines();
    expect(all.every((l) => l.from !== l.to)).toBe(true);
    const keys = all.map((l) => `${l.gate}:${key(l)}`);
    expect(new Set(keys).size).toBe(keys.length);
    // X: ZERO↔ONE and PLUS_I↔MINUS_I. Y: ZERO↔ONE and PLUS↔MINUS. Z: PLUS↔MINUS and PLUS_I↔MINUS_I.
    for (const gate of ['X', 'Y', 'Z'] as const) expect(linesFor(gate)).toHaveLength(2);
    expect(linesFor('H')).toHaveLength(3);
  });
});
