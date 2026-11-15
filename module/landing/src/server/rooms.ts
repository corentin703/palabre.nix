import * as crypto from 'node:crypto';
import { ROOM_ID_RE } from '../shared/slug.js';
import type { RoomKey } from '../shared/api.js';

// The right to moderate travels in a secret link, usable from any device and at any
// time:
//  - at creation, the browser gets a random key (`mod`, 128 bits);
//  - the room identifier is "name-tag", the tag (12 characters) being an HMAC of the key
//    with the server's secret: public, but impossible to forge or to invert without that
//    secret;
//  - whoever presents a key whose tag is the room's tag is a moderator (moderator link
//    `/r/<room>?m=<key>`), whatever the order of arrival and whether the room already
//    exists or not.
// No state is stored on the server: a link stays valid for months.

const TAG_LENGTH = 12;

export interface RoomKeys {
  /** Public tag of a moderator key. */
  tagOf(mod: string): string;
  newKey(): RoomKey;
}

export function createRoomKeys(secret: string): RoomKeys {
  const tagOf = (mod: string): string =>
    crypto.createHmac('sha256', secret).update(`owner-tag|${mod}`).digest('hex').slice(0, TAG_LENGTH);

  return {
    tagOf,
    newKey() {
      const mod = crypto.randomBytes(16).toString('hex');
      return { mod, tag: tagOf(mod) };
    },
  };
}

/** Readable name of a room identifier (without the tag). */
export function roomLabel(roomId: string): string {
  return ROOM_ID_RE.exec(roomId)?.[1] ?? roomId;
}
