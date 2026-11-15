import { beforeEach, describe, expect, it } from 'vitest';
import { createGame, defaultConfig, mulberry32, viewFor } from '@qa/engine';
import type { Room, ServerMessage } from '@qa/protocol';
import { useGame } from './store';

const room = (code: string, version: number): ServerMessage => ({
  type: 'ROOM_STATE',
  stateVersion: version,
  room: {
    code,
    name: 'R',
    mode: 'SOLO',
    visibility: 'PUBLIC',
    status: 'PLAYING',
    settings: { ...defaultConfig('SOLO') },
    seats: { P1: null, P2: null },
    spectators: 0,
  } satisfies Room,
  you: { seat: 'P1', host: true },
});

const state = createGame(defaultConfig('SOLO'), mulberry32(1)).state;
const view = (version: number) =>
  ({
    type: 'GAME_VIEW',
    stateVersion: version,
    view: viewFor(state, 'P1'),
    clocks: { gameMs: 900_000, turnMs: 60_000, logGameMs: [] },
  }) as unknown as ServerMessage;

beforeEach(() => {
  useGame.getState().leftRoom();
  useGame.setState({ token: null, toasts: [] });
});

describe('client store (architecture.md §5 stateVersion)', () => {
  it('ignores messages older than the newest one seen in the room', () => {
    const { receive } = useGame.getState();
    receive(room('AAA-11', 1));
    receive(view(5));
    receive({ type: 'EVENT', stateVersion: 5, events: [{ type: 'TIME_UP' }] });
    receive({ type: 'EVENT', stateVersion: 3, events: [{ type: 'TIME_UP' }] });
    receive(room('AAA-11', 4));
    const s = useGame.getState();
    expect(s.stateVersion).toBe(5);
    expect(s.events).toHaveLength(1);
    expect(s.room?.code).toBe('AAA-11');
  });

  it('starts over in a new room, whose versions begin low again', () => {
    const { receive } = useGame.getState();
    receive(room('AAA-11', 9));
    receive(view(10));
    receive(room('BBB-22', 1));
    const s = useGame.getState();
    expect(s.room?.code).toBe('BBB-22');
    expect(s.stateVersion).toBe(1);
    expect(s.view).toBeNull();
  });

  it('forgets the room when the server hands out a new session token', () => {
    const { receive } = useGame.getState();
    receive({ type: 'WELCOME', protocolVersion: 1, token: 'a'.repeat(32) });
    receive(room('AAA-11', 1));
    receive({ type: 'WELCOME', protocolVersion: 1, token: 'a'.repeat(32) });
    expect(useGame.getState().room).not.toBeNull();
    receive({ type: 'WELCOME', protocolVersion: 1, token: 'b'.repeat(32) });
    expect(useGame.getState().room).toBeNull();
  });

  it('turns server errors into toasts and keeps the lobby list', () => {
    const { receive } = useGame.getState();
    receive({ type: 'ERROR', code: 'ROOM_FULL', message: 'no free seat' });
    receive({ type: 'ROOM_LIST', rooms: [] });
    const s = useGame.getState();
    expect(s.toasts.map((t) => t.text)).toEqual(['no free seat']);
    expect(s.roomList).toEqual([]);
  });
});
