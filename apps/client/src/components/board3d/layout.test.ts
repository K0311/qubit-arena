import { describe, expect, it } from 'vitest';
import { boardEdges, POSITIONS } from '@qa/engine';
import {
  BOARD_RADIUS,
  CAMERA_VIEWS,
  cameraPose,
  DOME_RADIUS,
  edgeSegment,
  hasWebGL,
  point3,
  swirlLayers,
} from './layout';

describe('3D board layout (visual-design §2, Blender path radius 4.6)', () => {
  it('puts every position on the ring from boardPoint(); |+⟩ far (−z), |−⟩ near (+z)', () => {
    for (const p of POSITIONS) {
      const [x, y, z] = point3(p);
      expect(Math.hypot(x, z)).toBeCloseTo(BOARD_RADIUS);
      expect(y).toBe(0);
    }
    expect(point3('PLUS')[2]).toBeCloseTo(-BOARD_RADIUS);
    expect(point3('MINUS')[2]).toBeCloseTo(BOARD_RADIUS);
  });

  it('edges stop at the dome rim and keep their direction', () => {
    for (const e of boardEdges()) {
      const { from, to } = edgeSegment(e.a, e.b);
      const full = Math.hypot(...point3(e.b).map((v, i) => v - point3(e.a)[i]!));
      const short = Math.hypot(...to.map((v, i) => v - from[i]!));
      expect(short).toBeLessThan(full - 2 * DOME_RADIUS + 1e-9);
    }
  });
});

describe('orbit swirl (visual-design §3: about 57 loops in 3 layers)', () => {
  it('builds 57 closed loops in 3 layers, the same every time', () => {
    const a = swirlLayers();
    const b = swirlLayers();
    expect(a).toHaveLength(3);
    expect(a.reduce((n, l) => n + l.loops, 0)).toBe(57);
    expect(a[0]!.positions).toEqual(b[0]!.positions);
    // Line segments: two vertices of 3 floats per segment, one colour per vertex.
    for (const l of a) expect(l.positions.length).toBe(l.colors.length);
  });

  it('can draw fewer loops for slow machines', () => {
    expect(swirlLayers(24).reduce((n, l) => n + l.loops, 0)).toBe(24);
  });
});

describe('cameras (visual-design §5)', () => {
  const dir = (side: 'BLUE' | 'RED') => {
    const { position, target } = cameraPose('GOAL', side);
    return target[2] - position[2];
  };

  it('goal view looks toward the viewer’s own end zone: Blue toward |+⟩, Red toward |−⟩', () => {
    expect(dir('BLUE')).toBeLessThan(0); // toward −z, where |+⟩ is
    expect(dir('RED')).toBeGreaterThan(0); // toward +z, where |−⟩ is
    expect(cameraPose('GOAL', 'BLUE').position[1]).toBeGreaterThan(10); // high, over the sphere
  });

  it('top view looks straight down with |+⟩ at the top; every view has a pose', () => {
    const top = cameraPose('TOP', 'BLUE');
    expect(top.position[0]).toBeCloseTo(0);
    expect(top.position[1]).toBeGreaterThan(15);
    for (const v of CAMERA_VIEWS) expect(cameraPose(v, 'RED').position).toHaveLength(3);
  });

  it('ball cam sits behind the ball, looking toward the active side’s goal', () => {
    const { position, target } = cameraPose('BALL', 'BLUE', { ball: 'MINUS_I', active: 'BLUE' });
    const ball = point3('MINUS_I');
    const goal = point3('PLUS');
    const look = [target[0] - position[0], target[2] - position[2]];
    const want = [goal[0] - ball[0], goal[2] - ball[2]];
    expect(look[0]! * want[0]! + look[1]! * want[1]!).toBeGreaterThan(0);
  });
});

describe('WebGL detection', () => {
  it('is false in jsdom, so tests and old browsers get the 2D board', () => {
    expect(hasWebGL()).toBe(false);
  });
});
