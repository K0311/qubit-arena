import { answerChallenge, startChallenge } from './challenge';
import { buildDeck, deal, DEFAULT_DECK_COUNTS, shuffle } from './deck';
import { SINGLE_GATES, type SingleGate } from './gates';
import { finishGame, type Step } from './outcome';
import {
  applyCnot,
  applySingleGate,
  ballPosition,
  kickoffState,
  measureFootball,
  type KickoffPosition,
} from './quantum';
import type { Rng } from './rng';
import { END_ZONE, FIRST_PLAYER, sideOf, TURN_ORDER } from './seats';
import type {
  Action,
  ActionError,
  ApplyResult,
  Card,
  GameConfig,
  GameEvent,
  GameState,
  Mode,
  PlayerId,
  Side,
} from './types';

export { END_ZONE, FIRST_PLAYER, otherSide, sideOf, TURN_ORDER } from './seats';

/** rules.md §5 Defaults (same for Solo and Team since 10 Nov 2026). */
export function defaultConfig(mode: Mode): GameConfig {
  return {
    mode,
    targetScore: 7,
    timeLimitMs: 15 * 60 * 1000,
    turnTimerMs: 60 * 1000,
    handSize: 4,
    deckCounts: DEFAULT_DECK_COUNTS,
    // Not fixed by rules.md §8.1; on by default so a tie is still decided, configurable per room.
    suddenDeath: true,
    challengeQuestions: 5,
  };
}

const rollDie = (rng: Rng): number => Math.floor(rng.next() * 6) + 1;

function kickoff(rng: Rng, side?: Side): { qubits: GameState['qubits']; event: GameEvent } {
  // Binary die (rules.md §5 step 6).
  const ball: KickoffPosition = rng.next() < 0.5 ? 'ZERO' : 'ONE';
  return {
    qubits: kickoffState(ball),
    event: side ? { type: 'KICKOFF', side, ball } : { type: 'KICKOFF', ball },
  };
}

/** Opening roll, shuffle, deal, kickoff (rules.md §5). */
export function createGame(config: GameConfig, rng: Rng): Step {
  const events: GameEvent[] = [];
  let starter: Side | undefined;
  while (!starter) {
    const blue = rollDie(rng);
    const red = rollDie(rng);
    events.push({ type: 'OPENING_ROLL', blue, red });
    if (blue !== red) starter = blue > red ? 'BLUE' : 'RED';
  }
  const seats = [...TURN_ORDER[config.mode]].sort();
  const { hands, deck } = deal(shuffle(buildDeck(config.deckCounts), rng), seats, config.handSize);
  const ko = kickoff(rng);
  events.push(ko.event);
  const state: GameState = {
    config,
    phase: 'PLAYING',
    qubits: ko.qubits,
    hands,
    deck,
    discard: [],
    turn: FIRST_PLAYER[config.mode][starter],
    score: { BLUE: 0, RED: 0 },
    timeUp: false,
    log: events,
    version: 0,
  };
  return { state, events };
}

const reject = (state: GameState, code: ActionError['code'], message: string): ApplyResult => ({
  state,
  events: [],
  error: { code, message },
});

const commit = (step: Step, previous: GameState): ApplyResult => ({
  state: { ...step.state, log: [...previous.log, ...step.events], version: previous.version + 1 },
  events: step.events,
});

/** The only way game state changes. Pure: returns a new state, never mutates the input. */
export function applyAction(state: GameState, action: Action, rng: Rng): ApplyResult {
  switch (action.type) {
    case 'PLAY_CARD': {
      const problem = checkTurn(state, action.player);
      if (problem) return reject(state, ...problem);
      const card = (state.hands[action.player] ?? []).find((c) => c.id === action.cardId);
      if (!card)
        return reject(state, 'CARD_NOT_IN_HAND', `card ${action.cardId} is not in the hand`);
      return commit(playCard(state, action.player, card, false, rng), state);
    }
    case 'TIMEOUT': {
      const problem = checkTurn(state, action.player);
      if (problem) return reject(state, ...problem);
      const hand = state.hands[action.player] ?? [];
      // rules.md §6.2: a random single-qubit card, else any card.
      const singles = hand.filter((c) => (SINGLE_GATES as readonly string[]).includes(c.kind));
      const pool = singles.length > 0 ? singles : hand;
      const card = pool[Math.floor(rng.next() * pool.length)];
      if (!card) return reject(state, 'EMPTY_HAND', `${action.player} has no cards`);
      return commit(playCard(state, action.player, card, true, rng), state);
    }
    case 'TIME_UP':
      // The server clock may fire in any phase; only a running game cares.
      if (state.phase !== 'PLAYING' || state.timeUp) return { state, events: [] };
      return commit({ state: { ...state, timeUp: true }, events: [{ type: 'TIME_UP' }] }, state);
    case 'CHALLENGE_ANSWER': {
      const res = answerChallenge(state, action, rng);
      return 'code' in res ? reject(state, res.code, res.message) : commit(res, state);
    }
    default:
      return reject(
        state,
        'UNKNOWN_ACTION',
        `unknown action ${(action as { type?: unknown }).type}`,
      );
  }
}

