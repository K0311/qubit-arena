import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/rng';
import { applyAction, createGame, defaultConfig } from '../src/game';
import { questionById } from '../src/challenge';
import { viewFor } from '../src/view';
import { cards, scenario } from './helpers';

describe('filtered view (rules.md §9)', () => {
  const solo = createGame(defaultConfig('SOLO'), mulberry32(11)).state;
  const team = createGame(defaultConfig('TEAM'), mulberry32(11)).state;

  it('Solo: own hand visible, opponent card count only, no deck', () => {
    const v = viewFor(solo, 'P1');
    expect(v.hands.P1).toEqual(solo.hands.P1);
    expect(v.hands.P2).toBeUndefined();
    expect(v.handCounts).toEqual({ P1: 4, P2: 4 });
    expect(v.deckCount).toBe(solo.deck.length);
    expect(Object.keys(v)).not.toContain('deck');
    // No id of an opponent's or a deck card appears anywhere in the view.
    const json = JSON.stringify(v);
    for (const c of [...(solo.hands.P2 ?? []), ...solo.deck]) {
      expect(json).not.toContain(`"id":${c.id},`);
    }
  });

  it("Team: own and teammate's hands visible, opponents' counts only", () => {
    const v = viewFor(team, 'P1');
    expect(v.hands.P1).toEqual(team.hands.P1);
    expect(v.hands.P2).toEqual(team.hands.P2);
    expect(v.hands.P3).toBeUndefined();
    expect(v.hands.P4).toBeUndefined();
    expect(v.handCounts).toEqual({ P1: 4, P2: 4, P3: 4, P4: 4 });
    const red = viewFor(team, 'P4');
    expect(red.hands.P3).toEqual(team.hands.P3);
    expect(red.hands.P1).toBeUndefined();
  });

  it('Spectator: public state only, no hands', () => {
    const v = viewFor(team, 'SPECTATOR');
    expect(v.hands).toEqual({});
    expect(v.score).toEqual(team.score);
    expect(v.ball).toBeDefined();
    expect(v.partner).toBeDefined();
    expect(v.qubits).toEqual(team.qubits);
  });

  it('shows the football and partner positions', () => {
    const v = viewFor(scenario('SOLO', { ball: 'PLUS_I' }), 'P2');
    expect(v.ball).toBe('PLUS_I');
    expect(v.partner).toBe('PLUS');
  });

  it('Challenge: only the current question, without its answer', () => {
    const hand = cards('I', 'I', 'I', 'I');
    let s = scenario('SOLO', { turn: 'P1', ball: 'ZERO', hands: { P1: hand } });
    s = applyAction(s, { type: 'TIME_UP' }, mulberry32(1)).state;
    s = applyAction(
      s,
      { type: 'PLAY_CARD', player: 'P1', cardId: (hand[0] as { id: number }).id },
      mulberry32(1),
    ).state;
    const v = viewFor(s, 'P1');
    const ids = s.challenge?.questionIds ?? [];
    const q = questionById(ids[0] as string);
    expect(v.challenge?.question).toEqual({ id: q.id, prompt: q.prompt, choices: q.choices });
    expect(JSON.stringify(v)).not.toContain('"answer"');
    for (const upcoming of ids.slice(1)) expect(JSON.stringify(v)).not.toContain(`"${upcoming}"`);
    expect(v.challenge?.answered).toEqual({ BLUE: false, RED: false });
  });
});
