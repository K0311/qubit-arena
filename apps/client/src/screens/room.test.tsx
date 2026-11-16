import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { defaultConfig, type BotLevel, type Mode } from '@qa/engine';
import type { Room, ServerMessage } from '@qa/protocol';

const send = vi.fn();
vi.mock('../net/connection', () => ({ connection: vi.fn(), send: (m: unknown) => send(m) }));

const { useGame } = await import('../state/store');
const { RoomScreen } = await import('./room');

const human = (name: string, extra: object = {}) => ({
  name,
  ready: false,
  connected: true,
  bot: false,
  host: false,
  ...extra,
});
const bot = { name: 'Q-Bot P2', ready: true, connected: false, bot: true, host: false };

function showRoom(
  seats: Room['seats'],
  {
    mode = 'TEAM',
    host = true,
    you = 'P1',
    botLevel = 'EASY',
  }: { mode?: Mode; host?: boolean; you?: 'P1' | 'P3' | 'SPECTATOR'; botLevel?: BotLevel } = {},
) {
  const config = defaultConfig(mode);
  const store = useGame.getState();
  store.leftRoom();
  store.receive({
    type: 'ROOM_STATE',
    stateVersion: 1,
    room: {
      code: 'QX7-42',
      name: 'Friday',
      mode,
      visibility: 'PUBLIC',
      status: 'WAITING',
      settings: { ...config, deckCounts: { ...config.deckCounts } },
      seats,
      spectators: 0,
      botLevel,
    },
    you: { seat: you, host },
  } as ServerMessage);
  render(
    <MemoryRouter initialEntries={['/room/QX7-42']}>
      <Routes>
        <Route path="/room/:code" element={<RoomScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

const writeText = vi.fn(async () => {});
beforeEach(() => {
  send.mockClear();
  writeText.mockClear();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
});
afterEach(() => {
  delete (navigator as unknown as Record<string, unknown>).clipboard;
});

describe('Room screen (ui-spec §6)', () => {
  const teamSeats = (): Room['seats'] => ({
    P1: human('Ann', { ready: true, host: true }),
    P2: bot,
    P3: human('Bo'),
    P4: null,
  });

  it('copies the room code so it can be shared', async () => {
    showRoom(teamSeats());
    const copy = screen.getByTestId('room-copy-code');
    await act(async () => fireEvent.click(copy));
    expect(writeText).toHaveBeenCalledWith('QX7-42');
    expect(copy.textContent).toMatch(/copied/i);
    // The e2e helpers read the code from this element: it must stay "CODE <code>".
    expect(screen.getByTestId('room-code').textContent?.replace('CODE', '').trim()).toBe('QX7-42');
  });

  it('says who the room is still waiting for', () => {
    showRoom(teamSeats());
    expect(screen.getByTestId('room-ready-count').textContent).toMatch(/2 \/ 4/);
    const status = screen.getByTestId('room-status').textContent ?? '';
    expect(status).toContain('P3');
    expect(status).toMatch(/1 open seat/);
  });

  it('tells the host when everyone is ready', () => {
    showRoom({ P1: human('Ann', { ready: true, host: true }), P2: bot }, { mode: 'SOLO' });
    expect(screen.getByTestId('room-status').textContent).toMatch(/ready/i);
    expect((screen.getByTestId('room-start') as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows each seat as a card with its seat, name, tags and ready state', () => {
    showRoom(teamSeats(), { botLevel: 'NORMAL' });
    const p1 = screen.getByTestId('player-chip-P1');
    expect(p1.textContent).toContain('P1');
    expect(p1.textContent).toContain('Ann');
    expect(p1.textContent).toContain('you');
    expect(screen.getByTestId('seat-P1').getAttribute('data-ready')).toBe('true');
    expect(screen.getByTestId('seat-P3').getAttribute('data-ready')).toBe('false');
    // A bot says it is a bot and which level it plays at.
    expect(screen.getByTestId('player-chip-P2').textContent).toMatch(/bot.*Hard/);
  });

  it('an open seat can be taken', () => {
    showRoom(teamSeats(), { you: 'P3', host: false });
    const open = screen.getByTestId('seat-P4');
    expect(open.textContent).toMatch(/open seat/i);
    fireEvent.click(screen.getByTestId('seat-P4-take'));
    expect(send).toHaveBeenLastCalledWith({ type: 'TAKE_SEAT', seat: 'P4' });
  });

  it('shows the turn order from the rules (rules.md §6)', () => {
    showRoom(teamSeats());
    const order = [...screen.getByTestId('room-turn-order').querySelectorAll('[data-seat]')].map(
      (el) => el.getAttribute('data-seat'),
    );
    expect(order).toEqual(['P1', 'P3', 'P2', 'P4']);
  });
});
