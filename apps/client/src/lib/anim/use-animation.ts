import { useEffect, useRef, useState } from 'react';
import type { GameViewData } from '../../state/store';
import { AnimationPlayer, restFrame, type PlayerOptions } from './player';
import type { Frame } from './timeline';

/** One player per game screen, fed by every new GAME_VIEW. */
export function useAnimationPlayer(
  view: GameViewData | null,
  opts: PlayerOptions,
): AnimationPlayer {
  const ref = useRef<AnimationPlayer | null>(null);
  if (!ref.current) ref.current = new AnimationPlayer(opts);
  const player = ref.current;
  player.setOptions(opts);
  // Sync while rendering, not in an effect: child effects (the boards) run before the parent's,
  // so an effect here would leave them one view behind. Same view twice is a no-op.
  const synced = useRef<GameViewData | null>(null);
  if (view && synced.current !== view) {
    synced.current = view;
    player.sync(view.log, view.config.mode, view.ball, view.qubits, performance.now());
  }
  return player;
}

/**
 * The current frame for DOM renderers (2D board, state panel, dice): re-renders every animation
 * frame while something plays, and not at all when idle. The 3D board reads the player itself
 * inside its render loop instead.
 */
export function useAnimFrame(player: AnimationPlayer | null, view: GameViewData | null): Frame {
  const rest = view ? restFrame(view.ball, view.qubits) : restFrame('ZERO', null);
  const [frame, setFrame] = useState<Frame>(() => player?.frame(performance.now()) ?? rest);
  useEffect(() => {
    if (!player) return;
    let id = 0;
    const tick = () => {
      const now = performance.now();
      setFrame(player.frame(now));
      if (player.busy(now)) id = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(id);
  }, [player, view]);
  return player ? frame : rest;
}
