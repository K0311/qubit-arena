import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Button } from './button';
import { PlayerChip } from './player-chip';

describe('PlayerChip (ui-spec §7)', () => {
  it('shows side, seat, name and card count, so colour is never the only signal', () => {
    render(<PlayerChip seat="P3" side="RED" name="Cy" cardCount={4} />);
    const chip = screen.getByTestId('player-chip-P3');
    expect(chip.textContent).toContain('RED');
    expect(chip.textContent).toContain('P3');
    expect(chip.textContent).toContain('Cy');
    expect(screen.getByLabelText('4 cards')).toBeTruthy();
    expect(chip.className).toContain('chip--red');
    expect(chip.getAttribute('data-active')).toBeNull();
  });

  it('marks the active player and lists you / host / bot / away', () => {
    const { rerender } = render(<PlayerChip seat="P1" side="BLUE" name="Ann" active you host />);
    const chip = screen.getByTestId('player-chip-P1');
    expect(chip.getAttribute('data-active')).toBe('true');
    expect(chip.className).toContain('chip--active');
    expect(chip.textContent).toContain('you · host');

    rerender(<PlayerChip seat="P1" side="BLUE" name="Ann" connected={false} />);
    expect(screen.getByTestId('player-chip-P1').textContent).toContain('away');
    rerender(<PlayerChip seat="P1" side="BLUE" name="Ann" connected={false} bot />);
    expect(screen.getByTestId('player-chip-P1').textContent).toContain('bot');
    expect(screen.getByTestId('player-chip-P1').textContent).not.toContain('away');
  });

  it('has no card count before the game', () => {
    render(<PlayerChip seat="P2" side="BLUE" name="Bo" />);
    expect(screen.queryByLabelText(/cards/)).toBeNull();
  });
});

describe('Button (ui-spec §2.4)', () => {
  it('renders the three variants', () => {
    render(
      <>
        <Button>Go</Button>
        <Button variant="secondary">Back</Button>
        <Button variant="danger">Leave</Button>
      </>,
    );
    expect(screen.getByText('Go').className).toContain('btn--primary');
    expect(screen.getByText('Back').className).toContain('btn--secondary');
    expect(screen.getByText('Leave').className).toContain('btn--danger');
  });

  it('is a non-submitting button that calls onClick unless disabled', () => {
    const onClick = vi.fn();
    const { rerender } = render(<Button onClick={onClick}>Play</Button>);
    const button = screen.getByRole('button', { name: 'Play' });
    expect(button.getAttribute('type')).toBe('button');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(
      <Button onClick={onClick} disabled>
        Play
      </Button>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
