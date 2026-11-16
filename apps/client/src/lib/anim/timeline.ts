import {
  END_ZONE,
  reducedBloch,
  type CardKind,
  type GameEvent,
  type Position,
  type Side,
  type SingleGate,
  type TwoQubitState,
} from '@qa/engine';
import { replayStates } from '../replay';
import { GATE_ROTATION, lerpVec, rotate, smooth, type Vec } from './rotate';

/** Where the ball can be drawn: a dome, or the board centre (fog, kickoff). */
export type Spot = Position | 'CENTER';

type Vectors = { blochFrom: Vec; blochTo: Vec; partnerFrom: Vec; partnerTo: Vec };

/** One animation, built only from engine events (visual-design §4). */
export type Step =
  | ({
      kind: 'hop';
      from: Position;
      to: Position;
      height: number;
      card: CardKind;
      rotation: { axis: Vec; angle: number } | null;
    } & Vectors)
  | ({ kind: 'measure'; from: Spot; to: Position; height: number; card: CardKind } & Vectors)
  | ({ kind: 'fogIn'; from: Position; card: CardKind } & Vectors)
  | ({ kind: 'fogOut'; to: Position; card: CardKind } & Vectors)
  | ({ kind: 'fogStay'; card: CardKind } & Vectors)
  | ({ kind: 'kickoff'; from: 'CENTER'; to: Position; height: number } & Vectors)
  | { kind: 'touchdown'; at: Position; side: Side }
  | { kind: 'roll'; blue: number; red: number };

/** What every renderer needs at one moment of a step. */
export type Frame = {
  from: Spot;
  to: Spot;
  /** Eased progress along the path from `from` to `to`. */
  p: number;
  /** Height above the dome top, in board units (Blender scale). */
  lift: number;
  visible: boolean;
  /** Fog cloud amount, 0–1. */
  fog: number;
  /** Shake amount, 0–1 (measurement). */
  shake: number;
  spin: number;
  bloch: Vec;
  partner: Vec;
  /** Glowing link between the two spheres while entangled, 0–1. */
  link: number;
  /** Dome the ball lands on, for the squash; 0–1 how far into the landing. */
  landing: Position | null;
  squash: number;
  dice?: { blue: number; red: number; rolling: boolean };
};

const ZERO: Vec = [0, 0, 0];
const PLUS: Vec = [1, 0, 0];
const vec = (q: TwoQubitState | null, which: 'FOOTBALL' | 'PARTNER'): Vec =>
  q ? (reducedBloch(q, which) as Vec) : ZERO;

/** Animation steps for log[start..end), using the state replayed from the whole log. */
export function stepsFor(log: readonly GameEvent[], start: number, end: number): Step[] {
  const states = replayStates(log);
  const steps: Step[] = [];
  for (let i = start; i < end; i++) {
    const e = log[i]!;
    const before = i > 0 ? (states[i - 1] ?? null) : null;
    const after = states[i] ?? null;
    const v: Vectors = {
      blochFrom: vec(before, 'FOOTBALL'),
      blochTo: vec(after, 'FOOTBALL'),
      partnerFrom: vec(before, 'PARTNER'),
      partnerTo: vec(after, 'PARTNER'),
    };
    switch (e.type) {
      case 'OPENING_ROLL':
        steps.push({ kind: 'roll', blue: e.blue, red: e.red });
        break;
      case 'KICKOFF':
        steps.push({
          kind: 'kickoff',
          from: 'CENTER',
          to: e.ball,
          height: 2.2,
          ...v,
          partnerTo: PLUS,
        });
        break;
      case 'TOUCHDOWN':
        steps.push({ kind: 'touchdown', at: END_ZONE[e.side], side: e.side });
        break;
      case 'CARD_PLAYED': {
        const card = e.card.kind;
        const { from, to } = e;
        if (card === 'MEASURE') {
          if (to === 'FOG') break; // cannot happen: Measure always collapses
          const spot: Spot = from === 'FOG' ? 'CENTER' : from;
          steps.push({
            kind: 'measure',
            from: spot,
            to,
            height: spot === to ? 0.35 : 1.1,
            card,
            ...v,
          });
        } else if (from !== 'FOG' && to === 'FOG') {
          steps.push({ kind: 'fogIn', from, card, ...v });
        } else if (from === 'FOG' && to !== 'FOG') {
          steps.push({ kind: 'fogOut', to, card, ...v });
        } else if (from === 'FOG' && to === 'FOG') {
          steps.push({ kind: 'fogStay', card, ...v });
        } else if (from !== 'FOG' && to !== 'FOG') {
          const rotation = card === 'CNOT' ? null : GATE_ROTATION[card as SingleGate];
          steps.push({
            kind: 'hop',
            from,
            to,
            height: from === to ? 0.35 : 1.1,
            card,
            rotation,
            ...v,
          });
        }
        break;
      }
      default:
        break;
    }
  }
  return steps;
}

