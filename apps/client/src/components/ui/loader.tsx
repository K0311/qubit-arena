import { POSITIONS } from '@qa/engine';
import { stateColors } from '../../theme/state-colors';

/**
 * Loading mark: the six state colours chasing round a ring, with a label. Replaces bare
 * "Loading…" text so a slow connection still looks like the game.
 */
export function Loader({ label, size = 'large' }: { label: string; size?: 'large' | 'small' }) {
  return (
    <div className={`loader loader--${size}`} role="status" aria-live="polite">
      <div className="loader__ring" aria-hidden="true">
        {POSITIONS.map((p, i) => (
          <i
            key={p}
            style={
              {
                '--i': i,
                background: stateColors[p],
              } as React.CSSProperties
            }
          />
        ))}
      </div>
      <span className="loader__label">{label}</span>
    </div>
  );
}

/** Placeholder rows while a list loads. */
export function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <div className="skeleton-rows" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton-row" style={{ animationDelay: `${i * 120}ms` }} />
      ))}
    </div>
  );
}
