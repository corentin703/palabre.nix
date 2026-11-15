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

/**
 * One identity per connection: several people can share a moderator link without
 * disconnecting each other (PlugNMeet replaces any session with the same identity).
 */
export async function createJoinUrl(
  pnm: PnmApi,
  config: Config,
  roomId: string,
  user: { name: string; isAdmin: boolean },
  locale: Locale,
): Promise<string> {
  const request = createRequest(GenerateTokenReqSchema, {
    roomId,
    userInfo: { name: user.name, userId: crypto.randomUUID(), isAdmin: user.isAdmin, isHidden: false },
  });
  const response = await pnm.getJoinToken(request);
  if (!response.status || !response.token) throw new Error(response.msg || 'getJoinToken failed');
  return joinUrl(config, response.token, locale);
}
