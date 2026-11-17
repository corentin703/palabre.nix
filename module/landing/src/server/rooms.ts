import * as crypto from 'node:crypto';
import { MOD_KEY_RE, ROOM_ID_RE } from '../shared/slug.js';
import type { RoomKey } from '../shared/api.js';

// The right to moderate travels in a secret link, usable from any device and at any
// time:
//  - at creation, the server draws a random tag (12 characters, public) and the browser gets
//    the matching key (`mod`, 128 bits): an HMAC of the tag with the server's secret;
//  - the room identifier is "name-tag";
//  - whoever presents the key of the room's tag is a moderator (moderator link
//    `/r/<room>?m=<key>`), whatever the order of arrival and whether the room already
//    exists or not. Nobody can forge a key without the secret, but the server (so the
//    /admin panel) can always compute it again from the identifier.
// No state is stored on the server: a link stays valid for months.

const TAG_LENGTH = 12;

export interface RoomKeys {
  /** Public tag of a key issued before moderator keys were derived from the tag (still accepted). */
  tagOf(mod: string): string;
  /** Moderator key of the room whose tag is given: only the server can compute it. */
  modOf(tag: string): string;
  /** Does this key make its holder a moderator of the room with this tag? */
  matches(tag: string | undefined, mod: string): boolean;
  newKey(): RoomKey;
}

export function createRoomKeys(secret: string): RoomKeys {
  const hmac = (label: string, value: string): string =>
    crypto.createHmac('sha256', secret).update(`${label}|${value}`).digest('hex');
  const tagOf = (mod: string): string => hmac('owner-tag', mod).slice(0, TAG_LENGTH);
  const modOf = (tag: string): string => hmac('mod-key', tag).slice(0, 32);
  const same = (a: string, b: string): boolean =>
    a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

  return {
    tagOf,
    modOf,
    matches: (tag, mod) => tag !== undefined && MOD_KEY_RE.test(mod) && (same(modOf(tag), mod) || tagOf(mod) === tag),
    newKey() {
      const tag = crypto.randomBytes(TAG_LENGTH / 2).toString('hex');
      return { mod: modOf(tag), tag };
    },
  };
}

/** Readable name of a room identifier (without the tag). */
export function roomLabel(roomId: string): string {
  return ROOM_ID_RE.exec(roomId)?.[1] ?? roomId;
}
