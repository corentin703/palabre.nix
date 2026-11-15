/**
 * Room identifier: PlugNMeet identifiers stay within a restricted character set
 * (NATS constraint, see the server's config.yaml). Same code on the server and in the browser.
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

/** "name-tag": the tag (12 hexadecimal characters) is added by the server. */
export const ROOM_ID_RE = /^(.+)-([0-9a-f]{12})$/;

/** Moderator key: 128 bits in hexadecimal. */
export const MOD_KEY_RE = /^[0-9a-f]{32}$/;

/** Maximum length of a room name: 50 + "-" + 12 = 63 characters (limit: 64). */
export const ROOM_NAME_MAX = 50;
