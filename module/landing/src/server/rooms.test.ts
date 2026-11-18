import { describe, expect, it } from 'vitest';
import { MOD_KEY_RE } from '../shared/slug';
import { createRoomKeys, roomLabel } from './rooms';

describe('createRoomKeys', () => {
  it('produces a 128-bit key and a 12-character tag', () => {
    const { mod, tag } = createRoomKeys('secret').newKey();
    expect(mod).toMatch(MOD_KEY_RE);
    expect(tag).toMatch(/^[0-9a-f]{12}$/);
  });

  it('derives the key from the tag, with the same secret only', () => {
    const { mod, tag } = createRoomKeys('secret').newKey();
    expect(createRoomKeys('secret').modOf(tag)).toBe(mod);
    expect(createRoomKeys('secret').matches(tag, mod)).toBe(true);
    expect(createRoomKeys('autre secret').matches(tag, mod)).toBe(false);
    expect(createRoomKeys('secret').matches(tag, '0'.repeat(32))).toBe(false);
    expect(createRoomKeys('secret').matches(undefined, mod)).toBe(false);
  });

  it('only accepts the key derived from the tag: a made-up key, whatever it is, is not one', () => {
    const keys = createRoomKeys('secret');
    const { tag } = keys.newKey();
    for (const guess of ['a'.repeat(32), tag.repeat(3).slice(0, 32)]) expect(keys.matches(tag, guess)).toBe(false);
  });

  it('draws different keys', () => {
    const keys = createRoomKeys('secret');
    expect(keys.newKey().mod).not.toBe(keys.newKey().mod);
  });
});

describe('roomLabel', () => {
  it('removes the tag, and leaves an identifier without a tag as is', () => {
    expect(roomLabel('reunion-bureau-d573b9b5fb90')).toBe('reunion-bureau');
    expect(roomLabel('reunion-bureau')).toBe('reunion-bureau');
  });
});
