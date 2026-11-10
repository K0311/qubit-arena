import { describe, expect, it } from 'vitest';
import { BOARD_ANGLE_DEG, boardEdges, boardLines, boardPoint } from '../src/board';
import type { SingleGate } from '../src/gates';
import { POSITIONS, type Position } from '../src/states';

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

describe('board layout (rules.md §2.1, docs/visual-design.md §2)', () => {
  it('puts the end zones at the top (|+⟩) and bottom (|−⟩), like a football field', () => {
    expect(BOARD_ANGLE_DEG.PLUS).toBe(90);
    expect(BOARD_ANGLE_DEG.MINUS).toBe(-90);
  });

  it('keeps the rules.md §2.1 order clockwise, 60° apart', () => {
    POSITIONS.forEach((p, k) => expect(BOARD_ANGLE_DEG[p], p).toBe(150 - 60 * k));
  });

  it('boardPoint gives unit-circle coordinates (y up)', () => {
    const top = boardPoint('PLUS');
    expect(top.x).toBeCloseTo(0, 12);
    expect(top.y).toBeCloseTo(1, 12);
    const zero = boardPoint('ZERO');
    expect(zero.x).toBeLessThan(0);
    expect(zero.y).toBeCloseTo(0.5, 12);
  });
});

describe('grouped board edges (Blender prototype board_edges)', () => {
  const edgeKey = (e: { a: Position; b: Position; directed: boolean }) =>
    e.directed ? `${e.a}->${e.b}` : [e.a, e.b].sort().join('<->');

  // Hand-typed from the 13 QT_Edge_* objects in the Blender prototype scene.
  const EXPECTED: Record<string, readonly SingleGate[]> = {
    'MINUS<->PLUS': ['Y', 'Z'],
    'PLUS<->ZERO': ['H'],
    'MINUS_I<->PLUS_I': ['H', 'X', 'Z'],
    'ONE<->ZERO': ['X', 'Y'],
    'MINUS<->ONE': ['H'],
    'PLUS->PLUS_I': ['S'],
    'MINUS->MINUS_I': ['S'],
    'MINUS_I->PLUS': ['S'],
    'PLUS_I->MINUS': ['S'],
    'MINUS_I->ONE': ['SX'],
    'ZERO->MINUS_I': ['SX'],
    'ONE->PLUS_I': ['SX'],
    'PLUS_I->ZERO': ['SX'],
  };

  it('has one edge per pair (13), with every gate that uses it', () => {
    const edges = boardEdges();
    expect(edges).toHaveLength(13);
    expect(Object.fromEntries(edges.map((e) => [edgeKey(e), e.gates]))).toEqual(EXPECTED);
  });

  it('agrees with boardLines: same gate moves, just grouped', () => {
    const fromEdges = boardEdges().flatMap((e) => e.gates.map((g) => `${g}:${edgeKey(e)}`));
    const fromLines = boardLines().map(
      (l) => `${l.gate}:${l.twoWay ? [l.from, l.to].sort().join('<->') : `${l.from}->${l.to}`}`,
    );
    expect(fromEdges.sort()).toEqual(fromLines.sort());
  });
});
