import type { HTMLAttributes, ReactNode } from 'react';

type Props = HTMLAttributes<HTMLElement> & {
  title?: ReactNode;
  /** Coloured border plus glow, for the screen's main action panel (ui-spec §1 Frames). */
  accent?: 'cyan' | 'gold' | 'blue' | 'red' | 'purple';
};

export function Panel({ title, accent, className, children, ...rest }: Props) {
  const classes = ['panel', accent ? `panel--${accent}` : '', className].filter(Boolean).join(' ');
  return (
    <section className={classes} {...rest}>
      {title && <h2 className="panel__title">{title}</h2>}
      {children}
    </section>
  );
}
