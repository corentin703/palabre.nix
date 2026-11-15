import { describe, expect, it } from 'vitest';
import { findRoomKey, saveRoomKey } from './room-storage';

// Without localStorage (private browsing, or here the test environment), everything stays in memory.
describe('room keys without localStorage', () => {
  it('remembers the key for the lifetime of the page', () => {
    expect(findRoomKey('salon')).toBeNull();
    saveRoomKey('salon', { mod: 'a'.repeat(32), tag: 'b'.repeat(12) });
    expect(findRoomKey('salon')).toEqual({ mod: 'a'.repeat(32), tag: 'b'.repeat(12) });
  });
});
