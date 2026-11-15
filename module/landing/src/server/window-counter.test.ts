import { describe, expect, it } from 'vitest';
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

describe('RateLimiter', () => {
  it('lets `max` events through then blocks until the end of the window', () => {
    let now = 0;
    const limiter = new RateLimiter(1000, 2, () => now);
    expect([limiter.hit('ip'), limiter.hit('ip'), limiter.hit('ip')]).toEqual([false, false, true]);
    now = 2000;
    expect(limiter.hit('ip')).toBe(false);
  });
});
