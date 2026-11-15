import {
  abs,
  abs2,
  ballPosition,
  c,
  conj,
  mul,
  partnerPosition,
  POSITION_AMPLITUDES,
  productState,
  reducedBloch,
  type BlochVector,
  type Complex,
  type TwoQubitState,
} from '@qa/engine';

const EPS = 1e-9;
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

/** e^{ikπ/4} for k = 0…7, written the way a student reads it. */
const PHASE_TEXT = ['', 'e^(iπ/4)', 'i', 'e^(i3π/4)', '−', 'e^(−i3π/4)', '−i', 'e^(−iπ/4)'];

/** The phase of z as k in e^{ikπ/4}, or null when it is not a multiple of π/4. */
function eighth(z: Complex): number | null {
  const k = Math.round((Math.atan2(z.im, z.re) / Math.PI) * 4);
  return near(Math.atan2(z.im, z.re), (k * Math.PI) / 4) ? (k + 8) % 8 : null;
}

function magnitudeText(m: number): string | null {
  if (near(m, 1)) return '1';
  if (near(m, Math.SQRT1_2)) return '1/√2';
  if (near(m, 0.5)) return '1/2';
  return null;
}

/**
 * One amplitude as text: 1, −1, i, 1/√2, −i/√2, e^(iπ/4)/√2 … On this board every amplitude has
 * magnitude 1, 1/√2 or 1/2 and a phase that is a multiple of π/4 (all cards are Clifford).
 */
export function formatAmplitude(z: Complex): string {
  const m = abs(z);
  if (m < EPS) return '0';
  const k = eighth(z);
  const mag = magnitudeText(m);
  if (k === null || mag === null) {
    const sign = z.im < 0 ? '−' : '+';
    return `${z.re.toFixed(3)} ${sign} ${Math.abs(z.im).toFixed(3)}i`;
  }
  const phase = PHASE_TEXT[k]!;
  if (mag === '1') return phase === '' ? '1' : phase === '−' ? '−1' : phase;
  const den = mag.slice(2); // "√2" or "2"
  if (phase === '') return `1/${den}`;
  if (phase === '−') return `−1/${den}`;
  return `${phase}/${den}`;
}

export type FootballState = {
  /** Not entangled: |ψ⟩ = α|0⟩ + β|1⟩ for the football, including its global phase. */
  readonly single: { readonly alpha: Complex; readonly beta: Complex } | null;
  /** The global phase factor e^{iφ} that does not move the ball (rules.md §2.3), as text. */
  readonly globalPhase: string | null;
  /** The two-qubit state as text, e.g. "(|00⟩ + |11⟩) / √2" (|partner football⟩). */
  readonly pair: string;
  readonly p0: number;
  readonly p1: number;
  readonly bloch: BlochVector;
  readonly partnerBloch: BlochVector;
};

/** Everything the quantum state panel shows (ui-spec §7.4), computed with the engine. */
export function describeState(qubits: TwoQubitState): FootballState {
  const p0 = abs2(qubits[0]!) + abs2(qubits[2]!);
  const bloch = reducedBloch(qubits, 'FOOTBALL');
  const partnerBloch = reducedBloch(qubits, 'PARTNER');
  const ball = ballPosition(qubits);
  const partner = partnerPosition(qubits);

  let single: FootballState['single'] = null;
  let globalPhase: string | null = null;
  if (ball !== 'FOG' && partner !== 'FOG') {
    // ψ = e^{iφ} |partner⟩ ⊗ |ball⟩ with both kets in their textbook form; give φ to the ball.
    const canon = productState(partner, ball);
    const overlap = qubits.reduce((sum, a, i) => {
      const t = mul(conj(canon[i]!), a);
      return c(sum.re + t.re, sum.im + t.im);
    }, c(0));
    const amps = POSITION_AMPLITUDES[ball];
    single = { alpha: mul(overlap, amps[0]!), beta: mul(overlap, amps[1]!) };
    const k = eighth(overlap);
    globalPhase = k === null ? formatAmplitude(overlap) : k === 0 ? null : formatAmplitude(overlap);
  }
  return { single, globalPhase, pair: formatPair(qubits), p0, p1: 1 - p0, bloch, partnerBloch };
}

const BASIS = ['|00⟩', '|01⟩', '|10⟩', '|11⟩'];

/** "(|00⟩ + |11⟩) / √2": common magnitude pulled out, each term with its phase. */
export function formatPair(qubits: TwoQubitState): string {
  const terms = qubits.map((a, i) => ({ a, i })).filter((t) => abs(t.a) > EPS);
  const m = abs(terms[0]!.a);
  const same = terms.every((t) => near(abs(t.a), m));
  const den = near(m, Math.SQRT1_2) ? '√2' : near(m, 0.5) ? '2' : near(m, 1) ? '' : null;
  if (!same || den === null) {
    return terms.map((t) => `${formatAmplitude(t.a)}${BASIS[t.i]}`).join(' + ');
  }
  let text = '';
  terms.forEach((t, n) => {
    const unit = c(t.a.re / m, t.a.im / m);
    const phase = PHASE_TEXT[eighth(unit) ?? 0]!;
    const neg = phase === '−';
    const coef = neg || phase === '' ? '' : phase;
    if (n === 0) text += `${neg ? '−' : ''}${coef}${BASIS[t.i]}`;
    else text += ` ${neg ? '−' : '+'} ${coef}${BASIS[t.i]}`;
  });
  return den === '' ? text : `(${text}) / ${den}`;
}

/** "(0.00, 0.00, 1.00)" with the real minus sign. */
export function formatVector(v: BlochVector): string {
  const f = (x: number) => {
    const r = Math.abs(x) < 5e-3 ? 0 : x;
    return (r < 0 ? '−' : '') + Math.abs(r).toFixed(2);
  };
  return `(${v.map(f).join(', ')})`;
}
