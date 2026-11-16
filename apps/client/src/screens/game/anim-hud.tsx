import { useEffect, useRef, useState } from 'react';
import { sideOf, type CardKind, type PlayerId } from '@qa/engine';
import { Board2D, type Board2DProps } from '../../components/board/board-2d';
import { GateCard } from '../../components/cards/gate-card';
import { en } from '../../i18n/en';
import type { AnimationPlayer } from '../../lib/anim/player';
import { useAnimFrame } from '../../lib/anim/use-animation';
import type { GameViewData } from '../../state/store';
import { StatePanel } from './state-panel';

type WithPlayer = { player: AnimationPlayer; view: GameViewData };

/** The 2D board, re-drawn every animation frame while something plays. */
export function AnimatedBoard2D({ player, view, ...props }: WithPlayer & Board2DProps) {
  const frame = useAnimFrame(player, view);
  return <Board2D {...props} frame={frame} />;
}

/** The state panel with its Bloch vectors following the board's animation (ui-spec §7.4). */
export function AnimatedStatePanel({ player, view }: WithPlayer) {
  const frame = useAnimFrame(player, view);
  return (
    <StatePanel
      qubits={view.qubits}
      ball={view.ball}
      partner={view.partner}
      vectors={{ bloch: frame.bloch, partner: frame.partner }}
    />
  );
}

const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [
    [0, 0],
    [2, 2],
  ],
  3: [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
  4: [
    [0, 0],
    [0, 2],
    [2, 0],
    [2, 2],
  ],
  5: [
    [0, 0],
    [0, 2],
    [1, 1],
    [2, 0],
    [2, 2],
  ],
  6: [
    [0, 0],
    [0, 2],
    [1, 0],
    [1, 2],
    [2, 0],
    [2, 2],
  ],
};

function Die({ value, side, rolling }: { value: number; side: 'BLUE' | 'RED'; rolling: boolean }) {
  // While rolling the faces flicker; the final face is the value the server rolled.
  const shown = rolling ? 1 + Math.floor((performance.now() / 70) % 6) : value;
  return (
    <div
      className={`die die--${side.toLowerCase()}${rolling ? ' is-rolling' : ''}`}
      data-testid={`die-${side.toLowerCase()}`}
      data-value={rolling ? undefined : value}
    >
      {PIPS[shown]!.map(([r, c], i) => (
        <span key={i} className="die__pip" style={{ gridRow: r + 1, gridColumn: c + 1 }} />
      ))}
    </div>
  );
}

/** Opening roll: two dice in the team colours (visual-design §4). Display only. */
export function Dice({ player, view }: WithPlayer) {
  const frame = useAnimFrame(player, view);
  if (!frame.dice) return null;
  const { blue, red, rolling } = frame.dice;
  return (
    <div className="dice" aria-label={en.log.roll}>
      <Die value={blue} side="BLUE" rolling={rolling} />
      <Die value={red} side="RED" rolling={rolling} />
    </div>
  );
}

type Flight = { id: number; kind: CardKind; x0: number; y0: number };

/**
 * A played card flies from the hand (or from the player's team panel, face shown once played)
 * towards the board and fades (ui-spec §13, 400 ms). Positions are on the 1920 × 1080 stage.
 */
export function CardFly({
  view,
  you,
  speed,
  reduce,
  sides,
}: {
  view: GameViewData;
  you: PlayerId | null;
  speed: number;
  reduce: boolean;
  /** Team panels top to bottom in the left column. */
  sides: readonly ('BLUE' | 'RED')[];
}) {
  const seen = useRef(view.log.length);
  const [flights, setFlights] = useState<Flight[]>([]);
  useEffect(() => {
    const fresh = view.log.slice(seen.current);
    seen.current = view.log.length;
    if (reduce) return;
    const added: Flight[] = [];
    for (const e of fresh) {
      if (e.type !== 'CARD_PLAYED') continue;
      const mine = e.player === you;
      const panel = sides.indexOf(sideOf(view.config.mode, e.player));
      added.push({
        id: Math.random(),
        kind: e.card.kind,
        x0: mine ? 892 : 210,
        y0: mine ? 850 : panel === 0 ? 200 : 420,
      });
    }
    if (added.length > 0) setFlights((f) => [...f, ...added].slice(-3));
  }, [view, you, reduce, sides]);

  const ms = Math.round(400 / speed);
  return (
    <>
      {flights.map((f) => (
        <div
          key={f.id}
          className="card-fly"
          style={
            {
              '--x0': `${f.x0}px`,
              '--y0': `${f.y0}px`,
              animationDuration: `${ms}ms`,
            } as React.CSSProperties
          }
          onAnimationEnd={() => setFlights((all) => all.filter((x) => x.id !== f.id))}
          aria-hidden="true"
        >
          <GateCard kind={f.kind} />
        </div>
      ))}
    </>
  );
}
