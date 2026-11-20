import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useGame } from '../state/store';
import { ConnectionBanner } from './connection-banner';
import { Toasts } from './ui/toast';

describe('toasts', () => {
  beforeEach(() => useGame.setState({ toasts: [] }));

  it('shows an error with its icon and closes on ×', () => {
    render(<Toasts />);
    act(() => useGame.getState().pushToast('No room ZZZ-99', 'error'));
    const toast = screen.getByText('No room ZZZ-99').closest('.toast')!;
    expect(toast.className).toContain('toast--error');
    expect(toast.querySelector('.toast__icon')?.textContent).toBe('!');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('No room ZZZ-99')).toBeNull();
  });
});

describe('connection banner', () => {
  it('says the connection is lost and that it retries by itself', () => {
    useGame.setState({ status: 'reconnecting' });
    render(<ConnectionBanner />);
    const banner = screen.getByTestId('net-status');
    expect(banner.className).toContain('net-banner--lost');
    expect(banner.textContent).toContain('Reconnecting');
    expect(banner.textContent).toContain('no need to reload');
  });
});
