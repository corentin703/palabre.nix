import * as crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ActiveRoom, PastRoom, RoomsListing } from '../shared/api.js';
import type { Config } from './config.js';
import { getClientIp, readJson, sendError, sendJson } from './http.js';
import { isLocale } from '../shared/locales.js';
import type { Locale } from '../shared/locales.js';
import { adminName } from './messages.js';
import { FetchPastRoomsReqSchema, RoomEndReqSchema, createJoinUrl, createRequest } from './plugnmeet.js';
import type { PnmApi } from './plugnmeet.js';
import { WindowCounter } from './window-counter.js';
import type { RoomKeys } from './rooms.js';
import { ROOM_ID_RE as TAGGED_ROOM_ID_RE, ROOM_NAME_MAX, slugifyRoomId } from '../shared/slug.js';

// Administration panel (/admin): list of PlugNMeet rooms and manual closing.
// Authentication by a single token (from a secret file) exchanged for a signed session cookie.

const SESSION_MAX_AGE_S = 8 * 60 * 60;
const COOKIE_NAME = 'admin_session';

/** Brute-force protection on the token: few failed attempts per IP and per window. */
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;

const ROOM_ID_RE = /^[a-z0-9-]{1,64}$/;

const sha256 = (value: string): Buffer => crypto.createHash('sha256').update(value).digest();

function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) cookies[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return cookies;
}

