import * as fs from 'node:fs';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app';
import type { AppDeps } from './app';
import { createPwaIcons } from './pwa';
import * as smtp from './smtp';
import { loadConfig } from './config';
import type { PnmApi } from './plugnmeet';

// The whole server, with a fake PlugNMeet: we look at what it asks it and what it answers.

const calls: { tokens: { roomId: string; isAdmin: boolean }[]; created: string[] } = { tokens: [], created: [] };

const pnm = {
  isRoomActive: vi.fn(async () => ({ status: true, isActive: false })),
  createRoom: vi.fn(async (request: { roomId: string }) => {
    calls.created.push(request.roomId);
    return { status: true };
  }),
  getJoinToken: vi.fn(async (request: { roomId: string; userInfo?: { isAdmin?: boolean } }) => {
    calls.tokens.push({ roomId: request.roomId, isAdmin: request.userInfo?.isAdmin ?? false });
    return { status: true, token: 'jeton' };
  }),
  getActiveRoomsInfo: vi.fn(async () => ({ status: true, rooms: [] })),
  fetchPastRoomsInfo: vi.fn(async () => ({ status: true, result: { roomsList: [] } })),
  endRoom: vi.fn(async () => ({ status: true })),
} as unknown as PnmApi;

const env = {
  PLUGNMEET_HOST: 'https://visio.example',
  PLUGNMEET_API_KEY: 'k',
  PLUGNMEET_SECRET: 'secret',
  ADMIN_TOKEN: 'admin-token',
  LANDING_BRAND_NAME: 'Mon organisation',
};

let dir: string;
let server: http.Server;
let base: string;

async function start(overrides: Record<string, string> = {}, extra: Partial<AppDeps> = {}) {
  server = http.createServer(
    createApp({
      config: loadConfig({ ...env, ...overrides }),
      pnm,
      indexHtml: Buffer.from('<!doctype html><title>app</title>'),
      webDir: dir,
      logo: undefined,
      customCss: { data: Buffer.from('body{}'), contentType: 'text/css; charset=utf-8' },
      ...extra,
    }),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const postJson = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'palabre-web-'));
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'assets', 'app.js'), 'console.log(1)');
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

beforeEach(async () => {
  calls.tokens.length = 0;
  calls.created.length = 0;
  await start();
  return () => new Promise<void>((resolve) => server.close(() => resolve()));
});

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('files and pages', () => {
  it('serves the page configuration', async () => {
    expect(await (await fetch(`${base}/visio-api/config`)).json()).toEqual({
      defaultLocale: 'fr',
      brandName: 'Mon organisation',
      themeColor: '#1f3a5f',
      hasLogo: false,
      hasCustomCss: true,
      pwa: false,
      mail: false,
    });
    expect((await fetch(`${base}/visio-assets/custom.css`)).headers.get('content-type')).toContain('text/css');
    expect((await fetch(`${base}/visio-assets/logo`)).status).toBe(404);
  });

  it('serves the web application for the home page, a room and the administration', async () => {
    for (const url of ['/', '/join', '/r/demo-d573b9b5fb90', '/admin']) {
      const response = await fetch(base + url);
      expect(response.status, url).toBe(200);
      expect(await response.text()).toContain('<title>app</title>');
    }
  });

  it('does not leak the moderator key in the Referer, nor let /admin be indexed', async () => {
    const room = await fetch(`${base}/r/demo-d573b9b5fb90?m=${'a'.repeat(32)}`);
    expect(room.headers.get('referrer-policy')).toBe('no-referrer');
    expect((await fetch(`${base}/admin`)).headers.get('x-robots-tag')).toContain('noindex');
  });

  it('redirects an invalid room link to the home page', async () => {
    const response = await fetch(`${base}/r/!!!`, { redirect: 'manual' });
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/');
  });

  it('serves the built files without leaving their folder', async () => {
    expect((await fetch(`${base}/visio-assets/app/assets/app.js`)).status).toBe(200);
    expect((await fetch(`${base}/visio-assets/app/assets/absent.js`)).status).toBe(404);
    const escape = await fetch(`${base}/visio-assets/app/%2e%2e/%2e%2e/etc/passwd`);
    expect(escape.status).toBe(404);
  });

  it('answers 404 elsewhere', async () => {
    expect((await fetch(`${base}/nimporte-quoi`)).status).toBe(404);
  });
});

