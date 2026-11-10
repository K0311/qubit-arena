import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './app';

describe('scaffold', () => {
  it('client renders the app shell', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Qubit Arena' })).toBeTruthy();
  });
});
