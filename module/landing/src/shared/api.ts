/** JSON contract between the web application (browser) and the server. */

import type { Locale } from './locales.js';

/**
 * Server errors are codes: it is the browser that translates them
 * (web/i18n, `errors`), in the visitor's language.
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
  /** Technical message from PlugNMeet (`plugnmeet_failed`), as is. */
  detail?: string;
}

/** Page customization (services.palabre.landing.*). */
export interface RuntimeConfig {
  /** Language when nothing says which one the visitor wants (services.palabre.landing.defaultLocale). */
  defaultLocale: Locale;
  brandName: string;
  themeColor: string;
  hasLogo: boolean;
  hasCustomCss: boolean;
  /** The installable app is enabled (services.palabre.landing.pwa.enable). */
  pwa: boolean;
}

/** Moderator key of a new room, and the public tag that identifies it. */
export interface RoomKey {
  mod: string;
  tag: string;
}

export interface RoomInfo {
  /** Room identifier, as normalized by the server. */
  room: string;
  /** Readable name, without the tag. */
  label: string;
  /** The given key is the key of this room. */
  moderator: boolean;
}

export interface JoinRequest {
  /** Name typed by the visitor, or identifier of an existing room. */
  room: string;
  name: string;
  /** Moderator key; empty for a regular participant. */
  mod: string;
  /** Visitor's language: the room's welcome message and the language of the meeting. */
  locale: Locale;
}

export interface JoinResponse {
  /** Address of the PlugNMeet meeting, token included. */
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

/** Links generated from the administration panel: identifier and moderator key of a new room. */
export interface GeneratedLinks {
  roomId: string;
  mod: string;
}
