/** Counter per key (an IP) over a fixed time window. */
export class WindowCounter {
  private readonly entries = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Counts an event and returns the total of the current window (1 for the first). */
  increment(key: string): number {
    const now = this.now();
    const entry = this.entries.get(key);
    if (!entry || now > entry.resetAt) {
      this.entries.set(key, { count: 1, resetAt: now + this.windowMs });
      return 1;
    }
    entry.count += 1;
    return entry.count;
  }

  /** Total of the current window, without counting anything. */
  peek(key: string): number {
    const entry = this.entries.get(key);
    return !entry || this.now() > entry.resetAt ? 0 : entry.count;
  }

  reset(key: string): void {
    this.entries.delete(key);
  }
}

/**
 * At most `max` events per key and per window. Minimal anti-abuse: a PlugNMeet room uses
 * real resources (a LiveKit room). This is not a protection against a distributed
 * attacker, just a brake on trivial spam.
 */
export class RateLimiter {
  private readonly counter: WindowCounter;

  constructor(
    windowMs: number,
    private readonly max: number,
    now?: () => number,
  ) {
    this.counter = new WindowCounter(windowMs, now);
  }

  /** Counts an event; true if it goes over the limit. */
  hit(key: string): boolean {
    return this.counter.increment(key) > this.max;
  }
}
