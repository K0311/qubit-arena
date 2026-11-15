import type { CardKind, SingleGate } from '@qa/engine';
import type { HTMLAttributes } from 'react';
import { en } from '../../i18n/en';
import { CARD_LABEL } from '../../lib/format';
import { boardEffect } from '../../lib/gate-effects';
import { gateColors } from '../../theme/tokens';
import './cards.css';

/** Rotation axis per card for the small Bloch sphere (ui-spec §8.1 item 4). */
const AXIS: Partial<Record<CardKind, readonly [number, number, number]>> = {
  X: [1, 0, 0],
  SX: [1, 0, 0],
  Y: [0, 1, 0],
  Z: [0, 0, 1],
  S: [0, 0, 1],
  H: [Math.SQRT1_2, 0, Math.SQRT1_2],
};

/** Oblique projection: z up, y to the right, x toward the viewer (down-left). */
const project = ([x, y, z]: readonly [number, number, number], r: number) => ({
  px: (y - x * 0.45) * r,
  py: (-z + x * 0.3) * r,
});

function MiniBloch({ kind }: { kind: CardKind }) {
  const r = 26;
  const axis = AXIS[kind];
  const colour = gateColors[kind];
  const ends = axis
    ? [project(axis, r * 1.25), project([-axis[0], -axis[1], -axis[2]], r * 1.25)]
    : [];
  return (
    <svg className="gate-card__bloch" viewBox="-36 -36 72 72" aria-hidden="true">
      <circle r={r} className="gate-card__sphere" />
      <ellipse rx={r} ry={r * 0.3} className="gate-card__equator" />
      {(
        [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ] as const
      ).map((v, i) => {
        const p = project(v, r);
        return (
          <line key={i} x1={-p.px} y1={-p.py} x2={p.px} y2={p.py} className="gate-card__axis" />
        );
      })}
      {ends.length === 2 && (
        <line
          x1={ends[0]!.px}
          y1={ends[0]!.py}
          x2={ends[1]!.px}
          y2={ends[1]!.py}
          stroke={colour}
          strokeWidth={2.5}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 3px ${colour})` }}
        />
      )}
      {kind === 'MEASURE' && (
        <path
          d="M-14,8 A16,16 0 0 1 14,8 M0,8 L9,-6"
          stroke={colour}
          strokeWidth={2.5}
          fill="none"
        />
      )}
      {kind === 'CNOT' && (
        <g stroke={colour} strokeWidth={2} fill="none">
          <line x1={0} y1={-14} x2={0} y2={14} />
          <circle cy={-14} r={3.5} fill={colour} />
          <circle cy={14} r={7} />
          <line x1={-7} y1={14} x2={7} y2={14} />
        </g>
      )}
    </svg>
  );
}

function effectText(kind: CardKind): string {
  if (kind === 'MEASURE' || kind === 'CNOT') return en.cards[kind].effect;
  return boardEffect(kind as SingleGate);
}

type GateCardProps = {
  kind: CardKind;
  size?: 'hand' | 'detail';
  selected?: boolean;
  /** Preview line shown on a selected hand card, e.g. "H → |+⟩". */
  previewLine?: string | null;
  previewNote?: string | null;
  disabled?: boolean;
  onSelect?: () => void;
} & Omit<HTMLAttributes<HTMLElement>, 'onSelect'>;

/**
 * Gate card (ui-spec §8.1). Hand size shows the corner tag, big letter, name and the preview
 * line; the full card (detail size) appears on hover and in the card library.
 */
export function GateCard({
  kind,
  size = 'hand',
  selected = false,
  previewLine,
  previewNote,
  disabled,
  onSelect,
  className,
  ...rest
}: GateCardProps) {
  const text = en.cards[kind];
  const style = { '--gate': gateColors[kind] } as React.CSSProperties;
  if (size === 'detail') {
    return (
      <article className={`gate-card gate-card--detail ${className ?? ''}`} style={style} {...rest}>
        <span className="gate-card__tag">{CARD_LABEL[kind]}</span>
        <span className="gate-card__letter">{CARD_LABEL[kind]}</span>
        <span className="gate-card__name">{text.name}</span>
        <MiniBloch kind={kind} />
        <p className="gate-card__text">{text.text}</p>
        <div className="gate-card__effect">
          <span className="caption">{en.cards.effect}</span>
          <p className="ket">{effectText(kind)}</p>
        </div>
        <span className="gate-card__footer">{text.footer}</span>
      </article>
    );
  }
  return (
    <div className="gate-card-slot">
      <button
        type="button"
        className={`gate-card gate-card--hand${selected ? ' is-selected' : ''} ${className ?? ''}`}
        style={style}
        aria-pressed={selected}
        aria-label={`${text.name} (${CARD_LABEL[kind]})`}
        disabled={disabled}
        onClick={onSelect}
        {...rest}
      >
        <span className="gate-card__tag">{CARD_LABEL[kind]}</span>
        <span className="gate-card__letter">{CARD_LABEL[kind]}</span>
        <span className="gate-card__name">{text.name}</span>
        {selected && previewLine ? (
          <span className="gate-card__preview ket" data-testid="card-preview">
            {previewLine}
            {previewNote && <em>{previewNote}</em>}
          </span>
        ) : (
          <span className="gate-card__footer">{text.footer}</span>
        )}
      </button>
      <div className="gate-card__hover" aria-hidden="true">
        <GateCard kind={kind} size="detail" />
      </div>
    </div>
  );
}

/** Card back for the deck and hidden hands (ui-spec §8.2). */
export function CardBack({ className }: { className?: string }) {
  return (
    <div className={`card-back ${className ?? ''}`} aria-hidden="true">
      <span>{en.cards.back}</span>
    </div>
  );
}

/** Small coloured gate tag, e.g. for the teammate's hand and the gate reference. */
export function GateTag({ kind }: { kind: CardKind }) {
  return (
    <span className="gate-tag" style={{ '--gate': gateColors[kind] } as React.CSSProperties}>
      {CARD_LABEL[kind]}
    </span>
  );
}

export { effectText };
