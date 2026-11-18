import * as fs from 'node:fs';
import * as path from 'node:path';
import type { IncomingMessage, RequestListener, ServerResponse } from 'node:http';
import type { JoinRequest, LockRequest, RoomInfo, RuntimeConfig, SendLinksRequest } from '../shared/api.js';
import { isLocale } from '../shared/locales.js';
import { ROOM_ID_RE, slugifyRoomId } from '../shared/slug.js';
import { createAdminHandler } from './admin.js';
import type { Config } from './config.js';
import { sendFile, serveBuiltAsset } from './files.js';
import { PWA_ICON_PREFIX, buildManifest } from './pwa.js';
import type { PwaIcons } from './pwa.js';
import type { LoadedFile } from './files.js';
import { HttpError, getClientIp, readJson, sendError, sendJson, sendText } from './http.js';
import { joinRoom } from './join.js';
import { invitationMails } from './mail.js';
import { RecipientRejected, sendMail } from './smtp.js';
import type { PnmApi } from './plugnmeet.js';
import { createClosedRooms } from './closed-rooms.js';
import { createRoomKeys, roomLabel } from './rooms.js';
import { RateLimiter } from './window-counter.js';

export interface AppDeps {
  config: Config;
  pnm: PnmApi;
  /** `index.html` of the built web application. */
  indexHtml: Buffer;
  /** Folder of the built web application (dist/web). */
  webDir: string;
  logo: LoadedFile | undefined;
  customCss: LoadedFile | undefined;
  /** Icons of the installed app (PWA), made from the logo; present when the PWA is enabled. */
  pwaIcons?: PwaIcons;
}

const APP_PREFIX = '/visio-assets/app/';
const RATE_WINDOW_MS = 5 * 60 * 1000;

