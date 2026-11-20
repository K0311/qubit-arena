import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { TURN_ORDER, sideOf, type Mode, type PlayerId, type Side } from '@qa/engine';
import { en } from '../../i18n/en';
import type { LogRow } from '../../lib/game-log';
import { minutesSeconds } from '../../lib/format';

/** ui-spec §7.1 Scoreboard: per side name, end zone and score, plus the target in gold. */
export function Scoreboard({ score, target }: { score: Record<Side, number>; target: number }) {
  return (
    <div className="hud-score panel">
      {(['BLUE', 'RED'] as const).map((side) => (
        <div key={side} className={`hud-score__row hud-score__row--${side.toLowerCase()}`}>
          <span className="hud-score__side">{side === 'BLUE' ? en.game.blue : en.game.red}</span>
          <span className="hud-score__zone ket">({en.game.endzone(side)})</span>
          <span
            key={score[side]}
            className="hud-score__value num"
            data-testid={side === 'BLUE' ? 'score-blue' : 'score-red'}
          >
            {score[side]}
          </span>
        </div>
      ))}
      <span className="hud-score__target" aria-label={en.game.target(target)}>
        {en.game.targetLabel}
        <b className="hud-score__target-value num">{target}</b>
      </span>
    </div>
  );
}

/** ui-spec §7.1 Turn bar: pills in turn order, the active one in full team colour. */
export function TurnBar({ mode, turn, you }: { mode: Mode; turn: PlayerId; you: PlayerId | null }) {
  // ui-spec §13: the gold highlight slides along the bar to the active pill (300 ms).
  const bar = useRef<HTMLOListElement>(null);
  const [mark, setMark] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const el = bar.current?.querySelector<HTMLElement>('.hud-turns__pill.is-active');
    if (el) setMark({ left: el.offsetLeft, width: el.offsetWidth });
  }, [turn, you, mode]);
  return (
    <ol className="hud-turns" aria-label={en.game.turn} ref={bar}>
      {mark && (
        <li
          className="hud-turns__mark"
          aria-hidden="true"
          style={{ transform: `translateX(${mark.left}px)`, width: mark.width }}
        />
      )}
      {TURN_ORDER[mode].map((p, i) => {
        const active = p === turn;
        return (
          <li key={p} className="hud-turns__item">
            {i > 0 && <span className="hud-turns__arrow">→</span>}
            <span
              className={`hud-turns__pill hud-turns__pill--${sideOf(mode, p).toLowerCase()}${active ? ' is-active' : ''}`}
              data-testid={active ? 'turn-active' : undefined}
              aria-current={active ? 'step' : undefined}
            >
              {active && p === you ? `${p} · ${en.game.yourTurn}` : p}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

const BANNER_MS = 1600;

/**
 * Centre-top banners (visual-design §4). New log rows queue their banners; history that was
 * already there when the screen opened is not replayed.
 */
export function Banner({ rows, logLength }: { rows: readonly LogRow[]; logLength: number }) {
  const seen = useRef<number | null>(null);
  const [queue, setQueue] = useState<string[]>([]);

  useEffect(() => {
    if (seen.current === null) {
      seen.current = logLength;
      return;
    }
    const from = seen.current;
    seen.current = logLength;
    const fresh = rows.filter((r) => r.index >= from).flatMap((r) => r.banners);
    if (fresh.length > 0) setQueue((q) => [...q, ...fresh].slice(-6));
  }, [rows, logLength]);

  useEffect(() => {
    if (queue.length === 0) return;
    const id = setTimeout(() => setQueue((q) => q.slice(1)), BANNER_MS);
    return () => clearTimeout(id);
  }, [queue]);

  const text = queue[0];
  return (
    <div className="hud-banner" aria-live="polite" data-testid="banner">
      {text && (
        <span key={`${queue.length}-${text}`} className="hud-banner__text ket">
          {text}
        </span>
      )}
    </div>
  );
}

const TURN_TOAST_MS = 1600;

/**
 * A short "YOUR TURN" toast when the turn comes to this player. The turn bar alone was easy to
 * miss while watching the board. It waits until the board has finished animating (the opening
 * roll, the opponent's move), so it does not cover them; `isBusy` comes from the animation player.
 */
export function TurnToast({ active, isBusy }: { active: boolean; isBusy?: () => boolean }) {
  // Armed on mount when it is already our turn (the first turn after the opening roll) and on
  // every turn that comes to us later.
  const [armed, setArmed] = useState(active);
  const [show, setShow] = useState(false);
  const [prev, setPrev] = useState(active);
  if (active !== prev) {
    setPrev(active);
    setArmed(active);
    if (!active) setShow(false);
  }
  useEffect(() => {
    if (!armed) return;
    const id = setInterval(() => {
      if (isBusy?.()) return;
      setArmed(false);
      setShow(true);
    }, 150);
    return () => clearInterval(id);
  }, [armed, isBusy]);
  useEffect(() => {
    if (!show) return;
    const id = setTimeout(() => setShow(false), TURN_TOAST_MS);
    return () => clearTimeout(id);
  }, [show]);
  if (!show) return null;
  return (
    <div className="turn-toast" role="status" data-testid="turn-toast">
      <strong>{en.game.yourTurn}</strong>
      <span>{en.game.yourTurnHint}</span>
    </div>
  );
}

/** ui-spec §7.1 Clocks: match clock, turn clock with a shrinking bar, red under 10 s. */
export function Clocks({
  gameMs,
  turnMs,
  turnTotalMs,
  deckCount,
}: {
  gameMs: number;
  turnMs: number | null;
  turnTotalMs: number;
  deckCount: number;
}) {
  const low = turnMs !== null && turnMs < 10_000;
  const frac = turnMs === null ? 0 : Math.max(0, Math.min(1, turnMs / turnTotalMs));
  return (
    <div className="hud-clocks panel">
      <div className="hud-clocks__cell">
        <span className="caption">{en.game.clockGame}</span>
        <span className="hud-clocks__value ket" data-testid="clock-game">
          {minutesSeconds(gameMs)}
        </span>
      </div>
      <div className={`hud-clocks__cell hud-clocks__cell--turn${low ? ' is-low' : ''}`}>
        <span className="caption">{en.game.clockTurn}</span>
        <span
          className="hud-clocks__value ket"
          data-testid="clock-turn"
          data-low={low || undefined}
        >
          {turnMs === null ? '—' : minutesSeconds(Math.ceil(turnMs / 1000) * 1000)}
        </span>
        <span className="hud-clocks__bar">
          <span style={{ transform: `scaleX(${frac})` }} />
        </span>
      </div>
      <div className="hud-clocks__cell">
        <span className="caption">{en.game.deck}</span>
        <span className="hud-clocks__value ket">{deckCount}</span>
      </div>
    </div>
  );
}
