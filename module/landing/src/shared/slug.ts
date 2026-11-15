/**
 * Identifiant de salon : les identifiants PlugNMeet restent dans un jeu de caractères restreint
 * (contrainte NATS, voir config.yaml du serveur). Même code côté serveur et dans le navigateur.
 */
export function slugifyRoomId(input: string, max = 64): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/, '');
}

/** « nom-empreinte » : l'empreinte (12 caractères hexadécimaux) est ajoutée par le serveur. */
export const ROOM_ID_RE = /^(.+)-([0-9a-f]{12})$/;

/** Clé de modérateur : 128 bits en hexadécimal. */
export const MOD_KEY_RE = /^[0-9a-f]{32}$/;

/** Longueur maximale du nom d'un salon : 50 + « - » + 12 = 63 caractères (limite : 64). */
export const ROOM_NAME_MAX = 50;
