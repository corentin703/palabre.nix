import { describe, expect, it } from 'vitest';
import { findRoomKey, saveRoomKey } from './room-storage';

// Sans localStorage (navigation privée, ou ici l'environnement de test), tout reste en mémoire.
describe('clés de salon sans localStorage', () => {
  it('retient la clé pour la durée de la page', () => {
    expect(findRoomKey('salon')).toBeNull();
    saveRoomKey('salon', { mod: 'a'.repeat(32), tag: 'b'.repeat(12) });
    expect(findRoomKey('salon')).toEqual({ mod: 'a'.repeat(32), tag: 'b'.repeat(12) });
  });
});
