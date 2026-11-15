import {
  abs2,
  applyCnot,
  applySingleGate,
  ballPosition,
  END_ZONE,
  otherSide,
  partnerPosition,
  type BallPosition,
  type CardKind,
  type Position,
  type Side,
  type SingleGate,
  type TwoQubitState,
} from '@qa/engine';
import { en } from '../i18n/en';
import { CARD_LABEL, KET } from './format';

export type MovePreview = {
  /** Short line on the selected card, e.g. "H → |+⟩". */
  readonly line: string;
  /** Extra scoring note: "TOUCHDOWN +1" or a NO SCORE reason. */
  readonly note: string | null;
  /** Domes that may hold the ball afterwards (two for a 50/50 measure, none in the fog). */
  readonly targets: readonly Position[];
  /** The board edge the ball travels along, when it moves between two positions. */
  readonly edge: { readonly from: Position; readonly to: Position } | null;
  readonly touchdown: boolean;
};

const EPS = 1e-9;
const t = en.preview;

/**
 * What a card would do, computed with the engine on the public state (rules.md §6.1 step 2).
 * Only the client's own copy of the qubits is touched; the server decides the real result.
 */
export function previewMove(qubits: TwoQubitState, kind: CardKind, side: Side): MovePreview {
  const from = ballPosition(qubits);
  if (kind === 'MEASURE') return previewMeasure(qubits, from);

  const next = kind === 'CNOT' ? applyCnot(qubits) : applySingleGate(qubits, kind as SingleGate);
  const to = ballPosition(next);
  const base = { edge: null, touchdown: false, note: null };

  if (to === 'FOG') {
    return { ...base, line: from === 'FOG' ? t.staysInFog : t.entersFog, targets: [] };
  }
  const { note, touchdown } = scoring(from, to, side);
  const targets = [to];
  if (from === 'FOG') return { ...base, line: t.leavesFog(KET[to]!), targets, note, touchdown };
  if (to === from) {
    const partnerMoved = partnerPosition(next) !== partnerPosition(qubits);
    const line =
      kind !== 'CNOT'
        ? t.stays(KET[to]!)
        : partnerMoved
          ? t.partner(KET[partnerPosition(next)]!)
          : t.nothing;
    // A CNOT that changes nothing on the board needs no scoring note.
    return { ...base, line, targets, note: kind === 'CNOT' ? null : note, touchdown };
  }
  return {
    line: `${CARD_LABEL[kind]} → ${KET[to]}`,
    note,
    targets,
    edge: { from, to },
    touchdown,
  };
}

function previewMeasure(qubits: TwoQubitState, from: BallPosition): MovePreview {
  // Index = 2·partner + football (rules.md §4.1).
  const p0 = abs2(qubits[0]!) + abs2(qubits[2]!);
  const targets: Position[] = [];
  if (p0 > EPS) targets.push('ZERO');
  if (1 - p0 > EPS) targets.push('ONE');
  const base = { note: null, edge: null, touchdown: false, targets };
  if (from === 'FOG') return { ...base, line: t.measureFog };
  return { ...base, line: targets.length === 1 ? t.failedPunt : t.measure };
}

/** rules.md §7: a touchdown is a move INTO your own end zone, never from it or in the fog. */
function scoring(
  from: BallPosition,
  to: Position,
  side: Side,
): { note: string | null; touchdown: boolean } {
  const own = END_ZONE[side];
  const other = END_ZONE[otherSide(side)];
  if (to === own && from !== own) return { note: t.touchdown, touchdown: true };
  if (to === own) return { note: t.reEnter, touchdown: false };
  if (to === other && from !== other) {
    return { note: t.otherZone(otherSide(side)), touchdown: false };
  }
  return { note: null, touchdown: false };
}