/** The server's routes: the JSON API, the files, and the web application for the pages. */
export function createApp({ config, pnm, indexHtml, webDir, logo, customCss, pwaIcons }: AppDeps): RequestListener {
  const keys = createRoomKeys(config.roomKeySecret);
  const closed = createClosedRooms(config.closedRoomsFile);
  const joinLimiter = new RateLimiter(RATE_WINDOW_MS, 10);
  // Separate limiter for key creation (one per new room name typed).
  const keyLimiter = new RateLimiter(RATE_WINDOW_MS, 60);
  // Whoever asks whether a key is a moderator's is a guesser: it is not left unlimited.
  const infoLimiter = new RateLimiter(RATE_WINDOW_MS, 120);
  // Mails: a few per IP, and a few per address, so the form is not a way to spam someone.
  const mailIpLimiter = new RateLimiter(60 * 60 * 1000, 6);
  const mailAddressLimiter = new RateLimiter(24 * 60 * 60 * 1000, 3);
  const admin = config.adminToken ? createAdminHandler({ pnm, config, adminToken: config.adminToken, keys, closed }) : null;
  if (!admin) console.warn('ADMIN_TOKEN is not set: the /admin panel is disabled');

  const runtimeConfig: RuntimeConfig = {
    defaultLocale: config.defaultLocale,
    brandName: config.brandName,
    themeColor: config.themeColor,
    hasLogo: logo !== undefined,
    hasCustomCss: customCss !== undefined,
    pwa: config.pwa && pwaIcons !== undefined,
    mail: config.mail !== undefined,
  };

  const manifestFile: LoadedFile = {
    data: Buffer.from(JSON.stringify(buildManifest(config))),
    contentType: 'application/manifest+json; charset=utf-8',
  };

  /** The web application's page: it reads the address to know what to show. */
  const sendApp = (res: ServerResponse, headers: Record<string, string> = {}): void => {
    sendFile(res, { data: indexHtml, contentType: 'text/html; charset=utf-8' }, headers);
  };

  async function joinApi(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (joinLimiter.hit(getClientIp(req))) throw new HttpError(429, 'rate_limited');
    const body = (await readJson(req, 10_000)) as Partial<Record<keyof JoinRequest, unknown>> | null;
    if (!body || typeof body.room !== 'string') throw new HttpError(400, 'invalid_request');
    const request: JoinRequest = {
      room: body.room,
      name: typeof body.name === 'string' ? body.name : '',
      mod: typeof body.mod === 'string' ? body.mod : '',
      ...(typeof body.title === 'string' ? { title: body.title } : {}),
      locale: isLocale(body.locale) ? body.locale : config.defaultLocale,
    };
    sendJson(res, 200, await joinRoom(request, { pnm, config, keys, closed }));
  }

  /** Sends the invitation link and the moderator link, in two mails, to the given address. */
  async function sendLinksApi(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!config.mail) throw new HttpError(404, 'mail_disabled');
    const body = (await readJson(req, 4000)) as Partial<Record<keyof SendLinksRequest, unknown>> | null;
    const room = typeof body?.room === 'string' ? slugifyRoomId(body.room) : '';
    const mod = typeof body?.mod === 'string' ? body.mod : '';
    const email = typeof body?.email === 'string' ? body.email.trim() : '';
    if (!room || !mod) throw new HttpError(400, 'invalid_request');
    if (!/^[^\s@<>",;:]{1,64}@[^\s@<>",;:]{1,255}$/.test(email)) throw new HttpError(400, 'invalid_email');
    // Only the holder of the moderator key may have the links sent (they contain it). This is
    // also a way to test keys: same limit as /visio-api/room-info.
    if (infoLimiter.hit(getClientIp(req))) throw new HttpError(429, 'rate_limited');
    if (!roomInfo(new URL(`http://x/?room=${encodeURIComponent(room)}&m=${encodeURIComponent(mod)}`))?.moderator) {
      throw new HttpError(400, 'invalid_request');
    }
    if (mailIpLimiter.hit(getClientIp(req)) || mailAddressLimiter.hit(email.toLowerCase())) {
      throw new HttpError(429, 'rate_limited');
    }
    const locale = isLocale(body?.locale) ? body.locale : config.defaultLocale;
    let sent = 0;
    try {
      for (const mail of invitationMails(config, { roomId: room, label: roomLabel(room), mod, locale, to: email })) {
        await sendMail(config.mail, mail);
        sent += 1;
      }
    } catch (err) {
      console.error('sending the links failed:', err instanceof Error ? err.message : err);
      // The relay refused the address (nothing sent), or it failed: after the first mail, the
      // person has the invitation link but not the moderator link, and has to be told.
      if (err instanceof RecipientRejected) throw new HttpError(422, 'mail_rejected');
      throw new HttpError(502, sent > 0 ? 'mail_partial' : 'mail_failed');
    }
    sendJson(res, 200, { ok: true });
  }

  /** A moderator closes the room to new guests, or opens it again: only the holder of its key. */
  async function lockApi(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (infoLimiter.hit(getClientIp(req))) throw new HttpError(429, 'rate_limited');
    const body = (await readJson(req, 2000)) as Partial<Record<keyof LockRequest, unknown>> | null;
    const room = typeof body?.room === 'string' ? slugifyRoomId(body.room) : '';
    const mod = typeof body?.mod === 'string' ? body.mod : '';
    if (!room || typeof body?.closed !== 'boolean') throw new HttpError(400, 'invalid_request');
    if (!roomInfo(new URL(`http://x/?room=${encodeURIComponent(room)}&m=${encodeURIComponent(mod)}`))?.moderator) {
      throw new HttpError(403, 'not_moderator');
    }
    try {
      closed.set(room, body.closed);
    } catch (err) {
      console.error('saving the closed rooms failed:', err);
      throw new HttpError(500, 'save_failed');
    }
    console.log(`moderator ${body.closed ? 'closed' : 'reopened'} room ${room} to new guests (from ${getClientIp(req)})`);
    sendJson(res, 200, { closed: body.closed });
  }

  /** Room of a /r/<room>?m=<key> link: the key's tag must be the room's tag. */
  function roomInfo(url: URL): RoomInfo | null {
    const room = slugifyRoomId(url.searchParams.get('room') ?? '');
    if (!room) return null;
    const mod = url.searchParams.get('m') ?? '';
    const tag = ROOM_ID_RE.exec(room)?.[2];
    return { room, label: roomLabel(room), moderator: keys.matches(tag, mod), closed: closed.has(room) };
  }

  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const { pathname } = url;
    const get = req.method === 'GET';

    // Administration panel: the API first, then the page (the web application).
    if (pathname === '/admin' || pathname.startsWith('/admin/')) {
      if (!admin) return void sendText(res, 404, 'Not found');
      if (await admin(req, res, pathname)) return;
      if (get && (pathname === '/admin' || pathname === '/admin/')) {
        return sendApp(res, { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
      }
    }

    if (get && pathname.startsWith(APP_PREFIX)) {
      return serveBuiltAsset(res, webDir, pathname.slice(APP_PREFIX.length));
    }
    if (get && pathname === '/visio-assets/logo' && logo) {
      return sendFile(res, logo, { 'Cache-Control': 'public, max-age=86400' });
    }
    // PWA (when enabled by the module): manifest, icons, and the service worker, served from
    // outside /visio-assets/app/ (not cached for good) and allowed to control the whole site.
    if (runtimeConfig.pwa && get && pathname === '/visio-assets/manifest.webmanifest') {
      return sendFile(res, manifestFile, { 'Cache-Control': 'no-cache' });
    }
    if (runtimeConfig.pwa && get && pathname.startsWith(PWA_ICON_PREFIX)) {
      const icon = await pwaIcons?.get(pathname.slice(PWA_ICON_PREFIX.length));
      if (!icon) return void sendText(res, 404, 'Not found');
      return sendFile(res, icon, { 'Cache-Control': 'public, max-age=86400' });
    }
    if (runtimeConfig.pwa && get && pathname === '/visio-assets/sw.js') {
      const worker = path.join(webDir, 'sw.js');
      if (!fs.existsSync(worker)) return void sendText(res, 404, 'Not found');
      return sendFile(
        res,
        { data: fs.readFileSync(worker), contentType: 'text/javascript; charset=utf-8' },
        { 'Cache-Control': 'no-cache', 'Service-Worker-Allowed': '/' },
      );
    }
    if (get && pathname === '/visio-assets/custom.css' && customCss) {
      return sendFile(res, customCss, { 'Cache-Control': 'no-cache' });
    }

    if (get && pathname === '/visio-api/config') return sendJson(res, 200, runtimeConfig);
    if (get && pathname === '/visio-api/room-key') {
      if (keyLimiter.hit(getClientIp(req))) throw new HttpError(429, 'rate_limited');
      return sendJson(res, 200, keys.newKey());
    }
    if (get && pathname === '/visio-api/room-info') {
      if (infoLimiter.hit(getClientIp(req))) throw new HttpError(429, 'rate_limited');
      const info = roomInfo(url);
      if (!info) throw new HttpError(404, 'not_found');
      return sendJson(res, 200, info);
    }
    if (req.method === 'POST' && pathname === '/visio-api/join') return joinApi(req, res);
    if (req.method === 'POST' && pathname === '/visio-api/lock') return lockApi(req, res);
    if (req.method === 'POST' && pathname === '/visio-api/send-links') return sendLinksApi(req, res);

    // Pages: the home page, and a room (shareable link or moderator link).
    if (get && (pathname === '/' || pathname === '/join')) {
      return sendApp(res, { 'Cache-Control': 'no-cache' });
    }
    const room = get ? /^\/r\/([^/]+)$/.exec(pathname)?.[1] : undefined;
    if (room !== undefined) {
      if (!slugifyRoomId(safeDecode(room))) {
        res.writeHead(302, { Location: '/' });
        return void res.end();
      }
      // The moderator key is in the address: it must not leave in the Referer.
      return sendApp(res, { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    }

    sendText(res, 404, 'Not found');
  }

  return (req, res) => {
    route(req, res).catch((err: unknown) => {
      if (err instanceof HttpError) {
        sendError(res, err.status, err.code);
        return;
      }
      console.error('request failed:', err);
      if (!res.headersSent) sendError(res, 500, 'invalid_request');
    });
  };
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return '';
  }
}
