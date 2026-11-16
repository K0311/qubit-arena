import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { defaultConfig } from '@qa/engine';
import type { RoomSummary, ServerMessage } from '@qa/protocol';

const send = vi.fn();
vi.mock('../net/connection', () => ({ connection: vi.fn(), send: (m: unknown) => send(m) }));

const { useGame } = await import('../state/store');
const { Lobby } = await import('./lobby');

const summary = (over: Partial<RoomSummary>): RoomSummary => ({
  code: 'QX7-42',
  name: 'Friday',
  mode: 'TEAM',
  status: 'WAITING',
  players: 3,
  seats: 4,
  spectators: 0,
  settings: defaultConfig('TEAM'),
  ...over,
});

function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>;
}

function showLobby(rooms: RoomSummary[]) {
  useGame.getState().receive({ type: 'ROOM_LIST', rooms } as ServerMessage);
  render(
    <MemoryRouter initialEntries={['/lobby']}>
      <Routes>
        <Route path="/lobby" element={<Lobby />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => send.mockClear());

describe('Lobby (ui-spec §5)', () => {
  it('lists each room as a row with its seats filled, and Join or Watch', () => {
    showLobby([
      summary({}),
      summary({ code: 'ZZ1-08', name: 'Bros', status: 'PLAYING', players: 4 }),
    ]);
    expect(screen.getByTestId('lobby-room-count').textContent).toMatch(/2 rooms/);
    const open = screen.getByTestId('room-row-QX7-42');
    expect(open.querySelectorAll('.seat-dot.is-on')).toHaveLength(3);
    expect(open.querySelectorAll('.seat-dot')).toHaveLength(4);
    fireEvent.click(screen.getByTestId('room-row-QX7-42-join'));
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'JOIN_ROOM', code: 'QX7-42', role: 'PLAYER' }),
    );
    fireEvent.click(screen.getByTestId('room-row-ZZ1-08-join'));
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'JOIN_ROOM', code: 'ZZ1-08', role: 'SPECTATOR' }),
    );
    expect(screen.getByTestId('room-row-ZZ1-08-join').textContent).toBe('Watch');
  });

  it('with no rooms, invites the player to create one', async () => {
    showLobby([]);
    expect(screen.getByTestId('lobby-empty').textContent).toMatch(/no open rooms/i);
    expect(screen.getByTestId('lobby-room-count').textContent).toMatch(/0 rooms/);
    await act(async () => fireEvent.click(screen.getByTestId('lobby-empty-create')));
    expect(document.activeElement).toBe(screen.getByTestId('lobby-room-name'));
  });

  it('with no rooms, offers Bot Arena practice on the mode select screen', () => {
    showLobby([]);
    fireEvent.click(screen.getByTestId('lobby-empty-bots'));
    expect(screen.getByTestId('where').textContent).toBe('/play');
  });

  it('quick match tiles still send QUICK_MATCH', () => {
    showLobby([]);
    fireEvent.click(screen.getByTestId('lobby-quick-team'));
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'QUICK_MATCH', mode: 'TEAM' }),
    );
  });
});
