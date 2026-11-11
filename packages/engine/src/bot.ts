import { questionById } from './challenge';
import type { Rng } from './rng';
import { sideOf } from './seats';
import type { Action, GameState, PlayerId } from './types';

const pick = <T>(xs: readonly T[], rng: Rng): T | undefined =>
  xs[Math.floor(rng.next() * xs.length)];

/**
 * Bot v1 (rules.md §10) for one seat: a random legal card on its turn, a random answer in
 * the Quantum Challenge. Takes the seat so a bot can never act for a human on another side.
 * Used for disconnected seats and for simulation.
 * Returns null when this seat has nothing to do right now.
 */
export function botAction(state: GameState, player: PlayerId, rng: Rng): Action | null {
  if (state.phase === 'PLAYING') {
    if (state.turn !== player) return null;
    const card = pick(state.hands[player] ?? [], rng);
    return card ? { type: 'PLAY_CARD', player, cardId: card.id } : null;
  }
  const ch = state.challenge;
  const id = ch?.questionIds[ch.index];
  if (state.phase !== 'CHALLENGE' || !ch || id === undefined) return null;
  if (ch.answers[sideOf(state.config.mode, player)] !== undefined) return null;
  return {
    type: 'CHALLENGE_ANSWER',
    player,
    questionId: id,
    choice: Math.floor(rng.next() * questionById(id).choices.length),
  };
}
