import * as crypto from 'node:crypto';
// Le SDK est en CommonJS : on prend son export par défaut plutôt que des imports nommés.
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

/** Ce que Palabre utilise de l'API PlugNMeet : de quoi la remplacer dans les tests. */
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
 * Adresse de la réunion pour un jeton.
 *
 * lng : le client PlugNMeet détecte la langue via i18next-browser-languagedetector, qui priorise
 * le paramètre d'URL `lng` avant la langue du navigateur (fallback par défaut : anglais). Une
 * fois posé, le choix reste mémorisé dans le navigateur (localStorage).
 */
export function joinUrl(config: Config, token: string, locale: Locale): string {
  const lng = PLUGNMEET_LANGUAGES[locale];
  return `${config.plugnmeetHost}/?access_token=${encodeURIComponent(token)}&lng=${lng}`;
}

/** Une identité par connexion : plusieurs personnes peuvent partager un lien de modérateur sans se déconnecter mutuellement (PlugNMeet remplace toute session de même identité). */
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
