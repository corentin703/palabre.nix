import * as crypto from 'node:crypto';
// The SDK is CommonJS: we take its default export rather than named imports.
import sdk from 'plugnmeet-sdk-js';
import { PLUGNMEET_LANGUAGES } from '../shared/locales.js';
import type { Locale } from '../shared/locales.js';
import type { Config } from './config.js';

export const {
  PlugNmeet,
  createRequest,
  CreateRoomReqSchema,
  FetchPastRoomsReqSchema,
  GenerateTokenReqSchema,
  IsRoomActiveReqSchema,
  RoomEndReqSchema,
} = sdk;

/** What palabre.nix uses of the PlugNMeet API: something to replace it with in tests. */
export type PnmApi = Pick<
  InstanceType<typeof PlugNmeet>,
  | 'isRoomActive'
  | 'createRoom'
  | 'getJoinToken'
  | 'getActiveRoomsInfo'
  | 'fetchPastRoomsInfo'
  | 'endRoom'
>;

export function createPnm(config: Config): PnmApi {
  return new PlugNmeet(config.plugnmeetApiUrl, config.plugnmeetApiKey, config.plugnmeetSecret);
}

/**
 * Address of the meeting for a token.
 *
 * lng: the PlugNMeet client detects the language through i18next-browser-languagedetector,
 * which gives the `lng` URL parameter priority over the browser language (default fallback:
 * English). Once set, the choice is remembered in the browser (localStorage).
 */
export function joinUrl(config: Config, token: string, locale: Locale): string {
  const lng = PLUGNMEET_LANGUAGES[locale];
  return `${config.plugnmeetHost}/?access_token=${encodeURIComponent(token)}&lng=${lng}`;
}

/** The identifier PlugNMeet hides everywhere (see its `config.RecorderBot`). */
export const OBSERVER_USER_ID = 'RECORDER_BOT';

/**
 * One identity per connection: several people can share a moderator link without
 * disconnecting each other (PlugNMeet replaces any session with the same identity).
 */
export async function createJoinUrl(
  pnm: PnmApi,
  config: Config,
  roomId: string,
  user: { name: string; isAdmin: boolean; observer?: boolean },
  locale: Locale,
): Promise<string> {
  const request = createRequest(GenerateTokenReqSchema, {
    roomId,
    userInfo: {
      name: user.name,
      // PlugNMeet leaves its internal users (recorder bot) out of the participants' lists, by their
      // identifier: that is what makes an observer invisible (the `isHidden` flag alone does not).
      userId: user.observer ? OBSERVER_USER_ID : crypto.randomUUID(),
      isAdmin: user.isAdmin,
      isHidden: user.observer === true,
      // An observer is invisible to the others (isHidden) and, as a precaution, cannot do
      // anything by mistake: no microphone, camera, screen sharing, chat message or file.
      ...(user.observer
        ? {
            userMetadata: {
              isAdmin: false,
              isPresenter: false,
              waitForApproval: false,
              lockSettings: {
                lockMicrophone: true,
                lockWebcam: true,
                lockScreenSharing: true,
                lockChatSendMessage: true,
                lockChatFileShare: true,
                lockPrivateChat: true,
                lockWhiteboard: true,
                lockSharedNotepad: true,
                lockReactions: true,
              },
            },
          }
        : {}),
    },
  });
  const response = await pnm.getJoinToken(request);
  if (!response.status || !response.token) throw new Error(response.msg || 'getJoinToken failed');
  return joinUrl(config, response.token, locale);
}
