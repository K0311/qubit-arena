import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import type { Room } from '@qa/protocol';

const send = vi.fn();
vi.mock('../net/connection', () => ({ connection: vi.fn(), send: (m: unknown) => send(m) }));

const { useGame } = await import('../state/store');
const { InRoomBar } = await import('./in-room-bar');

function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>;
}

function at(path: string, status: Room['status'] | null) {
  useGame.setState({
    room: status ? ({ code: 'QX7-42', name: 'Friday', status } as Room) : null,
  });
  render(
    <MemoryRouter initialEntries={[path]}>
      <InRoomBar />
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => send.mockClear());

describe('In-room bar (ui-spec §3)', () => {
  it('is hidden when the player is not in a room', () => {
    at('/lobby', null);
    expect(screen.queryByTestId('in-room-bar')).toBeNull();
  });

  it('is hidden on the room and game screens themselves', () => {
    at('/room/QX7-42', 'WAITING');
    expect(screen.queryByTestId('in-room-bar')).toBeNull();
  });

  it('on another screen, says which room the player is still in and takes them back', () => {
    at('/lobby', 'WAITING');
    expect(screen.getByTestId('in-room-bar').textContent).toMatch(/QX7-42/);
    fireEvent.click(screen.getByTestId('in-room-back'));
    expect(screen.getByTestId('where').textContent).toBe('/room/QX7-42');
  });

  it('during a game, takes the player back to the game', () => {
    at('/about', 'PLAYING');
    expect(screen.getByTestId('in-room-back').textContent).toMatch(/game/i);
    fireEvent.click(screen.getByTestId('in-room-back'));
    expect(screen.getByTestId('where').textContent).toBe('/game/QX7-42');
  });

  it('Leave leaves the room on the server and hides the bar', () => {
    at('/lobby', 'WAITING');
    fireEvent.click(screen.getByTestId('in-room-leave'));
    expect(send).toHaveBeenLastCalledWith({ type: 'LEAVE' });
    expect(useGame.getState().room).toBeNull();
    expect(screen.queryByTestId('in-room-bar')).toBeNull();
  });
});
