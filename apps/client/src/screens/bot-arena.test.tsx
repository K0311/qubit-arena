import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { defaultConfig } from '@qa/engine';
import type { Room, ServerMessage } from '@qa/protocol';

const send = vi.fn();
vi.mock('../net/connection', () => ({ connection: vi.fn(), send: (m: unknown) => send(m) }));

const { useGame } = await import('../state/store');
const { ModeSelect } = await import('./mode-select');
const { RoomScreen } = await import('./room');
const { Routes, Route } = await import('react-router');

const human = { name: 'Ann', ready: false, connected: true, bot: false, host: true };
const bot = { name: 'Q-Bot P2', ready: true, connected: false, bot: true, host: false };

function showRoom(seats: Room['seats'], host: boolean) {
  const config = defaultConfig('TEAM');
  const store = useGame.getState();
  store.leftRoom();
  store.receive({
    type: 'ROOM_STATE',
    stateVersion: 1,
    room: {
      code: 'QX7-42',
      name: 'Test',
      mode: 'TEAM',
      visibility: 'PRIVATE',
      status: 'WAITING',
      settings: { ...config, deckCounts: { ...config.deckCounts } },
      seats,
      spectators: 0,
      botLevel: 'EASY',
    },
    you: { seat: 'P1', host },
  } as ServerMessage);
  render(
    <MemoryRouter initialEntries={['/room/QX7-42']}>
      <Routes>
        <Route path="/room/:code" element={<RoomScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => send.mockClear());

describe('Bot Arena', () => {
  it('mode select has a Bot Arena card that starts a game against bots', () => {
    render(
      <MemoryRouter>
        <ModeSelect />
      </MemoryRouter>,
    );
    expect(screen.getByText('Bot Arena')).toBeTruthy();
    fireEvent.click(screen.getByTestId('mode-bot-solo'));
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'BOT_GAME', mode: 'SOLO', level: 'NORMAL' }),
    );
    // P-6.4: Easy / Hard picker on the card, Hard (the greedy bot, NORMAL inside) by default.
    expect(screen.getByTestId('mode-bot-level-EASY').textContent).toContain('Easy');
    expect(screen.getByTestId('mode-bot-level-NORMAL').textContent).toContain('Hard');
    expect(screen.queryByText('Normal')).toBeNull();
    fireEvent.click(screen.getByTestId('mode-bot-level-EASY'));
    fireEvent.click(screen.getByTestId('mode-bot-solo'));
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'BOT_GAME', mode: 'SOLO', level: 'EASY' }),
    );
    fireEvent.click(screen.getByTestId('mode-bot-team'));
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'BOT_GAME', mode: 'TEAM' }),
    );
  });

  it('the host adds a bot to an empty seat and removes it again', () => {
    showRoom({ P1: human, P2: bot, P3: null, P4: null }, true);
    fireEvent.click(screen.getByTestId('seat-P3-add-bot'));
    expect(send).toHaveBeenLastCalledWith({ type: 'ADD_BOT', seat: 'P3' });
    fireEvent.click(screen.getByTestId('seat-P2-remove-bot'));
    expect(send).toHaveBeenLastCalledWith({ type: 'REMOVE_BOT', seat: 'P2' });
    expect(screen.queryByTestId('seat-P1-remove-bot')).toBeNull();
  });

  it('P-6.4: the host picks the bot level in the room; guests only see it', () => {
    showRoom({ P1: human, P2: bot, P3: null, P4: null }, true);
    expect(screen.getByTestId('setting-bot-level-EASY').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('setting-bot-level-NORMAL').textContent).toContain('Hard');
    fireEvent.click(screen.getByTestId('setting-bot-level-NORMAL'));
    expect(send).toHaveBeenLastCalledWith({
      type: 'UPDATE_SETTINGS',
      settings: { botLevel: 'NORMAL' },
    });
  });

  it('P-6.4: guests cannot change the bot level', () => {
    showRoom({ P1: { ...human, host: false }, P2: bot, P3: null, P4: null }, false);
    expect((screen.getByTestId('setting-bot-level-NORMAL') as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('guests see the bots but cannot add or remove them', () => {
    showRoom({ P1: { ...human, host: false }, P2: bot, P3: null, P4: null }, false);
    expect(screen.getByTestId('player-chip-P2').textContent).toContain('bot');
    expect(screen.queryByTestId('seat-P3-add-bot')).toBeNull();
    expect(screen.queryByTestId('seat-P2-remove-bot')).toBeNull();
  });
});
