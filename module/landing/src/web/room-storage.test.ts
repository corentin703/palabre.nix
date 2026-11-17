import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findRoomKey, loadEmails, rememberEmail, saveRoomKey } from './room-storage';

// Without localStorage (private browsing, or here the test environment), everything stays in memory.
describe('room keys without localStorage', () => {
  it('remembers the key for the lifetime of the page', () => {
    expect(findRoomKey('salon')).toBeNull();
    saveRoomKey('salon', { mod: 'a'.repeat(32), tag: 'b'.repeat(12) });
    expect(findRoomKey('salon')).toEqual({ mod: 'a'.repeat(32), tag: 'b'.repeat(12) });
  });
});

describe('email history', () => {
  // A minimal localStorage, which the test environment does not have.
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('keeps the newest address first, without duplicates (case aside)', () => {
    rememberEmail('a@example.org');
    rememberEmail('b@example.org');
    rememberEmail(' A@Example.org ');
    expect(loadEmails()).toEqual(['A@Example.org', 'b@example.org']);
  });

  it('keeps at most five addresses, and ignores an empty one', () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7]) rememberEmail(`u${n}@example.org`);
    rememberEmail('  ');
    expect(loadEmails()).toEqual(['u7', 'u6', 'u5', 'u4', 'u3'].map((u) => `${u}@example.org`));
  });

  it('survives a corrupted value', () => {
    store.set('visio:emails', '{not json');
    expect(loadEmails()).toEqual([]);
  });
});
