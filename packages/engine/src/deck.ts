import type { Rng } from './rng';
import type { Card, CardKind, DeckCounts, Hands, PlayerId } from './types';

export const CARD_KINDS: readonly CardKind[] = [
  'H',
  'X',
  'Y',
  'Z',
  'S',
  'SX',
  'I',
  'MEASURE',
  'CNOT',
];

/** rules.md §3.5: 55 cards. */
export const DEFAULT_DECK_COUNTS: DeckCounts = {
  H: 7,
  X: 4,
  Y: 9,
  Z: 7,
  S: 7,
  SX: 12,
  I: 3,
  MEASURE: 3,
  CNOT: 3,
};

export const deckSize = (counts: DeckCounts): number =>
  CARD_KINDS.reduce((sum, k) => sum + counts[k], 0);

/** Unshuffled deck with ids 1..n, grouped by kind. */
export function buildDeck(counts: DeckCounts): Card[] {
  let id = 1;
  return CARD_KINDS.flatMap((kind) =>
    Array.from({ length: counts[kind] }, () => ({ id: id++, kind })),
  );
}

/** Fisher–Yates with the injected Rng; returns a new array. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** Deal one card at a time around the table until each player has `handSize`. */
export function deal(
  deck: readonly Card[],
  players: readonly PlayerId[],
  handSize: number,
): { hands: Hands; deck: readonly Card[] } {
  const hands: Partial<Record<PlayerId, Card[]>> = Object.fromEntries(players.map((p) => [p, []]));
  let next = 0;
  for (let round = 0; round < handSize; round++) {
    for (const p of players) {
      const c = deck[next];
      if (c === undefined) break;
      hands[p]?.push(c);
      next++;
    }
  }
  return { hands, deck: deck.slice(next) };
}
