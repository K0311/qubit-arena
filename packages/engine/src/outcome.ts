import type { EndReason, GameEvent, GameState, Winner } from './types';

export type Step = { readonly state: GameState; readonly events: readonly GameEvent[] };

/** Move to FINISHED and announce it. */
export function finishGame(state: GameState, reason: EndReason, winner: Winner): Step {
  const event: GameEvent = { type: 'GAME_OVER', reason, winner };
  return {
    state: { ...state, phase: 'FINISHED', endReason: reason, winner },
    events: [event],
  };
}
