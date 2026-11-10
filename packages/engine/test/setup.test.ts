import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/rng';
import { buildDeck, DEFAULT_DECK_COUNTS, deckSize } from '../src/deck';
import { applyAction, createGame, defaultConfig, sideOf, TURN_ORDER } from '../src/game';
import { ballPosition, partnerPosition } from '../src/quantum';
import type { CardKind, GameEvent, PlayerId } from '../src/types';
import { cards, die, scenario, scripted } from './helpers';

const countKinds = (kinds: readonly CardKind[]) =>
  kinds.reduce<Record<string, number>>((acc, k) => ({ ...acc, [k]: (acc[k] ?? 0) + 1 }), {});

describe('deck and setup (rules.md §3.5, §5)', () => {
  it('T-R-01: new Solo game: 55-card deck, 4 cards each, order P1 → P2', () => {
    const { state } = createGame(defaultConfig('SOLO'), mulberry32(5));
    expect(deckSize(state.config.deckCounts)).toBe(55);
    expect(state.hands.P1).toHaveLength(4);
    expect(state.hands.P2).toHaveLength(4);
    expect(state.hands.P3).toBeUndefined();
    expect(state.deck.length + 8).toBe(55);
    expect(TURN_ORDER.SOLO).toEqual(['P1', 'P2']);
    expect(state.phase).toBe('PLAYING');
    // Turns alternate after the first play.
    const first = state.turn;
    const hand = state.hands[first] ?? [];
    const { state: next } = applyAction(
      state,
      { type: 'PLAY_CARD', player: first, cardId: (hand[0] as { id: number }).id },
      mulberry32(1),
    );
    expect(next.turn).toBe(first === 'P1' ? 'P2' : 'P1');
  });

  it('T-R-02: new Team game: order P1 → P3 → P2 → P4, P1/P2 Blue, P3/P4 Red', () => {
    const { state } = createGame(defaultConfig('TEAM'), mulberry32(5));
    expect(TURN_ORDER.TEAM).toEqual(['P1', 'P3', 'P2', 'P4']);
    for (const p of ['P1', 'P2', 'P3', 'P4'] as const) expect(state.hands[p]).toHaveLength(4);
    expect(state.deck.length + 16).toBe(55);
    expect(sideOf('TEAM', 'P1')).toBe('BLUE');
    expect(sideOf('TEAM', 'P2')).toBe('BLUE');
    expect(sideOf('TEAM', 'P3')).toBe('RED');
    expect(sideOf('TEAM', 'P4')).toBe('RED');
    expect(sideOf('SOLO', 'P1')).toBe('BLUE');
    expect(sideOf('SOLO', 'P2')).toBe('RED');
  });

  describe('T-R-03: opening roll', () => {
    const rollEvents = (events: readonly GameEvent[]) =>
      events.filter(
        (e): e is Extract<GameEvent, { type: 'OPENING_ROLL' }> => e.type === 'OPENING_ROLL',
      );

    it.each([
      ['SOLO', [die(6), die(2)], 'P1'],
      ['SOLO', [die(1), die(4)], 'P2'],
      ['TEAM', [die(5), die(3)], 'P1'],
      ['TEAM', [die(2), die(3)], 'P3'],
    ] as const)('%s: rolls %j → %s starts', (mode, rolls, starter) => {
      const { state, events } = createGame(defaultConfig(mode), scripted(rolls));
      expect(state.turn).toBe(starter);
      expect(rollEvents(events)).toHaveLength(1);
    });

    it('a tie rolls again', () => {
      const { state, events } = createGame(
        defaultConfig('TEAM'),
        scripted([die(4), die(4), die(3), die(3), die(1), die(6)]),
      );
      const rolls = rollEvents(events);
      expect(rolls.map((e) => [e.blue, e.red])).toEqual([
        [4, 4],
        [3, 3],
        [1, 6],
      ]);
      expect(state.turn).toBe('P3');
    });

    it('with a fixed seed the higher roll always starts', () => {
      for (let seed = 0; seed < 200; seed++) {
        const { state, events } = createGame(defaultConfig('SOLO'), mulberry32(seed));
        const last = rollEvents(events).at(-1);
        expect(last).toBeDefined();
        expect(last?.blue).not.toBe(last?.red);
        expect(state.turn).toBe((last?.blue ?? 0) > (last?.red ?? 0) ? 'P1' : 'P2');
      }
    });
  });

  it('kickoff at the start: ball at ZERO or ONE, partner |+⟩', () => {
    for (let seed = 0; seed < 50; seed++) {
      const { state } = createGame(defaultConfig('SOLO'), mulberry32(seed));
      expect(['ZERO', 'ONE']).toContain(ballPosition(state.qubits));
      expect(partnerPosition(state.qubits)).toBe('PLUS');
    }
  });

  it.each([
    ['SOLO', 'P1', 'P2'],
    ['TEAM', 'P1', 'P3'],
    ['TEAM', 'P3', 'P2'],
  ] as const)(
    'T-R-04: %s, %s scores → kickoff, partner |+⟩, the other side (%s) plays first',
    (mode, scorer, nextPlayer) => {
      // Blue scores at PLUS (H on ZERO); Red scores at MINUS (H on ONE).
      const blue = scorer === 'P1';
      const hand = cards('H', 'I', 'I', 'I');
      const s = scenario(mode, {
        turn: scorer,
        ball: blue ? 'ZERO' : 'ONE',
        hands: { [scorer]: hand },
      });
      const { state, events } = applyAction(
        s,
        { type: 'PLAY_CARD', player: scorer, cardId: (hand[0] as { id: number }).id },
        mulberry32(9),
      );
      expect(state.score[blue ? 'BLUE' : 'RED']).toBe(1);
      expect(events.map((e) => e.type)).toContain('TOUCHDOWN');
      const kickoff = events.find((e) => e.type === 'KICKOFF');
      expect(kickoff).toMatchObject({ side: blue ? 'BLUE' : 'RED' });
      expect(['ZERO', 'ONE']).toContain(ballPosition(state.qubits));
      expect(partnerPosition(state.qubits)).toBe('PLUS');
      expect(state.turn).toBe(nextPlayer as PlayerId);
    },
  );

  it('T-R-04b: Solo and Team both default to target 7, 15 minutes and sudden death on', () => {
    for (const mode of ['SOLO', 'TEAM'] as const) {
      const c = defaultConfig(mode);
      expect(c.targetScore).toBe(7);
      expect(c.timeLimitMs).toBe(15 * 60 * 1000);
      expect(c.turnTimerMs).toBe(60 * 1000);
      expect(c.handSize).toBe(4);
      expect(c.suddenDeath).toBe(true);
    }
  });

  it('T-R-24: custom deck counts set deck size and composition', () => {
    const counts = { ...DEFAULT_DECK_COUNTS, H: 2, X: 0, MEASURE: 10, CNOT: 1 };
    const deck = buildDeck(counts);
    expect(deck).toHaveLength(deckSize(counts));
    expect(countKinds(deck.map((c) => c.kind))).toMatchObject({ H: 2, MEASURE: 10, CNOT: 1 });
    expect(deck.some((c) => c.kind === 'X')).toBe(false);
    expect(new Set(deck.map((c) => c.id)).size).toBe(deck.length);

    const { state } = createGame({ ...defaultConfig('SOLO'), deckCounts: counts }, mulberry32(3));
    const all = [...state.deck, ...(state.hands.P1 ?? []), ...(state.hands.P2 ?? [])];
    expect(countKinds(all.map((c) => c.kind))).toEqual(countKinds(deck.map((c) => c.kind)));
  });

  it('default deck matches rules.md §3.5', () => {
    expect(DEFAULT_DECK_COUNTS).toEqual({
      H: 7,
      X: 4,
      Y: 9,
      Z: 7,
      S: 7,
      SX: 12,
      I: 3,
      MEASURE: 3,
      CNOT: 3,
    });
  });
});
