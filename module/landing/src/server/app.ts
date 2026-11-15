import type { IncomingMessage, RequestListener, ServerResponse } from 'node:http';
import type { JoinRequest, RoomInfo, RuntimeConfig } from '../shared/api.js';
import { isLocale } from '../shared/locales.js';
import { MOD_KEY_RE, ROOM_ID_RE, slugifyRoomId } from '../shared/slug.js';
import { createAdminHandler } from './admin.js';
import type { Config } from './config.js';
import { sendFile, serveBuiltAsset } from './files.js';
import type { LoadedFile } from './files.js';
import { HttpError, getClientIp, readJson, sendError, sendJson, sendText } from './http.js';
import { joinRoom } from './join.js';
import type { PnmApi } from './plugnmeet.js';
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
}

const APP_PREFIX = '/visio-assets/app/';
const RATE_WINDOW_MS = 5 * 60 * 1000;

/** The server's routes: the JSON API, the files, and the web application for the pages. */
export function createApp({ config, pnm, indexHtml, webDir, logo, customCss }: AppDeps): RequestListener {
  const keys = createRoomKeys(config.plugnmeetSecret);
  const joinLimiter = new RateLimiter(RATE_WINDOW_MS, 10);
  // Separate limiter for key creation (one per new room name typed).
  const keyLimiter = new RateLimiter(RATE_WINDOW_MS, 60);
  const admin = config.adminToken ? createAdminHandler({ pnm, config, adminToken: config.adminToken }) : null;
  if (!admin) console.warn('ADMIN_TOKEN is not set: the /admin panel is disabled');

  const runtimeConfig: RuntimeConfig = {
    defaultLocale: config.defaultLocale,
    brandName: config.brandName,
    themeColor: config.themeColor,
    hasLogo: logo !== undefined,
    hasCustomCss: customCss !== undefined,
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
      locale: isLocale(body.locale) ? body.locale : config.defaultLocale,
    };
    sendJson(res, 200, await joinRoom(request, { pnm, config, keys }));
  }

  /** Room of a /r/<room>?m=<key> link: the key's tag must be the room's tag. */
  function roomInfo(url: URL): RoomInfo | null {
    const room = slugifyRoomId(url.searchParams.get('room') ?? '');
    if (!room) return null;
    const mod = url.searchParams.get('m') ?? '';
    const tag = ROOM_ID_RE.exec(room)?.[2];
    return { room, label: roomLabel(room), moderator: MOD_KEY_RE.test(mod) && tag === keys.tagOf(mod) };
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
    if (get && pathname === '/visio-assets/custom.css' && customCss) {
      return sendFile(res, customCss, { 'Cache-Control': 'no-cache' });
    }

    if (get && pathname === '/visio-api/config') return sendJson(res, 200, runtimeConfig);
    if (get && pathname === '/visio-api/room-key') {
      if (keyLimiter.hit(getClientIp(req))) throw new HttpError(429, 'rate_limited');
      return sendJson(res, 200, keys.newKey());
    }
    if (get && pathname === '/visio-api/room-info') {
      const info = roomInfo(url);
      if (!info) throw new HttpError(404, 'not_found');
      return sendJson(res, 200, info);
    }
    if (req.method === 'POST' && pathname === '/visio-api/join') return joinApi(req, res);

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
