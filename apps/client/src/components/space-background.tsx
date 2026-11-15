import { useMemo } from 'react';
import { mulberry32 } from '@qa/engine';

/** Star layer as one box-shadow list; seeded so it looks the same on every load. */
function starField(seed: number, count: number, maxSize: number): string {
  const rng = mulberry32(seed);
  const stars: string[] = [];
  for (let i = 0; i < count; i++) {
    const x = Math.round(rng.next() * 2000);
    const y = Math.round(rng.next() * 2000);
    const size = rng.next() < 0.85 ? 0 : Math.round(rng.next() * maxSize);
    const alpha = (0.35 + rng.next() * 0.65).toFixed(2);
    stars.push(`${x}px ${y}px 0 ${size}px rgba(255,255,255,${alpha})`);
  }
  return stars.join(',');
}

/**
 * Dark space backdrop (ui-spec §1, visual-design §3 "Sky"): navy gradient, two star layers and
 * a Milky Way band. Pure CSS; the reference PNGs are never shipped.
 */
export function SpaceBackground() {
  const faint = useMemo(() => starField(7, 420, 0), []);
  const bright = useMemo(() => starField(11, 90, 1), []);
  return (
    <div className="space-bg" aria-hidden="true">
      <div className="space-bg__band" />
      <div className="space-bg__stars" style={{ boxShadow: faint }} />
      <div className="space-bg__stars space-bg__stars--bright" style={{ boxShadow: bright }} />
    </div>
  );
}
