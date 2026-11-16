import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import {
  applyAction,
  createGame,
  defaultConfig,
  mulberry32,
  viewFor,
  type GameState,
  type Mode,
  type PlayerId,
} from '@qa/engine';
import type { Room, ServerMessage } from '@qa/protocol';

const send = vi.fn();
vi.mock('../../net/connection', () => ({ connection: vi.fn(), send: (m: unknown) => send(m) }));

const { useGame } = await import('../../state/store');
const { GameScreen } = await import('./game-screen');
const { Board2D } = await import('../../components/board/board-2d');

const seat = (name: string) => ({ name, ready: true, connected: true, bot: false, host: false });

function room(mode: Mode): Room {
  const config = defaultConfig(mode);
  return {
    code: 'QX7-42',
    name: 'Test',
    mode,
    visibility: 'PUBLIC',
    status: 'PLAYING',
    settings: { ...config, deckCounts: { ...config.deckCounts } },
    seats:
      mode === 'SOLO'
        ? { P1: seat('Ann'), P2: seat('Bo') }
        : { P1: seat('Ann'), P2: seat('Bo'), P3: seat('Cy'), P4: seat('Di') },
    spectators: 0,
  };
}

function load(state: GameState, viewer: PlayerId | 'SPECTATOR') {
  const r = room(state.config.mode);
  const store = useGame.getState();
  store.leftRoom();
  store.receive({
    type: 'ROOM_STATE',
    stateVersion: 1,
    room: r,
    you: { seat: viewer, host: false },
  } as ServerMessage);
  store.receive({
    type: 'GAME_VIEW',
    stateVersion: 2,
    view: viewFor(state, viewer),
    clocks: { gameMs: 900_000, turnMs: 9_000, logGameMs: state.log.map(() => 900_000) },
  } as unknown as ServerMessage);
}

const renderGame = () =>
  render(
    <MemoryRouter>
      <GameScreen />
    </MemoryRouter>,
  );

beforeEach(() => send.mockClear());

describe('game screen (ui-spec §7)', () => {
  const solo = createGame(defaultConfig('SOLO'), mulberry32(3)).state;

  it('selects with keys 1–4, previews, plays with Enter and cancels with Esc', () => {
    load(solo, solo.turn);
    renderGame();
    const first = screen.getByTestId('hand-card-0');
    expect(screen.getByTestId('play-card')).toHaveProperty('disabled', true);

    fireEvent.keyDown(window, { key: '1' });
    expect(first.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('preview-line').textContent).not.toBe('');
    expect(screen.getByTestId('play-card')).toHaveProperty('disabled', false);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(first.getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByTestId('preview-line')).toBeNull();

    fireEvent.keyDown(window, { key: '1' });
    fireEvent.keyDown(window, { key: 'Enter' });
    const cardId = solo.hands[solo.turn]![0]!.id;
    expect(send).toHaveBeenCalledWith({ type: 'PLAY_CARD', cardId });
  });

  it('cannot play out of turn, and shows only a count for the opponent', () => {
    const other: PlayerId = solo.turn === 'P1' ? 'P2' : 'P1';
    load(solo, other);
    renderGame();
    fireEvent.click(screen.getByTestId('hand-card-0'));
    expect(screen.getByTestId('play-card')).toHaveProperty('disabled', true);
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(send).not.toHaveBeenCalled();
    expect(screen.getByTestId(`opponent-count-${solo.turn}`).getAttribute('data-count')).toBe('4');
  });

  it('shows the turn bar, scores, clocks with the red warning, and the log', () => {
    load(solo, solo.turn);
    renderGame();
    expect(screen.getByTestId('turn-active').textContent).toBe(`${solo.turn} · YOUR TURN`);
    expect(screen.getByTestId('score-blue').textContent).toBe('0');
    expect(screen.getByTestId('clock-game').textContent).toBe('15:00');
    expect(screen.getByTestId('clock-turn').getAttribute('data-low')).toBe('true');
    expect(screen.getByTestId('action-log').textContent).toContain('Kickoff');
    expect(screen.queryByTestId('team-chat')).toBeNull();
  });

  it('Team: teammate hand as gate tags, opponents as counts, chat panel for players', () => {
    const team = createGame(defaultConfig('TEAM'), mulberry32(5)).state;
    load(team, 'P1');
    renderGame();
    expect(screen.queryByTestId('opponent-count-P2')).toBeNull();
    expect(screen.getByLabelText("Teammate's hand").children).toHaveLength(4);
    expect(screen.getByTestId('opponent-count-P3')).toBeTruthy();
    expect(screen.getByTestId('opponent-count-P4')).toBeTruthy();
    expect(screen.getByTestId('team-chat')).toBeTruthy();
  });

  it('spectator: no hand, no Play Card, no chat, counts for everyone, Blue orientation', () => {
    const team = createGame(defaultConfig('TEAM'), mulberry32(5)).state;
    load(team, 'SPECTATOR');
    renderGame();
    expect(screen.queryByTestId('hand-card-0')).toBeNull();
    expect(screen.queryByTestId('play-card')).toBeNull();
    expect(screen.queryByTestId('team-chat')).toBeNull();
    for (const p of ['P1', 'P2', 'P3', 'P4']) {
      expect(screen.getByTestId(`opponent-count-${p}`)).toBeTruthy();
    }
    expect(screen.getByRole('img', { name: 'Board' }).getAttribute('data-orientation')).toBe(
      'BLUE',
    );
  });

  it('a new card in the log shows its banner', () => {
    load(solo, solo.turn);
    renderGame();
    const card = solo.hands[solo.turn]![0]!;
    const next = applyAction(
      solo,
      { type: 'PLAY_CARD', player: solo.turn, cardId: card.id },
      mulberry32(1),
    ).state;
    act(() =>
      useGame.getState().receive({
        type: 'GAME_VIEW',
        stateVersion: 3,
        view: viewFor(next, solo.turn),
        clocks: { gameMs: 899_000, turnMs: 60_000, logGameMs: next.log.map(() => 899_000) },
      } as unknown as ServerMessage),
    );
    expect(screen.getByTestId('banner').textContent).not.toBe('');
  });
});

