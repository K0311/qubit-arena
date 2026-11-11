import { describe, expect, it } from 'vitest';
import {
  MAX_CLIENT_MESSAGE_LENGTH,
  encodeMessage,
  parseClientMessage,
  type ClientMessage,
} from '../src/index';

const VALID: readonly ClientMessage[] = [
  { type: 'CREATE_ROOM', mode: 'SOLO', visibility: 'PUBLIC', name: 'Room A', playerName: 'Ann' },
  {
    type: 'CREATE_ROOM',
    mode: 'TEAM',
    visibility: 'PRIVATE',
    name: 'Lab',
    playerName: 'Bo',
    settings: { targetScore: 5, timeLimitMs: 600_000, turnTimerMs: 30_000, suddenDeath: false },
  },
  { type: 'JOIN_ROOM', code: 'QX7-42', role: 'PLAYER', playerName: 'Cy' },
  { type: 'JOIN_ROOM', code: 'QX7-42', role: 'SPECTATOR', playerName: 'Di' },
  { type: 'QUICK_MATCH', mode: 'TEAM', playerName: 'Ed' },
  { type: 'TAKE_SEAT', seat: 'P3' },
  { type: 'READY', ready: true },
  { type: 'START_GAME' },
  { type: 'PLAY_CARD', cardId: 17 },
  { type: 'CHAT', text: 'go for |+>' },
  { type: 'CHALLENGE_ANSWER', questionId: 'gate-H-ZERO', choice: 1 },
  { type: 'LEAVE' },
  { type: 'PING', t: 123 },
];

const reject = (raw: unknown) => {
  const res = parseClientMessage(raw);
  expect(res.ok, JSON.stringify(raw).slice(0, 80)).toBe(false);
  return res;
};

describe('client → server messages (architecture.md §5)', () => {
  it('covers every client message type', () => {
    // The 10 in architecture.md §5 plus READY.
    expect(new Set(VALID.map((m) => m.type)).size).toBe(11);
  });

  it.each(VALID.map((m) => [m.type, m] as const))('accepts a valid %s', (_, msg) => {
    expect(parseClientMessage(msg)).toEqual({ ok: true, msg });
    // Also as the JSON text that arrives on the socket.
    expect(parseClientMessage(encodeMessage(msg))).toEqual({ ok: true, msg });
  });

  it('rejects an unknown type, including a PASS (rules.md §6: no passing)', () => {
    reject({ type: 'PASS' });
    reject({ type: 'ADD_BOT', seat: 'P2' });
  });

  it('rejects any trusted data beyond the intent and ids (no player field)', () => {
    reject({ type: 'PLAY_CARD', cardId: 3, player: 'P2' });
    reject({ type: 'START_GAME', seed: 42 });
  });

  it('rejects missing or badly typed fields', () => {
    reject({ type: 'PLAY_CARD' });
    reject({ type: 'PLAY_CARD', cardId: 1.5 });
    reject({ type: 'PLAY_CARD', cardId: 0 });
    reject({ type: 'TAKE_SEAT', seat: 'P5' });
    reject({ type: 'CHALLENGE_ANSWER', questionId: 'q', choice: 6 });
    reject({ type: 'CHALLENGE_ANSWER', questionId: '', choice: 0 });
    reject({ type: 'JOIN_ROOM', code: 'QX7-42', role: 'REFEREE', playerName: 'x' });
    reject({ type: 'READY' });
  });

  it('limits text lengths', () => {
    reject({ type: 'CHAT', text: '' });
    reject({ type: 'CHAT', text: 'x'.repeat(201) });
    reject({ type: 'QUICK_MATCH', mode: 'SOLO', playerName: 'x'.repeat(25) });
    reject({ type: 'CREATE_ROOM', mode: 'SOLO', visibility: 'PUBLIC', name: '', playerName: 'a' });
  });

  it('keeps room settings within bounds', () => {
    const room = {
      type: 'CREATE_ROOM',
      mode: 'SOLO',
      visibility: 'PUBLIC',
      name: 'R',
      playerName: 'a',
    };
    reject({ ...room, settings: { targetScore: 0 } });
    reject({ ...room, settings: { targetScore: 22 } });
    reject({ ...room, settings: { turnTimerMs: 5_000 } });
    reject({ ...room, settings: { timeLimitMs: 2 * 60 * 60 * 1000 } });
    reject({ ...room, settings: { handSize: 6 } });
  });

  it('needs enough cards in a custom deck to deal every seat', () => {
    const deckCounts = { H: 1, X: 1, Y: 1, Z: 1, S: 1, SX: 1, I: 1, MEASURE: 1, CNOT: 1 };
    const room = { visibility: 'PUBLIC', name: 'R', playerName: 'a', settings: { deckCounts } };
    // 9 cards deal Solo (2 × 4) but not Team (4 × 4).
    expect(parseClientMessage({ type: 'CREATE_ROOM', mode: 'SOLO', ...room }).ok).toBe(true);
    reject({ type: 'CREATE_ROOM', mode: 'TEAM', ...room });
    reject({
      type: 'CREATE_ROOM',
      mode: 'SOLO',
      ...room,
      settings: { deckCounts: { ...deckCounts, H: 21 } },
    });
  });

  it('rejects bad JSON, non-objects and oversized messages without throwing', () => {
    const res = reject('{not json');
    expect(res.ok === false && res.error).toMatch(/json/i);
    reject(42);
    reject(null);
    reject(JSON.stringify({ type: 'CHAT', text: 'x'.repeat(MAX_CLIENT_MESSAGE_LENGTH) }));
  });
});
