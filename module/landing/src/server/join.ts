import { MOD_KEY_RE, ROOM_ID_RE, ROOM_NAME_MAX, slugifyRoomId } from '../shared/slug.js';
import type { JoinRequest, JoinResponse } from '../shared/api.js';
import type { Config } from './config.js';
import { HttpError } from './http.js';
import {
  CreateRoomReqSchema,
  IsRoomActiveReqSchema,
  createJoinUrl,
  createRequest,
  isNoRoomMessage,
} from './plugnmeet.js';
import type { PnmApi } from './plugnmeet.js';
import type { ClosedRooms } from './closed-rooms.js';
import type { RoomKeys } from './rooms.js';
import { guestName, welcomeMessage } from './messages.js';

export interface JoinDeps {
  pnm: PnmApi;
  config: Config;
  keys: RoomKeys;
  closed: ClosedRooms;
}

/** What the browser typed, before we know which room it is about. */
interface RoomTarget {
  roomId: string;
  title: string;
  isModerator: boolean;
}

/**
 * Two cases:
 *  - identifier "name-tag" (link, or the page's own form): we join that room; we are its
 *    moderator only if we present its key (moderator link, or the key the page was given);
 *  - bare name: we create OUR room, under a new tag.
 */
function resolveRoom(request: JoinRequest, keys: RoomKeys): RoomTarget {
  const typed = request.room.trim();
  const slug = slugifyRoomId(typed);
  if (!slug) {
    throw new HttpError(400, 'invalid_room');
  }

  const modKey = MOD_KEY_RE.test(request.mod) ? request.mod : '';
  const link = ROOM_ID_RE.exec(slug);
  if (link) {
    return {
      roomId: slug,
      title: request.title?.trim() || link[1] || slug,
      isModerator: keys.matches(link[2], modKey),
    };
  }
  // A bare name (no tag): we draw one.
  const tag = keys.newKey().tag;
  return { roomId: `${slugifyRoomId(typed, ROOM_NAME_MAX)}-${tag}`, title: typed, isModerator: true };
}

/** Creates the room if it is not open, then returns the meeting address. */
export async function joinRoom(request: JoinRequest, { pnm, config, keys, closed }: JoinDeps): Promise<JoinResponse> {
  const displayName = request.name.trim().slice(0, 64) || guestName(request.locale);
  const { roomId, title, isModerator } = resolveRoom(request, keys);
  // A closed room takes no new guest (not even to recreate it once it has ended); its
  // moderators still get in.
  if (!isModerator && closed.has(roomId)) throw new HttpError(403, 'room_closed');

  try {
    const active = await pnm.isRoomActive(createRequest(IsRoomActiveReqSchema, { roomId }));
    if (!active.status) throw new Error(active.msg || 'isRoomActive failed');

    if (!active.isActive) {
      // Every room uses resources (a LiveKit room): past the limit, no new one is started.
      // Whoever joins one that is already open is not affected. Checked just before creating,
      // not atomically: a burst can overshoot by a few rooms.
      const open = await pnm.getActiveRoomsInfo();
      if (!open.status && !isNoRoomMessage(open.msg)) throw new Error(open.msg || 'getActiveRoomsInfo failed');
      if (open.status && open.rooms.length >= config.maxRooms) throw new HttpError(503, 'too_many_rooms');
      const created = await pnm.createRoom(
        createRequest(CreateRoomReqSchema, {
          roomId,
          metadata: {
            roomTitle: title.slice(0, 128),
            // Where the PlugNMeet client sends the person when they leave the meeting: back to
            // this home page.
            logoutUrl: `${config.plugnmeetHost}/`,
            welcomeMessage: welcomeMessage(request.locale, escapeHtml(title)),
            roomFeatures: {
              allowWebcams: true,
              muteOnStart: false,
              allowScreenShare: true,
              adminOnlyWebcams: false,
              allowViewOtherWebcams: true,
              allowViewOtherUsersList: true,
              allowVirtualBg: true,
              allowRaiseHand: true,
              allowReactions: true,
              roomDuration: '0',
              recordingFeatures: {
                isAllow: true,
                isAllowCloud: false,
                isAllowLocal: true,
                enableAutoCloudRecording: false,
              },
              chatFeatures: { isAllow: true, isAllowFileUpload: true, maxFileSize: '50' },
              sharedNotePadFeatures: { isAllow: true },
              whiteboardFeatures: { isAllow: true },
            },
          },
        }),
      );
      if (!created.status) throw new Error(created.msg || 'createRoom failed');
    }

    // Moderator = owner of the room, never "the first to arrive".
    const url = await createJoinUrl(pnm, config, roomId, { name: displayName, isAdmin: isModerator }, request.locale);
    return { url };
  } catch (err) {
    if (err instanceof HttpError) throw err;
    console.error('join failed:', err);
    throw new HttpError(502, 'join_failed');
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
