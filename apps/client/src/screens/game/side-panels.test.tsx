import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GateReference } from './side-panels';

describe('GateReference', () => {
  it('shows one line per gate and opens one gate at a time to its moves', () => {
    const { container } = render(<GateReference />);
    expect(screen.getAllByRole('button')).toHaveLength(9);
    expect(container.querySelector('.game-ref__moves')).toBeNull();

    fireEvent.click(screen.getByTestId('gate-ref-H'));
    expect(screen.getByTestId('gate-ref-H').getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelectorAll('.game-ref__moves')).toHaveLength(1);

    fireEvent.click(screen.getByTestId('gate-ref-CNOT'));
    expect(screen.getByTestId('gate-ref-H').getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('.game-ref__moves')?.textContent).toContain('fog');

    fireEvent.click(screen.getByTestId('gate-ref-CNOT'));
    expect(container.querySelector('.game-ref__moves')).toBeNull();
  });

  it('the help modal version lists every move', () => {
    const { container } = render(<GateReference full />);
    expect(container.querySelectorAll('.game-ref__moves')).toHaveLength(9);
  });
});

describe('GateReference focus', () => {
  it('opens the row of the selected hand card', () => {
    const { rerender } = render(<GateReference focus={null} />);
    expect(screen.getByTestId('gate-ref-S').getAttribute('aria-expanded')).toBe('false');
    rerender(<GateReference focus="S" />);
    expect(screen.getByTestId('gate-ref-S').getAttribute('aria-expanded')).toBe('true');
  });
});
