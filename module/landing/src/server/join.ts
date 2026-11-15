import { MOD_KEY_RE, ROOM_ID_RE, ROOM_NAME_MAX, slugifyRoomId } from '../shared/slug.js';
import type { JoinRequest, JoinResponse } from '../shared/api.js';
import type { Config } from './config.js';
import { HttpError } from './http.js';
import { CreateRoomReqSchema, IsRoomActiveReqSchema, createJoinUrl, createRequest } from './plugnmeet.js';
import type { PnmApi } from './plugnmeet.js';
import type { RoomKeys } from './rooms.js';
import { guestName, welcomeMessage } from './messages.js';

export interface JoinDeps {
  pnm: PnmApi;
  config: Config;
  keys: RoomKeys;
}

/** Ce que le navigateur a saisi, avant de savoir de quel salon il s'agit. */
interface RoomTarget {
  roomId: string;
  title: string;
  isModerator: boolean;
}

/**
 * Deux cas :
 *  - lien (identifiant « nom-empreinte ») : on rejoint ce salon ; on en est le modérateur
 *    seulement si on présente une clé dont l'empreinte correspond (lien de modérateur) ;
 *  - intitulé saisi sur la page d'accueil : on crée SON salon avec la clé fournie par le
 *    navigateur ; l'identifiant en porte l'empreinte.
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
    return { roomId: slug, title: link[1] ?? slug, isModerator: modKey !== '' && keys.tagOf(modKey) === link[2] };
  }
  const key = modKey || keys.newKey().mod;
  return {
    roomId: `${slugifyRoomId(typed, ROOM_NAME_MAX)}-${keys.tagOf(key)}`,
    title: typed,
    isModerator: true,
  };
}

/** Crée le salon s'il n'est pas ouvert, puis retourne l'adresse de la réunion. */
export async function joinRoom(request: JoinRequest, { pnm, config, keys }: JoinDeps): Promise<JoinResponse> {
  const displayName = request.name.trim().slice(0, 64) || guestName(request.locale);
  const { roomId, title, isModerator } = resolveRoom(request, keys);

  try {
    const active = await pnm.isRoomActive(createRequest(IsRoomActiveReqSchema, { roomId }));
    if (!active.status) throw new Error(active.msg || 'isRoomActive failed');

    if (!active.isActive) {
      const created = await pnm.createRoom(
        createRequest(CreateRoomReqSchema, {
          roomId,
          metadata: {
            roomTitle: title.slice(0, 128),
            // Où le client PlugNMeet renvoie la personne quand elle quitte la réunion : retour
            // à cette page d'accueil.
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

    // Modérateur = propriétaire du salon, jamais « le premier arrivé ».
    const url = await createJoinUrl(pnm, config, roomId, { name: displayName, isAdmin: isModerator }, request.locale);
    return { url };
  } catch (err) {
    console.error('join failed:', err);
    throw new HttpError(502, 'join_failed');
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