describe('POST /visio-api/join', () => {
  it('creates the room and returns the meeting address, in the requested language', async () => {
    const { mod, tag } = (await (await fetch(`${base}/visio-api/room-key`)).json()) as { mod: string; tag: string };
    const response = await postJson('/visio-api/join', { room: `reunion-bureau-${tag}`, title: 'Réunion Bureau', name: 'Camille', mod, locale: 'en' });
    const { url } = (await response.json()) as { url: string };

    expect(response.status).toBe(200);
    expect(url).toBe('https://visio.example/?access_token=jeton&lng=en-US');
    expect(calls.created).toEqual([`reunion-bureau-${tag}`]);
    expect(calls.tokens).toEqual([{ roomId: `reunion-bureau-${tag}`, isAdmin: true }]);
  });

  it('only makes a moderator of whoever presents the room’s key', async () => {
    const { mod, tag } = (await (await fetch(`${base}/visio-api/room-key`)).json()) as { mod: string; tag: string };
    const room = `salon-${tag}`;
    const other = (await (await fetch(`${base}/visio-api/room-key`)).json()) as { mod: string };

    await postJson('/visio-api/join', { room, name: 'A', mod, locale: 'fr' });
    await postJson('/visio-api/join', { room, name: 'B', mod: other.mod, locale: 'fr' });
    await postJson('/visio-api/join', { room, name: 'C', mod: '', locale: 'fr' });

    expect(calls.tokens.map((t) => t.isAdmin)).toEqual([true, false, false]);
  });

  it('refuses an unusable name and a malformed request, with a code to translate', async () => {
    const invalid = await postJson('/visio-api/join', { room: '!!!', name: 'x', mod: '', locale: 'fr' });
    expect([invalid.status, await invalid.json()]).toEqual([400, { code: 'invalid_room' }]);
    const malformed = await postJson('/visio-api/join', { name: 'x' });
    expect([malformed.status, await malformed.json()]).toEqual([400, { code: 'invalid_request' }]);
  });

  it('reports a PlugNMeet failure with a code, without technical details', async () => {
    vi.mocked(pnm.isRoomActive).mockRejectedValueOnce(new Error('connection refused'));
    vi.spyOn(console, 'error').mockImplementationOnce(() => undefined);
    const response = await postJson('/visio-api/join', { room: 'salon', name: 'x', mod: '', locale: 'fr' });
    expect([response.status, await response.json()]).toEqual([502, { code: 'join_failed' }]);
  });

  it('limits the number of attempts per IP', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      statuses.push((await postJson('/visio-api/join', { room: '!!!' })).status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 400)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
  });
});

describe('GET /visio-api/room-info', () => {
  it('checks that the key is the room’s key', async () => {
    const { mod, tag } = (await (await fetch(`${base}/visio-api/room-key`)).json()) as { mod: string; tag: string };
    const info = async (m: string) => (await fetch(`${base}/visio-api/room-info?room=demo-${tag}&m=${m}`)).json();
    expect(await info(mod)).toEqual({ room: `demo-${tag}`, label: 'demo', moderator: true });
    expect(await info('0'.repeat(32))).toMatchObject({ moderator: false });
    expect(await info('')).toMatchObject({ moderator: false });
  });
});