describe('2D board (ui-spec §7.2, visual-design §2)', () => {
  it('puts the viewer’s own end zone at the top', () => {
    const top = (side: 'BLUE' | 'RED') => {
      const { container, unmount } = render(<Board2D ball="ZERO" orientation={side} />);
      const y = (p: string) =>
        Number(
          container
            .querySelector(`[data-testid="board-node-${p}"]`)!
            .parentElement!.getAttribute('transform')!
            .match(/translate\(([-\d.e]+) ([-\d.e]+)\)/)![2],
        );
      const result = y('PLUS') < y('MINUS') ? 'PLUS' : 'MINUS';
      unmount();
      return result;
    };
    expect(top('BLUE')).toBe('PLUS');
    expect(top('RED')).toBe('MINUS');
  });

  it('draws six nodes, 13 edges, the ball, and hides the ball in the fog', () => {
    const { container, rerender } = render(<Board2D ball="PLUS_I" orientation="BLUE" />);
    expect(container.querySelectorAll('[data-testid^="board-node-"]')).toHaveLength(6);
    expect(container.querySelectorAll('[data-edge]')).toHaveLength(13);
    expect(screen.getByTestId('ball').getAttribute('data-position')).toBe('PLUS_I');
    rerender(<Board2D ball="FOG" orientation="BLUE" />);
    expect(screen.queryByTestId('ball')).toBeNull();
    expect(screen.getByTestId('fog')).toBeTruthy();
  });

  it('a decorative copy (the 3D minimap) carries no test ids, so ids stay unique', () => {
    const { container } = render(<Board2D ball="FOG" orientation="BLUE" decorative />);
    expect(container.querySelectorAll('[data-testid]')).toHaveLength(0);
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('marks the preview target and edge', () => {
    render(
      <Board2D
        ball="ZERO"
        orientation="BLUE"
        preview={{
          line: 'H → |+⟩',
          note: null,
          targets: ['PLUS'],
          edge: { from: 'ZERO', to: 'PLUS' },
          touchdown: true,
        }}
      />,
    );
    expect(screen.getByTestId('preview-target').getAttribute('data-positions')).toBe('PLUS');
    expect(document.querySelector('.board2d__edge.is-preview')?.getAttribute('data-edge')).toBe(
      'ZERO-PLUS',
    );
  });
});