function checkTurn(state: GameState, player: PlayerId): [ActionError['code'], string] | undefined {
  if (state.phase !== 'PLAYING') return ['WRONG_PHASE', `cannot play in phase ${state.phase}`];
  if (player !== state.turn) return ['NOT_YOUR_TURN', `it is ${state.turn}'s turn`];
  return undefined;
}

function applyCard(qubits: GameState['qubits'], card: Card, rng: Rng) {
  if (card.kind === 'MEASURE') {
    const { state, outcome } = measureFootball(qubits, rng);
    return { qubits: state, events: [{ type: 'MEASURED', outcome } as GameEvent] };
  }
  if (card.kind === 'CNOT') return { qubits: applyCnot(qubits), events: [] };
  return { qubits: applySingleGate(qubits, card.kind as SingleGate), events: [] };
}

/** One full turn: apply, discard, draw, touchdown check, end check, next player (rules.md §6.1). */
function playCard(
  state: GameState,
  player: PlayerId,
  card: Card,
  byTimeout: boolean,
  rng: Rng,
): Step {
  const { config } = state;
  const from = ballPosition(state.qubits);
  const applied = applyCard(state.qubits, card, rng);
  const to = ballPosition(applied.qubits);

  const kept = (state.hands[player] ?? []).filter((c) => c.id !== card.id);
  const drawCount = Math.max(0, Math.min(config.handSize - kept.length, state.deck.length));
  const hands = { ...state.hands, [player]: [...kept, ...state.deck.slice(0, drawCount)] };
  const deck = state.deck.slice(drawCount);

  const events: GameEvent[] = [
    { type: 'CARD_PLAYED', player, card, from, to, byTimeout },
    ...applied.events,
  ];

  // rules.md §7: only the mover's side, only INTO its own zone, never from/in the fog.
  const side = sideOf(config.mode, player);
  const zone = END_ZONE[side];
  const scored = to !== 'FOG' && to === zone && from !== zone;
  const score = scored ? { ...state.score, [side]: state.score[side] + 1 } : state.score;
  if (scored) events.push({ type: 'TOUCHDOWN', side, player });

  let next: GameState = {
    ...state,
    qubits: applied.qubits,
    hands,
    deck,
    discard: [...state.discard, card],
    score,
  };

  const end = endCheck(next, scored ? side : undefined, rng);
  if (end) return { state: end.state, events: [...events, ...end.events] };

  if (scored) {
    // The scoring side kicks off; the other side plays first, which the turn order already gives.
    const ko = kickoff(rng, side);
    next = { ...next, qubits: ko.qubits };
    events.push(ko.event);
  }
  return { state: { ...next, turn: nextPlayer(next, player) }, events };
}

/** rules.md §8: target, then time, then no cards. A tie goes to the Quantum Challenge. */
function endCheck(state: GameState, scorer: Side | undefined, rng: Rng): Step | undefined {
  if (scorer && state.score[scorer] >= state.config.targetScore) {
    return finishGame(state, 'TARGET', scorer);
  }
  const noCards =
    state.deck.length === 0 && Object.values(state.hands).every((h) => (h ?? []).length === 0);
  const reason = state.timeUp ? 'TIME' : noCards ? 'NO_CARDS' : undefined;
  if (!reason) return undefined;
  const { BLUE, RED } = state.score;
  if (BLUE !== RED) return finishGame(state, reason, BLUE > RED ? 'BLUE' : 'RED');
  return startChallenge(state, rng);
}

/**
 * Next player in turn order who still holds a card. Once the deck is empty a player with an
 * empty hand cannot play, so they are skipped (rules.md §6 has no pass; T-R-06).
 */
function nextPlayer(state: GameState, current: PlayerId): PlayerId {
  const order = TURN_ORDER[state.config.mode];
  const start = order.indexOf(current);
  for (let step = 1; step <= order.length; step++) {
    const p = order[(start + step) % order.length] as PlayerId;
    if ((state.hands[p] ?? []).length > 0) return p;
  }
  return current;
}
