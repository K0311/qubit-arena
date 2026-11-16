import {
  reducedBloch,
  type BallPosition,
  type GameEvent,
  type Mode,
  type TwoQubitState,
} from '@qa/engine';
import type { Vec } from './rotate';
import { durationOf, sampleStep, stepsFor, type Frame, type Step } from './timeline';

export type PlayerOptions = { speed: number; reduce: boolean };

/** If more steps than this wait, skip to the latest so the board never lags the game. */
const MAX_WAITING = 3;
/** Waiting steps play this much faster. */
const CATCH_UP = 1.6;

/**
 * Plays the animation queue (visual-design §4). It only replays what the server already
 * decided: new log entries become steps, and when the queue is empty the frame is exactly the
 * server state. Time is passed in, so tests drive it without real timers.
 */
export class AnimationPlayer {
  private seen = -1;
  private queue: Step[] = [];
  private current: { step: Step; start: number; dur: number } | null = null;
  private rest: Frame;

  constructor(public opts: PlayerOptions) {
    this.rest = restFrame('ZERO', null);
  }

  /** Feed the latest view: log, where the ball is, and the qubits. */
  sync(
    log: readonly GameEvent[],
    mode: Mode,
    ball: BallPosition,
    qubits: TwoQubitState,
    now: number,
  ) {
    this.rest = restFrame(ball, qubits);
    if (this.seen < 0 || log.length < this.seen) {
      // First view, or a new game in the same room. A game that has only just started (the
      // opening roll is there, no card yet) plays its roll and kickoff; otherwise the history
      // is shown as it is.
      this.queue = [];
      this.current = null;
      const justStarted =
        log.some((e) => e.type === 'OPENING_ROLL') && !log.some((e) => e.type === 'CARD_PLAYED');
      this.seen = justStarted ? 0 : log.length;
      if (!justStarted) return;
    }
    if (log.length === this.seen) return;
    this.queue.push(...stepsFor(log, this.seen, log.length));
    this.seen = log.length;
    if (this.queue.length > MAX_WAITING) {
      // Reconnect or a burst of bot moves: keep only the last step.
      this.queue = this.queue.slice(-1);
      this.current = null;
    }
    this.advance(now);
  }

  setOptions(opts: PlayerOptions) {
    this.opts = opts;
  }

  pending(): number {
    return this.queue.length;
  }

  busy(now: number): boolean {
    this.advance(now);
    return this.current !== null;
  }

  /** The frame to draw at `now`. */
  frame(now: number): Frame {
    this.advance(now);
    const c = this.current;
    if (!c) return this.rest;
    return sampleStep(c.step, (now - c.start) / c.dur, this.opts.reduce);
  }

  private advance(now: number) {
    for (;;) {
      if (this.current && now - this.current.start < this.current.dur) return;
      const start = this.current ? this.current.start + this.current.dur : now;
      const next = this.queue.shift();
      if (!next) {
        this.current = null;
        return;
      }
      const rate = this.queue.length > 0 ? CATCH_UP : 1;
      this.current = {
        step: next,
        start: Math.max(start, now - 1e9),
        dur: durationOf(next, this.opts) / rate,
      };
      // A step that started in the past (queued behind another) keeps its own time slot.
      if (this.current.start + this.current.dur <= now) continue;
      return;
    }
  }
}

/** The frame when nothing is playing: exactly the server state. */
export function restFrame(ball: BallPosition, qubits: TwoQubitState | null): Frame {
  const zero: Vec = [0, 0, 0];
  const fog = ball === 'FOG';
  return {
    from: fog ? 'CENTER' : ball,
    to: fog ? 'CENTER' : ball,
    p: 1,
    lift: 0,
    visible: !fog,
    fog: fog ? 1 : 0,
    shake: 0,
    spin: 0,
    bloch: qubits ? (reducedBloch(qubits, 'FOOTBALL') as Vec) : zero,
    partner: qubits ? (reducedBloch(qubits, 'PARTNER') as Vec) : zero,
    link: fog ? 1 : 0,
    landing: null,
    squash: 0,
  };
}
