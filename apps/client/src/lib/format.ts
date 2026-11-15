import { CARD_KINDS, type CardKind, type DeckCounts } from '@qa/engine';

/** Ket labels with the real minus sign U+2212 (ui-spec §1). */
export const KET: Readonly<Record<string, string>> = {
  ZERO: '|0⟩',
  ONE: '|1⟩',
  PLUS: '|+⟩',
  MINUS: '|−⟩',
  PLUS_I: '|i⟩',
  MINUS_I: '|−i⟩',
  FOG: 'fog',
};

export const CARD_LABEL: Readonly<Record<CardKind, string>> = {
  H: 'H',
  X: 'X',
  Y: 'Y',
  Z: 'Z',
  S: 'S',
  SX: '√X',
  I: 'I',
  MEASURE: 'M',
  CNOT: 'CNOT',
};

/** 900000 → "15:00". */
export function minutesSeconds(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export const seconds = (ms: number): string => `${Math.round(ms / 1000)} s`;

/** "55 cards (H7 X4 Y9 Z7 S7 √X12 I3 M3 CNOT3)" as in ui-spec §6. */
export function deckSummary(counts: DeckCounts | Readonly<Record<string, number>>): string {
  const parts = CARD_KINDS.map((k) => `${CARD_LABEL[k]}${counts[k] ?? 0}`);
  const total = CARD_KINDS.reduce((sum, k) => sum + (counts[k] ?? 0), 0);
  return `${total} cards (${parts.join(' ')})`;
}
