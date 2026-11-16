import {
  boardPoint,
  END_ZONE,
  mulberry32,
  POSITIONS,
  type BallPosition,
  type Position,
  type Side,
} from '@qa/engine';
import { stateColors } from '../../theme/state-colors';

/** Blender prototype sizes (visual-design §2): path radius 4.6, dome radius 0.72. */
export const BOARD_RADIUS = 4.6;
export const DOME_RADIUS = 0.72;

export type Vec3 = [number, number, number];

/**
 * Board position in three.js space (y up). boardPoint() has |+⟩ at +y; on the table that is
 * the far side (−z), so the default camera at +z sees |+⟩ at the top, as in the 2D board.
 */
export function point3(p: Position): Vec3 {
  const b = boardPoint(p);
  return [b.x * BOARD_RADIUS, 0, -b.y * BOARD_RADIUS];
}

/** An edge from rim to rim, so lines and arrowheads do not run into the domes. */
export function edgeSegment(a: Position, b: Position): { from: Vec3; to: Vec3 } {
  const pa = point3(a);
  const pb = point3(b);
  const d = pb.map((v, i) => v - pa[i]!) as Vec3;
  const len = Math.hypot(...d);
  const gap = DOME_RADIUS + 0.22;
  const u = d.map((v) => v / len) as Vec3;
  return {
    from: pa.map((v, i) => v + u[i]! * gap) as Vec3,
    to: pb.map((v, i) => v - u[i]! * gap) as Vec3,
  };
}

export type SwirlLayer = { positions: Float32Array; colors: Float32Array; loops: number };

const SWIRL_PALETTE = [
  ...POSITIONS.map((p) => stateColors[p]),
  '#FFFFFF',
  '#FFD14D', // gold
  '#598CFF', // rim blue
];

const hexToRgb = (hex: string): Vec3 => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/**
 * The orbit swirl from the Blender prototype (create_board_orbit): closed loops around the
 * ring radius that wobble in and out and up and down, spread over 3 layers that rotate at
 * different speeds. Seeded, so the board looks the same for everyone. Each layer is one
 * line-segment buffer, so the whole swirl is 3 draw calls however many loops it has.
 */
export function swirlLayers(loops = 57, points = 160, seed = 11): SwirlLayer[] {
  const rng = mulberry32(seed);
  const uni = (a: number, b: number) => a + (b - a) * rng.next();
  const gauss = () => {
    const u = Math.max(rng.next(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng.next());
  };
  const buffers: { pos: number[]; col: number[]; loops: number }[] = [0, 1, 2].map(() => ({
    pos: [],
    col: [],
    loops: 0,
  }));
  for (let k = 0; k < loops; k++) {
    const layer = buffers[k % 3]!;
    layer.loops++;
    const r0 = BOARD_RADIUS + gauss() * 0.5;
    const [a1, a2, a3] = [uni(0.1, 0.5), uni(0.05, 0.25), uni(0, 0.15)];
    const [p1, p2, p3, p4] = [0, 0, 0, 0].map(() => uni(0, 2 * Math.PI)) as Vec3 & number[];
    const zamp = uni(0.1, 0.7);
    const zf = 1 + Math.floor(rng.next() * 3);
    const color = hexToRgb(SWIRL_PALETTE[Math.floor(rng.next() * SWIRL_PALETTE.length)]!);
    const at = (i: number): Vec3 => {
      const t = (2 * Math.PI * i) / points;
      const r =
        r0 + a1 * Math.sin(2 * t + p1) + a2 * Math.sin(5 * t + p2) + a3 * Math.sin(9 * t + p3!);
      return [r * Math.cos(t), zamp * Math.sin(zf * t + p4!), r * Math.sin(t)];
    };
    for (let i = 0; i < points; i++) {
      layer.pos.push(...at(i), ...at(i + 1));
      layer.col.push(...color, ...color);
    }
  }
  return buffers.map((b) => ({
    positions: new Float32Array(b.pos),
    colors: new Float32Array(b.col),
    loops: b.loops,
  }));
}

export const CAMERA_VIEWS = ['GOAL', 'OVERVIEW', 'TOP', 'BALL', 'LOW'] as const;
export type CameraView = (typeof CAMERA_VIEWS)[number];

/** Blender (x, y, z) with z up → three.js (x, y, z) with y up. */
const fromBlender = (x: number, y: number, z: number): Vec3 => [x, z, -y];

/**
 * Camera poses from the prototype's camera_pose() (visual-design §5). Goal view: behind the
 * opponent's end zone, looking at the viewer's own end zone, high enough that the Bloch
 * sphere does not hide it.
 */
export function cameraPose(
  view: CameraView,
  side: Side,
  ctx: { ball?: BallPosition; active?: Side } = {},
): { position: Vec3; target: Vec3 } {
  const s = side === 'BLUE' ? 1 : -1;
  switch (view) {
    case 'GOAL':
      return { position: fromBlender(0, -9.5 * s, 14), target: fromBlender(0, 1.2 * s, 0.5) };
    case 'TOP':
      return { position: [0, 22, 0.001], target: [0, 0, 0] };
    case 'LOW':
      return { position: fromBlender(10, -10, 6), target: fromBlender(0, 0, 1.2) };
    case 'BALL': {
      const goal = point3(END_ZONE[ctx.active ?? side]);
      const ball = ctx.ball && ctx.ball !== 'FOG' ? point3(ctx.ball) : ([0, 0, 0] as Vec3);
      let dx = goal[0] - ball[0];
      let dz = goal[2] - ball[2];
      let len = Math.hypot(dx, dz);
      if (len < 0.5) {
        // Ball already on the goal: look across the board toward it.
        dx = goal[0];
        dz = goal[2];
        len = Math.hypot(dx, dz);
      }
      dx /= len;
      dz /= len;
      return {
        position: [ball[0] - dx * 7, 12.5, ball[2] - dz * 7],
        target: [ball[0] + dx * 2.5, 0.5, ball[2] + dz * 2.5],
      };
    }
    case 'OVERVIEW':
    default:
      return { position: fromBlender(0, -8, 17), target: fromBlender(0, 0, 0.4) };
  }
}

/** True when the browser can draw the 3D board; otherwise the 2D board is used (ui-spec §12). */
export function hasWebGL(): boolean {
  try {
    if (typeof document === 'undefined') return false;
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}
