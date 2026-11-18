import { afterEach, describe, expect, it, vi } from 'vitest';
import { RateLimiter, WindowCounter } from './window-counter';

describe('WindowCounter', () => {
  it('counts within the window then starts again from zero', () => {
    let now = 0;
    const counter = new WindowCounter(1000, () => now);
    expect(counter.increment('ip')).toBe(1);
    expect(counter.increment('ip')).toBe(2);
    expect(counter.peek('ip')).toBe(2);
    now = 1001;
    expect(counter.peek('ip')).toBe(0);
    expect(counter.increment('ip')).toBe(1);
  });

  it('counts each key separately and can reset', () => {
    const counter = new WindowCounter(1000);
    counter.increment('a');
    expect(counter.peek('b')).toBe(0);
    counter.reset('a');
    expect(counter.peek('a')).toBe(0);
  });
});

describe('WindowCounter memory', () => {
  afterEach(() => vi.useRealTimers());

  it('does not keep a key once its window is over, even with no further traffic', () => {
    vi.useFakeTimers();
    const counter = new WindowCounter(5 * 60 * 1000);
    counter.increment('1.2.3.4');
    counter.increment('5.6.7.8');
    expect(counter.size).toBe(2);
    vi.advanceTimersByTime(4 * 60 * 1000);
    expect(counter.size).toBe(2);
    vi.advanceTimersByTime(2 * 60 * 1000);
    expect(counter.size).toBe(0);
  });
});

describe('RateLimiter', () => {
  it('lets `max` events through then blocks until the end of the window', () => {
    let now = 0;
    const limiter = new RateLimiter(1000, 2, () => now);
    expect([limiter.hit('ip'), limiter.hit('ip'), limiter.hit('ip')]).toEqual([false, false, true]);
    now = 2000;
    expect(limiter.hit('ip')).toBe(false);
  });
});
