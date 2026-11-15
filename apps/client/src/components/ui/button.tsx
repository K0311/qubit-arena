import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  /** Smaller height for rows and toolbars; the default is the 56 px of ui-spec §2.4. */
  size?: 'normal' | 'small';
};

/** ui-spec §2.4: Primary (cyan/blue fill), Secondary (cyan outline), Danger (red fill). */
export function Button({ variant = 'primary', size = 'normal', className, ...rest }: Props) {
  const classes = ['btn', `btn--${variant}`, size === 'small' ? 'btn--small' : '', className]
    .filter(Boolean)
    .join(' ');
  return <button type="button" className={classes} {...rest} />;
}