const BASE_MS: Record<Step['kind'], number> = {
  hop: 1000,
  measure: 1500,
  fogIn: 1200,
  fogOut: 1200,
  fogStay: 800,
  kickoff: 1200,
  touchdown: 1000,
  roll: 1800,
};

/** Default 1 s per move, divided by the speed setting; reduce motion keeps moves at 250 ms. */
export function durationOf(step: Step, opts: { speed: number; reduce: boolean }): number {
  if (opts.reduce) return step.kind === 'roll' ? 600 : 250;
  return Math.round(BASE_MS[step.kind] / opts.speed);
}

const arc = (p: number, h: number) => 4 * h * p * (1 - p);

/** The state of one step at time t ∈ [0, 1]. Pure, so every renderer and test agrees. */
export function sampleStep(step: Step, t: number, reduce = false): Frame {
  const k = Math.min(1, Math.max(0, t));
  const base: Frame = {
    from: 'CENTER',
    to: 'CENTER',
    p: 1,
    lift: 0,
    visible: true,
    fog: 0,
    shake: 0,
    spin: 0,
    bloch: ZERO,
    partner: ZERO,
    link: 0,
    landing: null,
    squash: 0,
  };
  const land = (to: Position, from: number) =>
    k > from ? { landing: to, squash: reduce ? 0 : (k - from) / (1 - from) } : {};

  switch (step.kind) {
    case 'hop': {
      const p = smooth(k);
      const bloch = step.rotation
        ? rotate(step.blochFrom, step.rotation.axis, step.rotation.angle * p)
        : lerpVec(step.blochFrom, step.blochTo, p);
      return {
        ...base,
        from: step.from,
        to: step.to,
        p,
        lift: reduce ? 0 : arc(p, step.height),
        bloch: k >= 1 ? step.blochTo : bloch,
        partner: lerpVec(step.partnerFrom, step.partnerTo, p),
        ...land(step.to, 0.85),
      };
    }
    case 'measure': {
      // Shake for the first 30 %, then hop to the result while the vector settles.
      const shakeEnd = reduce ? 0 : 0.3;
      const inShake = k < shakeEnd;
      const q = inShake ? 0 : smooth((k - shakeEnd) / (1 - shakeEnd));
      const fromFog = step.from === 'CENTER';
      return {
        ...base,
        from: step.from,
        to: step.to,
        p: q,
        lift: reduce || inShake ? 0 : arc(q, step.height),
        shake: inShake ? Math.sin((k / shakeEnd) * Math.PI) : 0,
        visible: !fromFog || !inShake,
        fog: fromFog ? 1 - q : 0,
        link: fromFog ? 1 - q : 0,
        bloch: lerpVec(step.blochFrom, step.blochTo, q),
        partner: lerpVec(step.partnerFrom, step.partnerTo, q),
        ...land(step.to, 0.85),
      };
    }
    case 'fogIn': {
      const p = smooth(k);
      return {
        ...base,
        from: step.from,
        to: 'CENTER',
        p,
        lift: reduce ? 0 : arc(p, 0.8),
        visible: p < 0.6,
        fog: p,
        link: p,
        bloch: lerpVec(step.blochFrom, ZERO, p),
        partner: lerpVec(step.partnerFrom, ZERO, p),
      };
    }
    case 'fogOut': {
      const p = smooth(k);
      return {
        ...base,
        from: 'CENTER',
        to: step.to,
        p,
        lift: reduce ? 0 : arc(p, 1.1),
        visible: p > 0.2,
        fog: 1 - p,
        link: 1 - p,
        bloch: lerpVec(ZERO, step.blochTo, p),
        partner: lerpVec(ZERO, step.partnerTo, p),
        ...land(step.to, 0.85),
      };
    }
    case 'fogStay':
      return { ...base, visible: false, fog: 1, link: 1 };
    case 'kickoff': {
      const p = smooth(k);
      return {
        ...base,
        from: 'CENTER',
        to: step.to,
        p,
        lift: reduce ? 0 : arc(p, step.height),
        bloch: lerpVec(ZERO, step.blochTo, p),
        partner: lerpVec(step.partnerFrom, step.partnerTo, p),
        ...land(step.to, 0.85),
      };
    }
    case 'touchdown':
      return {
        ...base,
        from: step.at,
        to: step.at,
        lift: reduce ? 0 : Math.abs(Math.sin(k * Math.PI * 3)) * 0.6 * (1 - k),
        spin: reduce ? 0 : k * Math.PI * 2,
      };
    case 'roll':
      return {
        ...base,
        visible: false,
        dice: { blue: step.blue, red: step.red, rolling: k < 0.75 },
      };
  }
}

/** Frames for steps that leave the ball where the board already shows it (no move). */
export const movesBall = (s: Step) => s.kind !== 'roll';
