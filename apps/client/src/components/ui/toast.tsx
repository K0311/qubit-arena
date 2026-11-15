import { useEffect } from 'react';
import { useGame } from '../../state/store';

const TOAST_MS = 4000;

/** Server errors and short notices, bottom centre; each one fades after a few seconds. */
export function Toasts() {
  const toasts = useGame((s) => s.toasts);
  const dismiss = useGame((s) => s.dismissToast);
  useEffect(() => {
    if (toasts.length === 0) return;
    const oldest = toasts[0];
    if (!oldest) return;
    const t = setTimeout(() => dismiss(oldest.id), TOAST_MS);
    return () => clearTimeout(t);
  }, [toasts, dismiss]);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.tone}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
