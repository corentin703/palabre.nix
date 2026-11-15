import { describe, expect, it } from 'vitest';
import { RateLimiter, WindowCounter } from './window-counter';

describe('WindowCounter', () => {
  it('compte dans la fenêtre puis repart de zéro', () => {
    let now = 0;
    const counter = new WindowCounter(1000, () => now);
    expect(counter.increment('ip')).toBe(1);
    expect(counter.increment('ip')).toBe(2);
    expect(counter.peek('ip')).toBe(2);
    now = 1001;
    expect(counter.peek('ip')).toBe(0);
    expect(counter.increment('ip')).toBe(1);
  });

  it('compte chaque clé séparément et sait remettre à zéro', () => {
    const counter = new WindowCounter(1000);
    counter.increment('a');
    expect(counter.peek('b')).toBe(0);
    counter.reset('a');
    expect(counter.peek('a')).toBe(0);
  });
});

describe('RateLimiter', () => {
  it('laisse passer `max` événements puis bloque jusqu’à la fin de la fenêtre', () => {
    let now = 0;
    const limiter = new RateLimiter(1000, 2, () => now);
    expect([limiter.hit('ip'), limiter.hit('ip'), limiter.hit('ip')]).toEqual([false, false, true]);
    now = 2000;
    expect(limiter.hit('ip')).toBe(false);
  });
});
