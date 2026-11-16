import { useCallback, useEffect, useState } from 'react';
import { en } from '../../i18n/en';

const isFull = () => typeof document !== 'undefined' && !!document.fullscreenElement;

/**
 * ui-spec §7.1: the game is laid out on a 16:9 stage, so a browser window with its toolbars
 * leaves bars at the sides. Full screen gives the stage the whole display. Hidden where the
 * browser has no Fullscreen API (iPhone Safari); the F key does the same as the button.
 */
export function FullscreenButton() {
  const supported = typeof document !== 'undefined' && document.fullscreenEnabled === true;
  const [full, setFull] = useState(isFull);

  useEffect(() => {
    // Esc or the browser's own controls leave full screen without our button.
    const onChange = () => setFull(isFull());
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggle = useCallback(() => {
    const done = isFull()
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen();
    // Refused (no user gesture, or blocked by the page's frame): stay as we are.
    void done.catch(() => setFull(isFull()));
  }, []);

  useEffect(() => {
    if (!supported) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      if (e.key !== 'f' && e.key !== 'F') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [supported, toggle]);

  if (!supported) return null;
  const label = full ? en.game.exitFullscreen : en.game.fullscreen;
  return (
    <button
      type="button"
      className="game-help game-fullscreen"
      data-testid="game-fullscreen"
      aria-label={label}
      aria-pressed={full}
      title={`${label} (F)`}
      onClick={toggle}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path
          d={
            full
              ? 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5'
              : 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'
          }
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
