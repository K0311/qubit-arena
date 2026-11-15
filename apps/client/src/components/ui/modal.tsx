import type { ReactNode } from 'react';

/** Full-screen dim with a centred panel (Challenge, Result, "waiting for server"). */
export function Modal({
  open,
  title,
  children,
}: {
  open: boolean;
  title?: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal__body panel">
        {title && <h2 className="panel__title">{title}</h2>}
        {children}
      </div>
    </div>
  );
}
