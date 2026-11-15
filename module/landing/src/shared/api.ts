/** Contrat JSON entre l'application web (navigateur) et le serveur. */

import type { Locale } from './locales.js';

/**
 * Les erreurs du serveur sont des codes : c'est le navigateur qui les traduit
 * (web/i18n, `errors`), dans la langue de la personne.
 */
export type ErrorCode =
  | 'invalid_request'
  | 'rate_limited'
  | 'invalid_room'
  | 'join_failed'
  | 'bad_token'
  | 'too_many_attempts'
  | 'unauthorized'
  | 'plugnmeet_failed'
  | 'not_found';

export interface ApiError {
  code: ErrorCode;
  /** Message technique de PlugNMeet (`plugnmeet_failed`), tel quel. */
  detail?: string;
}

/** Personnalisation de la page (services.palabre.landing.*). */
export interface RuntimeConfig {
  /** Langue quand rien ne dit celle de la personne (services.palabre.landing.defaultLocale). */
  defaultLocale: Locale;
  brandName: string;
  themeColor: string;
  hasLogo: boolean;
  hasCustomCss: boolean;
}

/** Clé de modérateur d'un nouveau salon et empreinte publique qui l'identifie. */
export interface RoomKey {
  mod: string;
  tag: string;
}

export interface RoomInfo {
  /** Identifiant du salon, tel que le serveur l'a normalisé. */
  room: string;
  /** Nom lisible, sans l'empreinte. */
  label: string;
  /** La clé fournie est bien celle de ce salon. */
  moderator: boolean;
}

export interface JoinRequest {
  /** Intitulé saisi, ou identifiant d'un salon existant. */
  room: string;
  name: string;
  /** Clé de modérateur ; vide pour un simple participant. */
  mod: string;
  /** Langue de la personne : message de bienvenue du salon et langue de la réunion. */
  locale: Locale;
}

export interface JoinResponse {
  /** Adresse de la réunion PlugNMeet, jeton compris. */
  url: string;
}

export interface ActiveRoom {
  roomId: string;
  title: string;
  participants: string[];
  created: string;
}

export interface PastRoom {
  roomId: string;
  title: string;
  participants: number;
  created: string;
  ended: string;
}

export interface RoomsListing {
  active: ActiveRoom[];
  past: PastRoom[];
}
