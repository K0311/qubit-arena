/** Token bucket: `capacity` messages at once, refilled at `perSecond`. */
export class Bucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly capacity: number,
    private readonly perSecond: number,
    now: number,
  ) {
    this.tokens = capacity;
    this.last = now;
  }

  take(now: number): boolean {
    this.tokens = Math.min(
      this.capacity,
      this.tokens + ((now - this.last) / 1000) * this.perSecond,
    );
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

/**
 * Limits are not in rules.md; they only stop floods (architecture.md §6). Normal play sends a
 * message every few seconds, so these never touch a real player.
 */
export const LIMITS = {
  /** Every client message except PING. */
  messages: { capacity: 20, perSecond: 10 },
  chat: { capacity: 5, perSecond: 1 },
} as const;

export type Limits = {
  readonly [K in keyof typeof LIMITS]: { capacity: number; perSecond: number };
};
export type Limiter = { messages: Bucket; chat: Bucket };

export const newLimiter = (now: number, limits: Limits = LIMITS): Limiter => ({
  messages: new Bucket(limits.messages.capacity, limits.messages.perSecond, now),
  chat: new Bucket(limits.chat.capacity, limits.chat.perSecond, now),
});
