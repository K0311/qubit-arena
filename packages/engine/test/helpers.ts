import { mulberry32, type Rng } from '../src/rng';
import { createGame, defaultConfig } from '../src/game';
import { productState } from '../src/quantum';
import type { Position } from '../src/states';
import type { Card, CardKind, GameConfig, GameState, Mode, PlayerId, Side } from '../src/types';

let nextId = 1000;
export const card = (kind: CardKind): Card => ({ id: nextId++, kind });
export const cards = (...kinds: CardKind[]): Card[] => kinds.map(card);

/** Rng that returns the given values first, then falls back to a seeded mulberry32. */
export function scripted(values: readonly number[], seed = 1): Rng {
  const rest = mulberry32(seed);
  let i = 0;
  return { next: () => (i < values.length ? (values[i++] as number) : rest.next()) };
}

/** d6 face → rng value that produces it (floor(x * 6) + 1). */
export const die = (face: number) => (face - 1) / 6 + 0.01;

export type ScenarioOptions = {
  config?: Partial<GameConfig>;
  seed?: number;
  turn?: PlayerId;
  ball?: Position;
  hands?: Partial<Record<PlayerId, readonly Card[]>>;
  deck?: readonly Card[];
  score?: Record<Side, number>;
};

/** A started game with selected fields overridden, for scripted rule tests. */
export function scenario(mode: Mode, o: ScenarioOptions = {}): GameState {
  const { state } = createGame({ ...defaultConfig(mode), ...o.config }, mulberry32(o.seed ?? 1));
  return {
    ...state,
    turn: o.turn ?? state.turn,
    qubits: o.ball ? productState('PLUS', o.ball) : state.qubits,
    hands: o.hands ? { ...state.hands, ...o.hands } : state.hands,
    deck: o.deck ?? state.deck,
    score: o.score ?? state.score,
  };
}

export function deepFreeze<T>(x: T): T {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const v of Object.values(x)) deepFreeze(v);
  }
  return x;
}
