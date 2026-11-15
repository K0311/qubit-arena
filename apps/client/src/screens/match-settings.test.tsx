import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { defaultConfig } from '@qa/engine';
import { MatchSettings } from './match-settings';

describe('Room match settings (ui-spec §6, rules.md §5)', () => {
  it.each(['SOLO', 'TEAM'] as const)('%s defaults: 7 points, 15:00, 60 s, 55 cards', (mode) => {
    render(<MatchSettings config={defaultConfig(mode)} editable={false} />);
    expect(screen.getByLabelText('Target score').textContent).toBe('7');
    expect(screen.getByLabelText('Match timer').textContent).toBe('15:00');
    expect(screen.getByLabelText('Turn timer').textContent).toBe('60 s');
    expect(screen.getByTestId('match-settings').textContent).toContain(
      '55 cards (H7 X4 Y9 Z7 S7 √X12 I3 M3 CNOT3)',
    );
  });

  it('is read-only for guests', () => {
    render(<MatchSettings config={defaultConfig('SOLO')} editable={false} />);
    expect(screen.getByText('Only the host can change these.')).toBeTruthy();
    for (const b of screen.getAllByRole('button'))
      expect((b as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('switch') as HTMLButtonElement).disabled).toBe(true);
  });

  it('sends only the changed setting when the host edits', () => {
    const onChange = vi.fn();
    render(<MatchSettings config={defaultConfig('TEAM')} editable onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Increase Target score'));
    fireEvent.click(screen.getByLabelText('Decrease Match timer'));
    fireEvent.click(screen.getByLabelText('Increase Turn timer'));
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange.mock.calls.map((c) => c[0])).toEqual([
      { targetScore: 8 },
      { timeLimitMs: 14 * 60_000 },
      { turnTimerMs: 65_000 },
      { suddenDeath: !defaultConfig('TEAM').suddenDeath },
    ]);
  });
});
