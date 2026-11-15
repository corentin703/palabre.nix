import * as fs from 'node:fs';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app';
import { loadConfig } from './config';
import type { PnmApi } from './plugnmeet';

// Le serveur complet, avec un faux PlugNMeet : on regarde ce qu'il lui demande et ce qu'il répond.

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

async function start(overrides: Record<string, string> = {}) {
  server = http.createServer(
    createApp({
      config: loadConfig({ ...env, ...overrides }),
      pnm,
      indexHtml: Buffer.from('<!doctype html><title>app</title>'),
      webDir: dir,
      logo: undefined,
      customCss: { data: Buffer.from('body{}'), contentType: 'text/css; charset=utf-8' },
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

describe('fichiers et pages', () => {
  it('sert la configuration de la page', async () => {
    expect(await (await fetch(`${base}/visio-api/config`)).json()).toEqual({
      defaultLocale: 'fr',
      brandName: 'Mon organisation',
      themeColor: '#1f3a5f',
      hasLogo: false,
      hasCustomCss: true,
    });
    expect((await fetch(`${base}/visio-assets/custom.css`)).headers.get('content-type')).toContain('text/css');
    expect((await fetch(`${base}/visio-assets/logo`)).status).toBe(404);
  });

  it('sert l’application web pour l’accueil, un salon et l’administration', async () => {
    for (const url of ['/', '/join', '/r/demo-d573b9b5fb90', '/admin']) {
      const response = await fetch(base + url);
      expect(response.status, url).toBe(200);
      expect(await response.text()).toContain('<title>app</title>');
    }
  });

  it('ne laisse pas partir la clé de modérateur en Referer, ni indexer /admin', async () => {
    const room = await fetch(`${base}/r/demo-d573b9b5fb90?m=${'a'.repeat(32)}`);
    expect(room.headers.get('referrer-policy')).toBe('no-referrer');
    expect((await fetch(`${base}/admin`)).headers.get('x-robots-tag')).toContain('noindex');
  });

  it('renvoie à l’accueil un lien de salon invalide', async () => {
    const response = await fetch(`${base}/r/!!!`, { redirect: 'manual' });
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/');
  });

  it('sert les fichiers construits sans sortir de leur dossier', async () => {
    expect((await fetch(`${base}/visio-assets/app/assets/app.js`)).status).toBe(200);
    expect((await fetch(`${base}/visio-assets/app/assets/absent.js`)).status).toBe(404);
    const escape = await fetch(`${base}/visio-assets/app/%2e%2e/%2e%2e/etc/passwd`);
    expect(escape.status).toBe(404);
  });

  it('répond 404 ailleurs', async () => {
    expect((await fetch(`${base}/nimporte-quoi`)).status).toBe(404);
  });
});

describe('POST /visio-api/join', () => {
  it('crée le salon et rend l’adresse de la réunion, dans la langue demandée', async () => {
    const { mod, tag } = (await (await fetch(`${base}/visio-api/room-key`)).json()) as { mod: string; tag: string };
    const response = await postJson('/visio-api/join', { room: 'Réunion Bureau', name: 'Camille', mod, locale: 'en' });
    const { url } = (await response.json()) as { url: string };

    expect(response.status).toBe(200);
    expect(url).toBe('https://visio.example/?access_token=jeton&lng=en-US');
    expect(calls.created).toEqual([`reunion-bureau-${tag}`]);
    expect(calls.tokens).toEqual([{ roomId: `reunion-bureau-${tag}`, isAdmin: true }]);
  });

  it('ne fait modérateur que celui qui présente la clé du salon', async () => {
    const { mod, tag } = (await (await fetch(`${base}/visio-api/room-key`)).json()) as { mod: string; tag: string };
    const room = `salon-${tag}`;
    const other = (await (await fetch(`${base}/visio-api/room-key`)).json()) as { mod: string };

    await postJson('/visio-api/join', { room, name: 'A', mod, locale: 'fr' });
    await postJson('/visio-api/join', { room, name: 'B', mod: other.mod, locale: 'fr' });
    await postJson('/visio-api/join', { room, name: 'C', mod: '', locale: 'fr' });

    expect(calls.tokens.map((t) => t.isAdmin)).toEqual([true, false, false]);
  });

  it('refuse un intitulé inutilisable et une requête mal formée, avec un code à traduire', async () => {
    const invalid = await postJson('/visio-api/join', { room: '!!!', name: 'x', mod: '', locale: 'fr' });
    expect([invalid.status, await invalid.json()]).toEqual([400, { code: 'invalid_room' }]);
    const malformed = await postJson('/visio-api/join', { name: 'x' });
    expect([malformed.status, await malformed.json()]).toEqual([400, { code: 'invalid_request' }]);
  });

  it('signale un échec de PlugNMeet par un code, sans détail technique', async () => {
    vi.mocked(pnm.isRoomActive).mockRejectedValueOnce(new Error('connexion refusée'));
    vi.spyOn(console, 'error').mockImplementationOnce(() => undefined);
    const response = await postJson('/visio-api/join', { room: 'salon', name: 'x', mod: '', locale: 'fr' });
    expect([response.status, await response.json()]).toEqual([502, { code: 'join_failed' }]);
  });

  it('limite le nombre de tentatives par IP', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      statuses.push((await postJson('/visio-api/join', { room: '!!!' })).status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 400)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
  });
});

describe('GET /visio-api/room-info', () => {
  it('vérifie que la clé est bien celle du salon', async () => {
    const { mod, tag } = (await (await fetch(`${base}/visio-api/room-key`)).json()) as { mod: string; tag: string };
    const info = async (m: string) => (await fetch(`${base}/visio-api/room-info?room=demo-${tag}&m=${m}`)).json();
    expect(await info(mod)).toEqual({ room: `demo-${tag}`, label: 'demo', moderator: true });
    expect(await info('0'.repeat(32))).toMatchObject({ moderator: false });
    expect(await info('')).toMatchObject({ moderator: false });
  });
});

describe('administration', () => {
  const login = (token: string, headers: Record<string, string> = {}) => postJson('/admin/login', { token }, headers);

  it('exige une session pour l’API', async () => {
    const response = await fetch(`${base}/admin/api/rooms`);
    expect([response.status, await response.json()]).toEqual([401, { code: 'unauthorized' }]);
  });

  it('échange le jeton contre un cookie de session, qui ouvre l’API', async () => {
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

  it('refuse une requête qui modifie sans être du JSON de ce même site', async () => {
    const wrongType = await fetch(`${base}/admin/login`, { method: 'POST', body: '{}' });
    expect(wrongType.status).toBe(400);
    const wrongOrigin = await login('admin-token', { Origin: 'https://autre.example' });
    expect(wrongOrigin.status).toBe(400);
  });

  it('bloque après trop d’essais ratés', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push((await login('mauvais')).status);
    expect(codes).toEqual([401, 401, 401, 401, 401, 429]);
  });

  it('est désactivée sans jeton', async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await start({ ADMIN_TOKEN: '' });
    expect((await fetch(`${base}/admin`)).status).toBe(404);
  });
});
