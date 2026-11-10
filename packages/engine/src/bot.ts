import { questionById } from './challenge';
import type { Rng } from './rng';
import { FIRST_PLAYER } from './seats';
import type { Action, GameState, Side } from './types';

const pick = <T>(xs: readonly T[], rng: Rng): T | undefined =>
  xs[Math.floor(rng.next() * xs.length)];

/**
 * Bot v1 (rules.md §10): a random legal card on its turn, a random answer in the
 * Quantum Challenge. Used for disconnected seats and for simulation.
 */
export function botAction(state: GameState, rng: Rng): Action {
  if (state.phase === 'PLAYING') {
    const card = pick(state.hands[state.turn] ?? [], rng);
    if (!card) throw new Error(`${state.turn} has no card to play`);
    return { type: 'PLAY_CARD', player: state.turn, cardId: card.id };
  }
  const ch = state.challenge;
  const id = ch?.questionIds[ch.index];
  if (state.phase === 'CHALLENGE' && ch && id !== undefined) {
    const side: Side = ch.answers.BLUE === undefined ? 'BLUE' : 'RED';
    const choices = questionById(id).choices.length;
    return {
      type: 'CHALLENGE_ANSWER',
      player: FIRST_PLAYER[state.config.mode][side],
      questionId: id,
      choice: Math.floor(rng.next() * choices),
    };
  }
  throw new Error(`no bot action in phase ${state.phase}`);
}
