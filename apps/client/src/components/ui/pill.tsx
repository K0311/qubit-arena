import type { ReactNode } from 'react';

export type PillTone = 'neutral' | 'green' | 'gold' | 'cyan' | 'blue' | 'red' | 'grey' | 'purple';

export function Pill({
  tone = 'neutral',
  children,
  testId,
}: {
  tone?: PillTone;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <span className={`pill pill--${tone}`} data-testid={testId}>
      {children}
    </span>
  );
}
