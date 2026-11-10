import type { Position } from './states';
import type { Mode, PlayerId, Side } from './types';

/** rules.md §6: Solo P1 → P2; Team P1 → P3 → P2 → P4 (sides alternate every turn). */
export const TURN_ORDER: Readonly<Record<Mode, readonly PlayerId[]>> = {
  SOLO: ['P1', 'P2'],
  TEAM: ['P1', 'P3', 'P2', 'P4'],
};

/** rules.md §2.2. */
export const END_ZONE: Readonly<Record<Side, Position>> = { BLUE: 'PLUS', RED: 'MINUS' };

/** First player of each side, who starts after winning the opening roll (rules.md §5). */
export const FIRST_PLAYER: Readonly<Record<Mode, Readonly<Record<Side, PlayerId>>>> = {
  SOLO: { BLUE: 'P1', RED: 'P2' },
  TEAM: { BLUE: 'P1', RED: 'P3' },
};

/** rules.md §1: Solo P1 Blue, P2 Red; Team P1+P2 Blue, P3+P4 Red. */
export function sideOf(mode: Mode, player: PlayerId): Side {
  if (mode === 'SOLO') return player === 'P1' ? 'BLUE' : 'RED';
  return player === 'P1' || player === 'P2' ? 'BLUE' : 'RED';
}

export const otherSide = (side: Side): Side => (side === 'BLUE' ? 'RED' : 'BLUE');
