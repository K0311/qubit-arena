import { mulberry32 } from '../../src/rng';
import { applyAction, createGame, defaultConfig } from '../../src/game';
import { botAction } from '../../src/bot';
import { checkInvariants } from '../../src/invariants';
import type { GameState, Mode } from '../../src/types';

export const MAX_TURNS = 2000;

export type SimResult = { seed: number; mode: Mode; actions: number; final: GameState };

/**
 * One bot-vs-bot game. Throws with the seed on any invariant failure or stuck game,
 * so a failure can be replayed exactly (test-plan.md §3.6).
 */
export function simulateGame(seed: number, mode: Mode): SimResult {
  const rng = mulberry32(seed);
  let state = createGame(defaultConfig(mode), rng).state;
  const fail = (msg: string, at: number): never => {
    throw new Error(`[sim] ${mode} seed=${seed} action=${at}: ${msg}`);
  };
  const initial = checkInvariants(state);
  if (initial.length) fail(initial.join('; '), 0);
  // Some games hit the time limit at a random point so the TIME path is exercised too.
  const timeUpAt = rng.next() < 0.2 ? Math.floor(rng.next() * 60) : -1;

  let actions = 0;
  while (state.phase !== 'FINISHED') {
    if (actions >= MAX_TURNS) fail('game did not finish', actions);
    const action =
      actions === timeUpAt
        ? ({ type: 'TIME_UP' } as const)
        : state.phase === 'PLAYING' && rng.next() < 0.05
          ? ({ type: 'TIMEOUT', player: state.turn } as const)
          : botAction(state, rng);
    const res = applyAction(state, action, rng);
    if (res.error)
      fail(`bot action rejected: ${res.error.code} (${JSON.stringify(action)})`, actions);
    const problems = checkInvariants(res.state, state);
    if (problems.length) fail(problems.join('; '), actions);
    state = res.state;
    actions++;
  }
  return { seed, mode, actions, final: state };
}