describe('POST /visio-api/send-links', () => {
  const sent: { to: string; subject: string; text: string; html: string }[] = [];
  const mailEnv = { MAIL_HOST: 'smtp.example', MAIL_FROM: 'visio@example.org' };

  beforeEach(async () => {
    sent.length = 0;
    vi.spyOn(smtp, 'sendMail').mockImplementation(async (_config, mail) => void sent.push(mail));
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await start(mailEnv);
  });

  const key = async () => (await (await fetch(`${base}/visio-api/room-key`)).json()) as { mod: string; tag: string };

  it('sends two mails: the invitation link, then the moderator link, in the page’s language', async () => {
    const { mod, tag } = await key();
    const response = await postJson('/visio-api/send-links', { room: `salon-${tag}`, mod, email: 'camille@example.org', locale: 'en' });
    expect(response.status).toBe(200);
    expect(sent.map((m) => m.to)).toEqual(['camille@example.org', 'camille@example.org']);
    expect(sent[0]?.text).toContain(`https://visio.example/r/salon-${tag}\n`);
    expect(sent[0]?.text).not.toContain(mod);
    expect(sent[1]?.text).toContain(`https://visio.example/r/salon-${tag}?m=${mod}`);
    expect(sent[1]?.subject).toContain('moderator link');
    expect(sent[1]?.text).toContain('do NOT forward');
  });

  it('refuses a key that is not the room’s, a malformed address, and a server without mail', async () => {
    const { tag } = await key();
    const other = await key();
    expect((await postJson('/visio-api/send-links', { room: `salon-${tag}`, mod: other.mod, email: 'a@b.fr' })).status).toBe(400);
    expect((await postJson('/visio-api/send-links', { room: `salon-${tag}`, mod: 'x', email: 'pas un mail' })).status).toBe(400);
    expect(sent).toEqual([]);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await start();
    const disabled = await postJson('/visio-api/send-links', { room: 'salon', mod: 'x', email: 'a@b.fr' });
    expect([disabled.status, await disabled.json()]).toEqual([404, { code: 'mail_disabled' }]);
  });

  it('limits the mails sent to one address', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      const { mod, tag } = await key();
      statuses.push((await postJson('/visio-api/send-links', { room: `salon-${tag}`, mod, email: 'camille@example.org' })).status);
    }
    expect(statuses).toEqual([200, 200, 200, 429]);
  });

  it('reports a failure of the mail relay with a code', async () => {
    vi.mocked(smtp.sendMail).mockRejectedValueOnce(new Error('relay down'));
    vi.spyOn(console, 'error').mockImplementationOnce(() => undefined);
    const { mod, tag } = await key();
    const response = await postJson('/visio-api/send-links', { room: `salon-${tag}`, mod, email: 'a@b.fr' });
    expect([response.status, await response.json()]).toEqual([502, { code: 'mail_failed' }]);
  });
});

describe('administration panel', () => {
  const login = (token: string, headers: Record<string, string> = {}) => postJson('/admin/login', { token }, headers);

  it('requires a session for the API', async () => {
    const response = await fetch(`${base}/admin/api/rooms`);
    expect([response.status, await response.json()]).toEqual([401, { code: 'unauthorized' }]);
  });

  it('exchanges the token for a session cookie, which opens the API', async () => {
    expect(await (await login('mauvais')).json()).toEqual({ code: 'bad_token' });
    const ok = await login('admin-token');
    expect(ok.status).toBe(200);
    const cookie = ok.headers.get('set-cookie')?.split(';')[0] ?? '';
    expect(cookie).toMatch(/^admin_session=\d+\./);

    const rooms = await fetch(`${base}/admin/api/rooms`, { headers: { cookie } });
    expect([rooms.status, await rooms.json()]).toEqual([200, { active: [], past: [] }]);

    const forged = await fetch(`${base}/admin/api/rooms`, { headers: { cookie: 'admin_session=9999999999.abc' } });
    expect(forged.status).toBe(401);
  });

  it('generates new links: a fresh key whose tag matches the room identifier', async () => {
    const cookie = (await login('admin-token')).headers.get('set-cookie')?.split(';')[0] ?? '';
    const ask = (name: string) => postJson('/admin/api/links', { name }, { cookie });
    const response = await ask('Réunion équipe');
    expect(response.status).toBe(200);
    const { roomId, mod } = (await response.json()) as { roomId: string; mod: string };
    expect(roomId).toMatch(/^reunion-equipe-[0-9a-f]{12}$/);
    const info = await fetch(`${base}/visio-api/room-info?room=${roomId}&m=${mod}`);
    expect(await info.json()).toMatchObject({ moderator: true });
    expect((await ask('!!!')).status).toBe(400);
    expect((await postJson('/admin/api/links', { name: 'x' })).status).toBe(401);
  });

  it('gives the moderator key of each room, to build its link', async () => {
    const cookie = (await login('admin-token')).headers.get('set-cookie')?.split(';')[0] ?? '';
    const { mod, tag } = (await (await fetch(`${base}/visio-api/room-key`)).json()) as { mod: string; tag: string };
    vi.mocked(pnm.getActiveRoomsInfo).mockResolvedValueOnce({
      status: true,
      rooms: [{ roomInfo: { roomId: `salon-${tag}`, roomTitle: 'salon', sid: 's', creationTime: '1' }, participantsInfo: [] }],
    } as never);
    const rooms = (await (await fetch(`${base}/admin/api/rooms`, { headers: { cookie } })).json()) as {
      active: { roomId: string; mod: string }[];
    };
    expect(rooms.active).toMatchObject([{ roomId: `salon-${tag}`, mod }]);
  });

  it('refuses a request that changes something without being JSON from this same site', async () => {
    const wrongType = await fetch(`${base}/admin/login`, { method: 'POST', body: '{}' });
    expect(wrongType.status).toBe(400);
    const wrongOrigin = await login('admin-token', { Origin: 'https://autre.example' });
    expect(wrongOrigin.status).toBe(400);
  });

  it('blocks after too many failed attempts', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push((await login('mauvais')).status);
    expect(codes).toEqual([401, 401, 401, 401, 401, 429]);
  });

  it('is disabled without a token', async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await start({ ADMIN_TOKEN: '' });
    expect((await fetch(`${base}/admin`)).status).toBe(404);
  });
});

