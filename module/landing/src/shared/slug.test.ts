import { describe, expect, it } from 'vitest';
import { ROOM_ID_RE, slugifyRoomId } from './slug';

describe('slugifyRoomId', () => {
  it('met en minuscules, retire les accents et remplace le reste par des tirets', () => {
    expect(slugifyRoomId('Réunion Bureau')).toBe('reunion-bureau');
    expect(slugifyRoomId("L'été à Paris !")).toBe('l-ete-a-paris');
  });

  it('ne laisse ni tiret en début ni en fin', () => {
    expect(slugifyRoomId('--salon--')).toBe('salon');
    expect(slugifyRoomId('!!!')).toBe('');
  });

  it('tronque sans finir sur un tiret', () => {
    expect(slugifyRoomId('abc-def', 4)).toBe('abc');
    expect(slugifyRoomId('a'.repeat(100))).toHaveLength(64);
  });

  it('est stable : un identifiant déjà normalisé ne change pas', () => {
    expect(slugifyRoomId('reunion-bureau-d573b9b5fb90')).toBe('reunion-bureau-d573b9b5fb90');
  });
});

describe('ROOM_ID_RE', () => {
  it('sépare le nom de l’empreinte', () => {
    expect(ROOM_ID_RE.exec('reunion-bureau-d573b9b5fb90')?.slice(1)).toEqual(['reunion-bureau', 'd573b9b5fb90']);
    expect(ROOM_ID_RE.exec('reunion-bureau')).toBeNull();
  });
});
