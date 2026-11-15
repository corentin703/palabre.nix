import { describe, expect, it } from 'vitest';
import { ROOM_ID_RE, slugifyRoomId } from './slug';

describe('slugifyRoomId', () => {
  it('lowercases, strips accents and replaces the rest with hyphens', () => {
    expect(slugifyRoomId('Réunion Bureau')).toBe('reunion-bureau');
    expect(slugifyRoomId("L'été à Paris !")).toBe('l-ete-a-paris');
  });

  it('leaves no hyphen at the start or at the end', () => {
    expect(slugifyRoomId('--salon--')).toBe('salon');
    expect(slugifyRoomId('!!!')).toBe('');
  });

  it('truncates without ending on a hyphen', () => {
    expect(slugifyRoomId('abc-def', 4)).toBe('abc');
    expect(slugifyRoomId('a'.repeat(100))).toHaveLength(64);
  });

  it('is stable: an already normalized identifier does not change', () => {
    expect(slugifyRoomId('reunion-bureau-d573b9b5fb90')).toBe('reunion-bureau-d573b9b5fb90');
  });
});

describe('ROOM_ID_RE', () => {
  it('splits the name from the tag', () => {
    expect(ROOM_ID_RE.exec('reunion-bureau-d573b9b5fb90')?.slice(1)).toEqual(['reunion-bureau', 'd573b9b5fb90']);
    expect(ROOM_ID_RE.exec('reunion-bureau')).toBeNull();
  });
});