describe('PWA', () => {
  const restart = async (overrides: Record<string, string>, extra: Partial<AppDeps> = {}) => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await start(overrides, extra);
  };
  // A plain function (not vi.fn): the icons' resizer, counting its calls.
  let calls = 0;
  let failNext = false;
  const resize = async (args: string[]) => {
    calls++;
    if (failNext) {
      failNext = false;
      throw new Error('magick missing');
    }
    return Buffer.from(`png:${args.join(' ')}`);
  };
  const pwaEnv = { LANDING_PWA: '1', LANDING_LOGO_FILE: '/etc/logo.svg' };

  beforeEach(() => {
    calls = 0;
    failNext = false;
  });

  it('is off by default: nothing is served, the page is told so', async () => {
    expect((await fetch(`${base}/visio-assets/manifest.webmanifest`)).status).toBe(404);
    expect((await fetch(`${base}/visio-assets/sw.js`)).status).toBe(404);
    expect(((await (await fetch(`${base}/visio-api/config`)).json()) as { pwa: boolean }).pwa).toBe(false);
  });

  it('serves a manifest that follows the host settings', async () => {
    await restart(
      { ...pwaEnv, LANDING_SHORT_NAME: 'Visio', LANDING_BACKGROUND_COLOR: '#101010', LANDING_THEME_COLOR: '#123456' },
      { pwaIcons: createPwaIcons('/etc/logo.svg', '#101010', resize) },
    );
    const res = await fetch(`${base}/visio-assets/manifest.webmanifest`);
    expect(res.headers.get('content-type')).toContain('application/manifest+json');
    const manifest = await res.json();
    expect(manifest).toMatchObject({
      name: 'Mon organisation',
      short_name: 'Visio',
      theme_color: '#123456',
      background_color: '#101010',
      start_url: '/',
    });
    expect(manifest.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes} ${i.purpose}`)).toEqual([
      '192x192 any',
      '512x512 any',
      '512x512 maskable',
    ]);
  });

  it('resizes an icon on the first request only, then serves it from the cache', async () => {
    await restart(pwaEnv, { pwaIcons: createPwaIcons('/etc/logo.svg', '#ffffff', resize) });
    const url = `${base}/visio-assets/pwa/icon-192.png`;
    const [first, second] = await Promise.all([fetch(url), fetch(url)]);
    expect(first.headers.get('content-type')).toBe('image/png');
    expect(await first.text()).toContain('192x192');
    expect(await second.text()).toContain('192x192');
    await fetch(url);
    expect(calls).toBe(1);
    await fetch(`${base}/visio-assets/pwa/icon-512.png`);
    expect(calls).toBe(2);
    expect((await fetch(`${base}/visio-assets/pwa/other.png`)).status).toBe(404);
    expect(calls).toBe(2);
  });

  it('does not keep a failed resize', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    failNext = true;
    await restart(pwaEnv, { pwaIcons: createPwaIcons('/etc/logo.svg', '#ffffff', resize) });
    const url = `${base}/visio-assets/pwa/icon-192.png`;
    expect((await fetch(url)).status).toBe(404);
    expect((await fetch(url)).status).toBe(200);
  });

  it('serves the service worker for the whole site', async () => {
    fs.writeFileSync(path.join(dir, 'sw.js'), '// sw');
    await restart(pwaEnv, { pwaIcons: createPwaIcons('/etc/logo.svg', '#ffffff', resize) });
    const res = await fetch(`${base}/visio-assets/sw.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get('service-worker-allowed')).toBe('/');
  });
});
