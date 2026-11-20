import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { GateCard } from '../../components/cards/gate-card';
import { TurnToast } from './hud';

describe('TurnToast', () => {
  it('shows when the turn comes to this player and hides after a moment', () => {
    vi.useFakeTimers();
    const { rerender } = render(<TurnToast active={false} />);
    expect(screen.queryByTestId('turn-toast')).toBeNull();
    rerender(<TurnToast active />);
    act(() => vi.advanceTimersByTime(200));
    expect(screen.getByTestId('turn-toast').textContent).toContain('YOUR TURN');
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.queryByTestId('turn-toast')).toBeNull();
    vi.useRealTimers();
  });

  it('on the first turn, waits for the board animation (opening roll) to finish', () => {
    vi.useFakeTimers();
    let busy = true;
    render(<TurnToast active isBusy={() => busy} />);
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByTestId('turn-toast')).toBeNull();
    busy = false;
    act(() => vi.advanceTimersByTime(200));
    expect(screen.getByTestId('turn-toast')).toBeTruthy();
    vi.useRealTimers();
  });
});

describe('hand card hover tip', () => {
  it('is the compact tip, and goes away once the card is selected', () => {
    const { rerender } = render(<GateCard kind="H" onSelect={() => {}} />);
    const tip = screen.getByTestId('gate-tip');
    expect(tip.textContent).toContain('Hadamard Gate');
    // The big letter of the full card is not in the tip.
    expect(tip.querySelector('.gate-card__letter')).toBeNull();
    rerender(<GateCard kind="H" selected onSelect={() => {}} />);
    expect(screen.queryByTestId('gate-tip')).toBeNull();
    fireEvent.click(screen.getByRole('button'));
  });
});
