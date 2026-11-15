import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

// No real socket in unit tests.
vi.mock('./net/connection', () => ({ connection: vi.fn(), send: vi.fn() }));

const { App } = await import('./app');

describe('app shell (ui-spec §3, §4)', () => {
  it('shows the main menu with the Play button', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'QUBIT ARENA' })).toBeTruthy();
    expect(screen.getByTestId('menu-play')).toBeTruthy();
  });

  it('routes /play to the two online modes', () => {
    render(
      <MemoryRouter initialEntries={['/play']}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('mode-solo')).toBeTruthy();
    expect(screen.getByTestId('mode-team')).toBeTruthy();
  });
});
