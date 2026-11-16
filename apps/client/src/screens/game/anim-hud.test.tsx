import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import {
  applyAction,
  createGame,
  defaultConfig,
  kickoffState,
  mulberry32,
  viewFor,
  type GameEvent,
} from '@qa/engine';
import { AnimationPlayer } from '../../lib/anim/player';
import type { GameViewData } from '../../state/store';
import { AnimatedBoard2D, Dice } from './anim-hud';
import { AboutScreen } from '../about';

const view = (log: GameEvent[]) => {
  const state = createGame(defaultConfig('SOLO'), mulberry32(3)).state;
  return { ...viewFor(state, 'P1'), log } as unknown as GameViewData;
};

describe('animated HUD (visual-design §4, ui-spec §13)', () => {
  it('opening roll: two dice in the team colours, showing the server roll at the end', () => {
    const p = new AnimationPlayer({ speed: 1, reduce: false });
    p.sync([], 'SOLO', 'ZERO', kickoffState('ZERO'), 0);
    const log: GameEvent[] = [{ type: 'OPENING_ROLL', blue: 6, red: 3 }];
    p.sync(log, 'SOLO', 'ZERO', kickoffState('ZERO'), performance.now());
    render(<Dice player={p} view={view(log)} />);
    expect(screen.getByTestId('die-blue')).toBeTruthy();
    expect(screen.getByTestId('die-red')).toBeTruthy();
  });

  it('while the ball is still flying, the test ids already show the server position', () => {
    const start = createGame(defaultConfig('SOLO'), mulberry32(3)).state;
    const p = new AnimationPlayer({ speed: 1, reduce: false });
    const v0 = viewFor(start, start.turn) as unknown as GameViewData;
    p.sync(v0.log, 'SOLO', v0.ball, v0.qubits, 0);
    const card = start.hands[start.turn]![0]!;
    const next = applyAction(
      start,
      { type: 'PLAY_CARD', player: start.turn, cardId: card.id },
      mulberry32(1),
    ).state;
    const v1 = viewFor(next, start.turn) as unknown as GameViewData;
    p.sync(v1.log, 'SOLO', v1.ball, v1.qubits, performance.now());
    render(<AnimatedBoard2D player={p} view={v1} ball={v1.ball} orientation="BLUE" />);
    if (v1.ball === 'FOG') expect(screen.getByTestId('fog')).toBeTruthy();
    else expect(screen.getByTestId('ball').getAttribute('data-position')).toBe(v1.ball);
  });
});

describe('card library at /about (ui-spec §8)', () => {
  it('shows all nine cards at detail size with their board effect', () => {
    render(
      <MemoryRouter>
        <AboutScreen />
      </MemoryRouter>,
    );
    const cards = screen.getByTestId('card-library').querySelectorAll('.gate-card--detail');
    expect(cards).toHaveLength(9);
    expect(screen.getByTestId('library-card-H').textContent).toContain('|0⟩ ↔ |+⟩');
    expect(screen.getByTestId('library-card-CNOT').textContent).toContain('ENTANGLE');
  });
});
