import type { BallPosition, BlochVector, TwoQubitState } from '@qa/engine';
import { en } from '../../i18n/en';
import { KET } from '../../lib/format';
import { describeState, formatAmplitude, formatVector } from '../../lib/quantum-format';

/** Oblique projection (z up, y right, x toward the viewer), as on the gate cards. */
const project = ([x, y, z]: BlochVector | readonly number[], r: number) => ({
  px: (y! - x! * 0.45) * r,
  py: (-z! + x! * 0.3) * r,
});

/**
 * A small 2D Bloch sphere: glass circle, axes, the state vector with a gold tip. The vector
 * follows the board's animation (it turns with the gate, shrinks in the fog).
 */
function Bloch({
  v,
  label,
  ket,
  accent,
}: {
  v: BlochVector | readonly number[];
  label: string;
  ket: string;
  accent: string;
}) {
  const r = 46;
  const tip = project(v, r);
  const len = Math.hypot(...v);
  const fog = ket === KET.FOG;
  const axes: BlochVector[] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  return (
    <figure className="bloch">
      <svg viewBox="-62 -62 124 124" aria-label={`${label} ${ket}`}>
        <circle r={r} className="bloch__sphere" style={{ stroke: accent }} />
        <ellipse rx={r} ry={r * 0.3} className="bloch__equator" />
        {axes.map((a, i) => {
          const p = project(a, r);
          return <line key={i} x1={-p.px} y1={-p.py} x2={p.px} y2={p.py} className="bloch__axis" />;
        })}
        <text x={0} y={-r - 5} className="bloch__pole">
          |0⟩
        </text>
        <text x={0} y={r + 12} className="bloch__pole">
          |1⟩
        </text>
        {len < 0.5 && <circle r={6} className="bloch__fog" style={{ opacity: 1 - len * 2 }} />}
        {len > 0.04 && (
          <>
            <line x1={0} y1={0} x2={tip.px} y2={tip.py} className="bloch__vector" />
            <circle cx={tip.px} cy={tip.py} r={4.5} className="bloch__tip" />
          </>
        )}
      </svg>
      <figcaption>
        <span className="caption">{label}</span>
        <span className={`ket bloch__ket${fog ? ' is-fog' : ''}`}>{ket}</span>
      </figcaption>
    </figure>
  );
}

const pct = (p: number) => `${Math.round(p * 100)} %`;

/** ui-spec §7.4 Quantum state panel, every value from the engine on the public state. */
export function StatePanel({
  qubits,
  ball,
  partner,
  vectors,
}: {
  qubits: TwoQubitState;
  ball: BallPosition;
  partner: BallPosition;
  /** Animated Bloch vectors; the numbers below always show the server state. */
  vectors?: { bloch: readonly number[]; partner: readonly number[] };
}) {
  const d = describeState(qubits);
  const fog = ball === 'FOG';
  const t = en.state;
  return (
    <section className="game-state panel" aria-label={en.game.quantumState}>
      <h2 className="panel__title">{en.game.quantumState}</h2>
      <div className="game-state__spheres">
        <Bloch
          v={vectors?.bloch ?? d.bloch}
          label={en.game.football}
          ket={KET[ball]!}
          accent="#598CFF"
        />
        <Bloch
          v={vectors?.partner ?? d.partnerBloch}
          label={en.game.partner}
          ket={KET[partner]!}
          accent="#27E5F7"
        />
      </div>

      <div className="game-state__row">
        <span className="caption">{t.state}</span>
        <span className="ket game-state__psi" data-testid="state-psi">
          {d.single
            ? `|ψ⟩ = ${formatAmplitude(d.single.alpha)}|0⟩ + ${formatAmplitude(d.single.beta)}|1⟩`
            : `|ψ⟩ = ${d.pair}`}
        </span>
        {fog && <span className="caption">{t.pairNote}</span>}
      </div>

      <div className="game-state__row">
        <span className="caption">{t.probabilities}</span>
        {(
          [
            ['P(|0⟩)', d.p0],
            ['P(|1⟩)', d.p1],
          ] as const
        ).map(([name, p]) => (
          <div key={name} className="prob">
            <span className="ket">{name}</span>
            <span className="prob__bar">
              <span style={{ transform: `scaleX(${p})` }} />
            </span>
            <span className="ket prob__value">{pct(p)}</span>
          </div>
        ))}
      </div>

      <div className="game-state__row game-state__row--inline">
        <span className="caption">{t.bloch}</span>
        <span className="ket">{formatVector(d.bloch)}</span>
      </div>

      {d.globalPhase && (
        <div className="game-state__row game-state__row--inline">
          <span className="caption">{t.globalPhase}</span>
          <span className="ket">{d.globalPhase}</span>
          <span className="caption game-state__note">{t.phaseNote}</span>
        </div>
      )}

      <p
        className={`game-state__fog${fog ? ' is-fog' : ''}`}
        data-testid="state-fog-indicator"
        data-fog={fog}
      >
        {fog ? en.game.entangled : en.game.notEntangled}
      </p>
      <p className="game-state__hint">{fog ? t.hintFog : t.hint}</p>
    </section>
  );
}
