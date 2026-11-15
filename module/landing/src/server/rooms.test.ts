import { describe, expect, it } from 'vitest';
import { MOD_KEY_RE } from '../shared/slug';
import { createRoomKeys, roomLabel } from './rooms';

describe('createRoomKeys', () => {
  it('produit une clé de 128 bits et une empreinte de 12 caractères', () => {
    const { mod, tag } = createRoomKeys('secret').newKey();
    expect(mod).toMatch(MOD_KEY_RE);
    expect(tag).toMatch(/^[0-9a-f]{12}$/);
  });

  it('retrouve l’empreinte d’une clé, avec le même secret seulement', () => {
    const { mod, tag } = createRoomKeys('secret').newKey();
    expect(createRoomKeys('secret').tagOf(mod)).toBe(tag);
    expect(createRoomKeys('autre secret').tagOf(mod)).not.toBe(tag);
  });

  it('tire des clés différentes', () => {
    const keys = createRoomKeys('secret');
    expect(keys.newKey().mod).not.toBe(keys.newKey().mod);
  });
});

describe('roomLabel', () => {
  it('retire l’empreinte, et laisse un identifiant sans empreinte tel quel', () => {
    expect(roomLabel('reunion-bureau-d573b9b5fb90')).toBe('reunion-bureau');
    expect(roomLabel('reunion-bureau')).toBe('reunion-bureau');
  });
});
