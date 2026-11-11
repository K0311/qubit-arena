/**
 * Every server timer goes through a Scheduler so tests can drive time by hand instead of
 * waiting for real clocks (turn timer, game clock, bot delay, heartbeat).
 */
export type TimerHandle = { readonly id: number };

export interface Scheduler {
  now(): number;
  set(fn: () => void, ms: number): TimerHandle;
  clear(handle: TimerHandle | undefined): void;
}

export function realScheduler(): Scheduler {
  const timers = new Map<number, NodeJS.Timeout>();
  let next = 1;
  return {
    now: () => Date.now(),
    set(fn, ms) {
      const id = next++;
      const t = setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      // Never keep the process alive just for a game timer.
      t.unref();
      timers.set(id, t);
      return { id };
    },
    clear(handle) {
      if (!handle) return;
      clearTimeout(timers.get(handle.id));
      timers.delete(handle.id);
    },
  };
}

/** Test scheduler: time only moves when advance() is called. */
export class ManualScheduler implements Scheduler {
  private time = 0;
  private next = 1;
  private readonly timers = new Map<number, { at: number; fn: () => void }>();

  now(): number {
    return this.time;
  }

  set(fn: () => void, ms: number): TimerHandle {
    const id = this.next++;
    this.timers.set(id, { at: this.time + Math.max(0, ms), fn });
    return { id };
  }

  clear(handle: TimerHandle | undefined): void {
    if (handle) this.timers.delete(handle.id);
  }

  /** Move the clock forward, firing due timers in time order (including ones they set). */
  advance(ms: number): void {
    const end = this.time + ms;
    for (;;) {
      let dueId: number | undefined;
      let dueAt = Infinity;
      for (const [id, t] of this.timers) {
        if (t.at <= end && t.at < dueAt) {
          dueAt = t.at;
          dueId = id;
        }
      }
      if (dueId === undefined) break;
      const timer = this.timers.get(dueId);
      this.timers.delete(dueId);
      this.time = dueAt;
      timer?.fn();
    }
    this.time = end;
  }

  get pending(): number {
    return this.timers.size;
  }
}
