import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import {
  applyAction,
  applyCnot,
  createGame,
  defaultConfig,
  kickoffState,
  mulberry32,
  questionById,
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
const { StatePanel } = await import('./state-panel');
const { SettingsScreen } = await import('../settings');
const { useSettings } = await import('../../state/settings');

const seat = (name: string) => ({ name, ready: true, connected: true, bot: false, host: false });
function room(mode: Mode, status: Room['status'] = 'PLAYING'): Room {
  const config = defaultConfig(mode);
  return {
    code: 'QX7-42',
    name: 'Test',
    mode,
    visibility: 'PUBLIC',
    status,
    settings: { ...config, deckCounts: { ...config.deckCounts } },
    seats:
      mode === 'SOLO'
        ? { P1: seat('Ann'), P2: seat('Bo') }
        : { P1: seat('Ann'), P2: seat('Bo'), P3: seat('Cy'), P4: seat('Di') },
    spectators: 0,
    botLevel: 'EASY',
  };
}

let version = 1;
function push(state: GameState, viewer: PlayerId | 'SPECTATOR', fresh = false) {
  const store = useGame.getState();
  if (fresh) {
    store.leftRoom();
    version = 1;
    store.receive({
      type: 'ROOM_STATE',
      stateVersion: version++,
      room: room(state.config.mode, state.phase === 'FINISHED' ? 'FINISHED' : 'PLAYING'),
      you: { seat: viewer, host: false },
    } as ServerMessage);
  }
  store.receive({
    type: 'GAME_VIEW',
    stateVersion: version++,
    view: viewFor(state, viewer),
    clocks: { gameMs: 0, turnMs: null, logGameMs: state.log.map(() => 0) },
  } as unknown as ServerMessage);
}

/** Time up at 0 : 0, then one card that does not score → Quantum Challenge. */
function toChallenge(mode: Mode): GameState {
  const rng = mulberry32(11);
  const start = applyAction(
    createGame(defaultConfig(mode), rng).state,
    { type: 'TIME_UP' },
    rng,
  ).state;
  for (const c of start.hands[start.turn]!) {
    const s = applyAction(
      start,
      { type: 'PLAY_CARD', player: start.turn, cardId: c.id },
      rng,
    ).state;
    if (s.phase === 'CHALLENGE') return s;
  }
  throw new Error('no non-scoring card');
}

function answer(s: GameState, player: PlayerId, choice: number): GameState {
  const id = s.challenge!.questionIds[s.challenge!.index]!;
  return applyAction(s, { type: 'CHALLENGE_ANSWER', player, questionId: id, choice }, mulberry32(1))
    .state;
}

const renderGame = () =>
  render(
    <MemoryRouter>
      <GameScreen />
    </MemoryRouter>,
  );

beforeEach(() => send.mockClear());

describe('Quantum Challenge overlay (ui-spec §9)', () => {
  it('shows the question with exactly the choices sent, and sends the answer', () => {
    const s = toChallenge('SOLO');
    push(s, 'P1', true);
    renderGame();
    const q = questionById(s.challenge!.questionIds[0]!);
    expect(screen.getByText(q.prompt)).toBeTruthy();
    expect(screen.getAllByTestId(/^challenge-option-/)).toHaveLength(q.choices.length);
    fireEvent.click(screen.getByTestId('challenge-option-1'));
    expect(send).toHaveBeenCalledWith({ type: 'CHALLENGE_ANSWER', questionId: q.id, choice: 1 });
  });

  it('Team: the teammate sees the side answer, who submitted it, and cannot answer again', () => {
    let s = toChallenge('TEAM');
    s = answer(s, 'P1', 2);
    push(s, 'P2', true);
    renderGame();
    const mine = screen.getByTestId('challenge-option-2');
    expect(mine.className).toContain('is-mine');
    expect(mine.textContent).toContain("YOUR TEAM'S ANSWER");
    expect(screen.getByTestId('challenge-status-BLUE').textContent).toContain('P1');
    expect(screen.getByTestId('challenge-status-RED').textContent).toContain('still answering');
    expect(mine).toHaveProperty('disabled', true);
  });

  it('spectators watch but cannot answer', () => {
    push(toChallenge('SOLO'), 'SPECTATOR', true);
    renderGame();
    expect(screen.getByTestId('challenge-option-0')).toHaveProperty('disabled', true);
  });

  it('reveals the correct answer and its explanation after both sides answer', () => {
    let s = toChallenge('SOLO');
    push(s, 'P1', true);
    renderGame();
    const q = questionById(s.challenge!.questionIds[0]!);
    s = answer(answer(s, 'P1', q.answer), 'P2', (q.answer + 1) % q.choices.length);
    act(() => push(s, 'P1'));
    expect(screen.getByTestId('challenge-explanation').textContent).toContain(q.explanation);
    expect(screen.getByTestId(`challenge-option-${q.answer}`).className).toContain('is-correct');
    // The question on screen was answered by both, even though the server moved on.
    expect(screen.getByTestId('challenge-status-BLUE').textContent).toContain('P1');
    expect(screen.getByTestId('challenge-status-RED').textContent).toContain('P2');
  });
});

describe('Result overlay (ui-spec §10)', () => {
  function finished(): GameState {
    let s = toChallenge('SOLO');
    for (let i = 0; i < 5; i++) {
      const q = questionById(s.challenge!.questionIds[s.challenge!.index]!);
      s = answer(answer(s, 'P1', q.answer), 'P2', (q.answer + 1) % q.choices.length);
    }
    expect(s.phase).toBe('FINISHED');
    return s;
  }

  it('shows winner, score, reason and stats; Play Again sends REMATCH', () => {
    push(finished(), 'P1', true);
    renderGame();
    expect(screen.getByTestId('result-winner').textContent).toBe('BLUE TEAM WINS');
    expect(screen.getByText('VICTORY')).toBeTruthy();
    expect(screen.getByTestId('result-reason').textContent).toBe('Quantum Challenge 5 : 0');
    fireEvent.click(screen.getByTestId('result-play-again'));
    expect(send).toHaveBeenCalledWith({ type: 'REMATCH' });
    expect(screen.queryByText('Take the learning check →')).toBeNull();
  });

  it('the last reveal keeps the challenge points although the game is over', () => {
    const s = finished();
    push(s, 'P1', true);
    const first = renderGame();
    // Fresh screen: no reveal, so the result shows; the points come from the log.
    expect(screen.getByTestId('result-reason').textContent).toBe('Quantum Challenge 5 : 0');
    first.unmount();
    const before = toChallenge('SOLO');
    push(before, 'P1', true);
    const { unmount } = renderGame();
    let s2 = before;
    for (let i = 0; i < 5; i++) {
      const q = questionById(s2.challenge!.questionIds[s2.challenge!.index]!);
      s2 = answer(answer(s2, 'P1', q.answer), 'P2', (q.answer + 1) % q.choices.length);
      act(() => push(s2, 'P1'));
    }
    const points = document.querySelectorAll('.ch-side__points');
    expect([...points].map((p) => p.textContent)).toEqual(['5', '0']);
    unmount();
  });

  it('the losing side sees DEFEAT; spectators get no Play Again', () => {
    const s = finished();
    push(s, 'P2', true);
    const { unmount } = renderGame();
    expect(screen.getByText('DEFEAT')).toBeTruthy();
    unmount();
    push(s, 'SPECTATOR', true);
    renderGame();
    expect(screen.queryByTestId('result-play-again')).toBeNull();
  });
});

describe('state panel (ui-spec §7.4)', () => {
  it('single-qubit state, 100/0 and the green indicator off the fog', () => {
    render(<StatePanel qubits={kickoffState('ZERO')} ball="ZERO" partner="PLUS" />);
    expect(screen.getByTestId('state-psi').textContent).toBe('|ψ⟩ = 1|0⟩ + 0|1⟩');
    expect(screen.getByTestId('state-fog-indicator').getAttribute('data-fog')).toBe('false');
    expect(screen.getByText('100 %')).toBeTruthy();
  });

  it('two-qubit amplitudes and the purple indicator in the fog', () => {
    render(<StatePanel qubits={applyCnot(kickoffState('ZERO'))} ball="FOG" partner="FOG" />);
    expect(screen.getByTestId('state-psi').textContent).toBe('|ψ⟩ = (|00⟩ + |11⟩) / √2');
    expect(screen.getByTestId('state-fog-indicator').getAttribute('data-fog')).toBe('true');
    expect(screen.getAllByText('50 %')).toHaveLength(2);
  });
});

describe('team chat (rules.md §9)', () => {
  it('shows team lines and sends new ones; absent in Solo', () => {
    const team = createGame(defaultConfig('TEAM'), mulberry32(5)).state;
    push(team, 'P1', true);
    useGame.getState().receive({ type: 'CHAT', from: 'P2', name: 'Bo', text: 'go H', at: 1 });
    renderGame();
    expect(screen.getByTestId('team-chat').textContent).toContain('go H');
    fireEvent.change(screen.getByTestId('team-chat-input'), { target: { value: 'ok!' } });
    fireEvent.submit(screen.getByTestId('team-chat-input').closest('form')!);
    expect(send).toHaveBeenCalledWith({ type: 'CHAT', text: 'ok!' });
  });
});

describe('settings (ui-spec §12)', () => {
  it('saves to localStorage and the board follows them', () => {
    localStorage.clear();
    useSettings.getState().reset();
    render(
      <MemoryRouter>
        <SettingsScreen />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('switch', { name: 'Show gate labels on the board' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Star' }));
    expect(JSON.parse(localStorage.getItem('qa.settings')!)).toMatchObject({
      showLabels: false,
      ball: 'star',
    });
    // jsdom has no WebGL: 3D and the camera views are offered but cannot be picked.
    expect(screen.getByRole('radio', { name: '3D (WebGL not available)' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(screen.getByRole('radio', { name: 'Goal' })).toHaveProperty('disabled', true);
    expect(screen.queryByText(/Sound|Music|Volume/)).toBeNull();
  });
});
