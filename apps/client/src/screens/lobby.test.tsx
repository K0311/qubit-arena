import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { defaultConfig } from '@qa/engine';
import type { Room, RoomSummary, ServerMessage } from '@qa/protocol';

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

function showLobby(rooms: RoomSummary[], path = '/lobby') {
  useGame.getState().receive({ type: 'ROOM_LIST', rooms } as ServerMessage);
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/lobby" element={<Lobby />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  send.mockClear();
  useGame.setState({ room: null });
});

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

  it('with no rooms, points to the panels on the right without repeating their buttons', () => {
    showLobby([]);
    expect(screen.getByTestId('lobby-empty').textContent).toMatch(/no open rooms/i);
    expect(screen.getByTestId('lobby-room-count').textContent).toMatch(/0 rooms/);
    expect(screen.getByTestId('lobby-empty').querySelector('button')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Create room' })).toHaveLength(1);
  });

  it('a lobby opened for one mode offers only that mode', () => {
    showLobby([], '/lobby?mode=solo');
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: 'Mode' })).toBeNull();
    expect(screen.getByTestId('lobby-mode').textContent).toBe('Solo 1v1');
    expect(screen.getByTestId('lobby-quick-solo')).toBeTruthy();
    expect(screen.queryByTestId('lobby-quick-team')).toBeNull();
    fireEvent.click(screen.getByTestId('lobby-create'));
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'CREATE_ROOM', mode: 'SOLO' }),
    );
  });

  it('a Team lobby creates Team rooms and asks only for Team rooms', () => {
    useGame.setState({ status: 'open' });
    showLobby([], '/lobby?mode=team');
    expect(send).toHaveBeenCalledWith({ type: 'LIST_ROOMS', mode: 'TEAM' });
    fireEvent.click(screen.getByTestId('lobby-create'));
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'CREATE_ROOM', mode: 'TEAM' }),
    );
  });

  it('Join on the room the player is already in goes back to that room', () => {
    useGame.setState({ room: { code: 'QX7-42', status: 'WAITING' } as Room });
    showLobby([summary({})]);
    expect(screen.getByTestId('room-row-QX7-42-join').textContent).toBe('Back to room');
    send.mockClear();
    fireEvent.click(screen.getByTestId('room-row-QX7-42-join'));
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'JOIN_ROOM' }));
    expect(screen.getByTestId('where').textContent).toBe('/room/QX7-42');
  });

  it('quick match tiles still send QUICK_MATCH', () => {
    showLobby([]);
    fireEvent.click(screen.getByTestId('lobby-quick-team'));
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'QUICK_MATCH', mode: 'TEAM' }),
    );
  });
});