/** Requests that change something only accept JSON, from this same host (see isSafeMutation). */
function isSafeMutation(req: IncomingMessage): boolean {
  if (!(req.headers['content-type'] ?? '').startsWith('application/json')) return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

export interface AdminDeps {
  pnm: PnmApi;
  config: Config;
  adminToken: string;
  keys: RoomKeys;
}

/** Returns a handler answering the /admin/login, /admin/logout and /admin/api/* routes. */
export function createAdminHandler({ pnm, config, adminToken, keys }: AdminDeps) {
  const tokenDigest = sha256(adminToken);
  const failures = new WindowCounter(LOGIN_WINDOW_MS);

  // The cookie is not signed with the token itself: a key derived from it, so that a cookie
  // (which the browser keeps) is no material to guess the token offline.
  const sessionKey = crypto.createHmac('sha256', adminToken).update('admin-session-key').digest();
  const sign = (exp: string | number): string =>
    crypto.createHmac('sha256', sessionKey).update(`admin-session|${exp}`).digest('hex');

  function isAuthenticated(req: IncomingMessage): boolean {
    const [exp, signature] = (parseCookies(req.headers.cookie)[COOKIE_NAME] ?? '').split('.');
    if (!exp || !signature || !/^[0-9]+$/.test(exp)) return false;
    if (Number(exp) < Math.floor(Date.now() / 1000)) return false;
    const given = Buffer.from(signature);
    const expected = Buffer.from(sign(exp));
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  }

  const cookieAttributes = 'Path=/admin; HttpOnly; Secure; SameSite=Strict';
  const sessionCookie = (): string => {
    const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_S;
    return `${COOKIE_NAME}=${exp}.${sign(exp)}; Max-Age=${SESSION_MAX_AGE_S}; ${cookieAttributes}`;
  };
  const clearedCookie = `${COOKIE_NAME}=; Max-Age=0; ${cookieAttributes}`;

  /** `roomId` (and the visitor's language) from the JSON body, or null if absent or malformed. */
  async function readRoomRequest(req: IncomingMessage): Promise<{ roomId: string; locale: Locale } | null> {
    const body = (await readJson(req, 2000)) as { roomId?: unknown; locale?: unknown } | null;
    if (typeof body?.roomId !== 'string' || !ROOM_ID_RE.test(body.roomId)) return null;
    return { roomId: body.roomId, locale: isLocale(body.locale) ? body.locale : config.defaultLocale };
  }

  /** Moderator key of a room, to build its link: computed again from the identifier's tag. */
  const modOf = (roomId: string): string => {
    const tag = TAGGED_ROOM_ID_RE.exec(roomId)?.[2];
    return tag ? keys.modOf(tag) : '';
  };

  async function listRooms(): Promise<RoomsListing> {
    // The history is secondary: if it fails, the open rooms are still shown
    // rather than blocking the whole page.
    const [activeRes, pastRes] = await Promise.all([
      pnm.getActiveRoomsInfo(),
      pnm
        .fetchPastRoomsInfo(
          createRequest(FetchPastRoomsReqSchema, { roomIds: [], from: 0, limit: 30, orderBy: 'DESC' }),
        )
        .catch((err: Error) => {
          console.warn('fetchPastRoomsInfo failed:', err.message);
          return undefined;
        }),
    ]);
    // PlugNMeet answers status=false + "no active room found" when there is simply no
    // room: that is not an outage.
    const isEmpty = (res: { msg: string }): boolean => /no .*(room|record).*found/i.test(res.msg);
    if (!activeRes.status && !isEmpty(activeRes)) {
      throw new Error(activeRes.msg || 'getActiveRoomsInfo failed');
    }

    const active: (ActiveRoom & { sid: string })[] = (activeRes.status ? activeRes.rooms : []).map((r) => ({
      roomId: r.roomInfo?.roomId ?? '',
      mod: modOf(r.roomInfo?.roomId ?? ''),
      title: r.roomInfo?.roomTitle ?? '',
      participants: r.participantsInfo.map((p) => p.name || '?'),
      created: String(r.roomInfo?.creationTime ?? ''),
      sid: r.roomInfo?.sid ?? '',
    }));
    const activeSids = new Set(active.map((r) => r.sid));
    const pastRooms = pastRes?.status ? (pastRes.result?.roomsList ?? []) : [];
    const past: PastRoom[] = pastRooms
      .filter((r) => !activeSids.has(r.roomSid))
      .map((r) => ({
        roomId: r.roomId,
        mod: modOf(r.roomId),
        title: r.roomTitle,
        participants: Number(r.joinedParticipants) || 0,
        created: String(r.created),
        ended: String(r.ended),
      }));
    return { active: active.map(({ sid: _sid, ...room }) => room), past };
  }

  /** Returns true if the request was handled. */
  return async function handleAdmin(
    req: IncomingMessage,
    res: ServerResponse,
    pathname: string,
  ): Promise<boolean> {
    const ip = getClientIp(req);
    const isPost = req.method === 'POST';

    if (isPost && pathname === '/admin/login') {
      if (!isSafeMutation(req)) return sendError(res, 400, 'invalid_request');
      if (failures.peek(ip) >= LOGIN_MAX_FAILURES) {
        return sendError(res, 429, 'too_many_attempts');
      }
      const body = (await readJson(req, 2000)) as { token?: unknown } | null;
      const given = typeof body?.token === 'string' ? body.token : '';
      if (!given || !crypto.timingSafeEqual(sha256(given), tokenDigest)) {
        failures.increment(ip);
        console.warn(`admin login failed from ${ip}`);
        return sendError(res, 401, 'bad_token');
      }
      failures.reset(ip);
      console.log(`admin login ok from ${ip}`);
      sendJson(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie() });
      return true;
    }

    if (isPost && pathname === '/admin/logout') {
      sendJson(res, 200, { ok: true }, { 'Set-Cookie': clearedCookie });
      return true;
    }

    if (!pathname.startsWith('/admin/api/')) return false;

    // Everything else requires a valid session.
    if (!isAuthenticated(req)) return sendError(res, 401, 'unauthorized');

    try {
      if (req.method === 'GET' && pathname === '/admin/api/rooms') {
        sendJson(res, 200, await listRooms());
        return true;
      }

      if (
        isPost &&
        (pathname === '/admin/api/rooms/join' ||
          pathname === '/admin/api/rooms/observe' ||
          pathname === '/admin/api/rooms/end')
      ) {
        if (!isSafeMutation(req)) return sendError(res, 400, 'invalid_request');
        const request = await readRoomRequest(req);
        if (!request) return sendError(res, 400, 'invalid_room');
        const { roomId, locale } = request;

        if (pathname === '/admin/api/rooms/join') {
          const url = await createJoinUrl(pnm, config, roomId, { name: adminName(locale), isAdmin: true }, locale);
          console.log(`admin joined room ${roomId} as moderator (from ${ip})`);
          sendJson(res, 200, { url });
        } else if (pathname === '/admin/api/rooms/observe') {
          // Incognito: hidden from the participants, and unable to speak, film or write.
          const url = await createJoinUrl(
            pnm,
            config,
            roomId,
            { name: adminName(locale), isAdmin: false, observer: true },
            locale,
          );
          console.log(`admin joined room ${roomId} as an invisible observer (from ${ip})`);
          sendJson(res, 200, { url });
        } else {
          const result = await pnm.endRoom(createRequest(RoomEndReqSchema, { roomId }));
          if (!result.status) throw new Error(result.msg || 'endRoom failed');
          console.log(`admin ended room ${roomId} (from ${ip})`);
          sendJson(res, 200, { ok: true });
        }
        return true;
      }
      // New links: same recipe as a room created from the home page (fresh moderator key,
      // identifier "name-tag"). The room itself is created when someone joins.
      if (isPost && pathname === '/admin/api/links') {
        if (!isSafeMutation(req)) return sendError(res, 400, 'invalid_request');
        const body = (await readJson(req, 2000)) as { name?: unknown } | null;
        const name = typeof body?.name === 'string' ? body.name.trim() : '';
        const slug = slugifyRoomId(name, ROOM_NAME_MAX);
        if (!slug) return sendError(res, 400, 'invalid_room');
        const { mod, tag } = keys.newKey();
        const roomId = `${slug}-${tag}`;
        console.log(`admin generated links for room ${roomId} (from ${ip})`);
        sendJson(res, 200, { roomId, mod });
        return true;
      }
    } catch (err) {
      console.error('admin api failed:', err);
      return sendError(res, 502, 'plugnmeet_failed', err instanceof Error ? err.message : undefined);
    }

    return sendError(res, 404, 'not_found');
  };
}
