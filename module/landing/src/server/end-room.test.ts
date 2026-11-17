import * as crypto from 'node:crypto';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { fromBinary } from '@bufbuild/protobuf';
import { CommonResponseSchema } from 'plugnmeet-protocol-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from './config';
import { createEndRoomHandler, refusalBody, verifyToken } from './end-room';
import type { PnmApi } from './plugnmeet';

const SECRET = 'secret';

/** A join token as PlugNMeet signs them (HS256). */
function token(claims: Record<string, unknown>, secret = SECRET, alg = 'HS256'): string {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const body = `${enc({ alg, typ: 'JWT' })}.${enc(claims)}`;
  return `${body}.${crypto.createHmac('sha256', secret).update(body).digest('base64url')}`;
}

const admin = { room_id: 'salon-0123456789ab', user_id: 'u1', is_admin: true, exp: Math.floor(Date.now() / 1000) + 600 };

describe('verifyToken', () => {
  it('reads the claims of a valid token (snake or camel case)', () => {
    expect(verifyToken(token(admin), SECRET)).toEqual({ roomId: 'salon-0123456789ab', userId: 'u1', isAdmin: true });
    expect(verifyToken(token({ roomId: 'r', userId: 'u', isAdmin: false }), SECRET)).toEqual({ roomId: 'r', userId: 'u', isAdmin: false });
  });

  it('refuses a wrong signature, another algorithm, an expired token and garbage', () => {
    expect(verifyToken(token(admin, 'autre'), SECRET)).toBeNull();
    expect(verifyToken(token(admin, SECRET, 'none'), SECRET)).toBeNull();
    expect(verifyToken(token({ ...admin, exp: 1 }), SECRET)).toBeNull();
    expect(verifyToken('pas.un.jeton', SECRET)).toBeNull();
    expect(verifyToken('', SECRET)).toBeNull();
  });
});

describe('refusalBody', () => {
  it('is a protobuf CommonResponse with status false and the message', () => {
    const decoded = fromBinary(CommonResponseSchema, refusalBody('Un autre administrateur est présent : la réunion continue'));
    expect([decoded.status, decoded.msg]).toEqual([false, 'Un autre administrateur est présent : la réunion continue']);
    const long = 'x'.repeat(300);
    expect(fromBinary(CommonResponseSchema, refusalBody(long)).msg).toBe(long);
  });
});

describe('POST /api/endRoom', () => {
  let proxy: http.Server;
  let upstream: http.Server;
  let base: string;
  const forwarded: { auth: string; body: Buffer }[] = [];
  let participants: { identity: string; metadata: string }[] = [];
  const pnm = {
    getActiveRoomInfo: vi.fn(async () => ({ status: true, room: { participantsInfo: participants } })),
  } as unknown as PnmApi;

  beforeEach(async () => {
    forwarded.length = 0;
    participants = [];
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // PlugNMeet, which answers "success" (status true).
    upstream = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        forwarded.push({ auth: String(req.headers.authorization), body: Buffer.concat(chunks) });
        res.writeHead(200, { 'Content-Type': 'application/protobuf' });
        res.end(Buffer.from([0x08, 0x01, 0x12, 0x07, ...Buffer.from('success')]));
      });
    });
    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
    const config = loadConfig({
      PLUGNMEET_HOST: 'https://v.example',
      PLUGNMEET_API_URL: `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`,
      PLUGNMEET_API_KEY: 'k',
      PLUGNMEET_SECRET: SECRET,
    });
    const handler = createEndRoomHandler({ config, pnm });
    proxy = http.createServer((req, res) => void handler(req, res));
    await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
  });
  afterEach(async () => {
    await new Promise<void>((resolve) => proxy.close(() => resolve()));
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  });

  const post = (auth: string, headers: Record<string, string> = {}) =>
    fetch(`${base}/api/endRoom`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/protobuf', ...headers },
      body: Buffer.from([0x0a, 0x03, 0x61, 0x62, 0x63]),
    });
  const decode = async (res: Response) => fromBinary(CommonResponseSchema, new Uint8Array(await res.arrayBuffer()));

  it('refuses to end the room while another administrator is in it, in the visitor’s language', async () => {
    participants = [
      { identity: 'u1', metadata: JSON.stringify({ isAdmin: true }) },
      { identity: 'u2', metadata: JSON.stringify({ isAdmin: true }) },
    ];
    const fr = await decode(await post(token(admin), { 'Accept-Language': 'fr-FR,fr;q=0.9' }));
    expect([fr.status, fr.msg]).toEqual([false, expect.stringContaining('autre administrateur')]);
    const en = await decode(await post(token(admin), { 'Accept-Language': 'en-GB' }));
    expect(en.msg).toContain('Another administrator');
    expect(forwarded).toEqual([]);
  });

  it('lets the last administrator end the room (the request goes on to PlugNMeet as it came)', async () => {
    // Others are there, but none is an administrator (a participant, an observer, a broken record).
    participants = [
      { identity: 'u1', metadata: JSON.stringify({ isAdmin: true }) },
      { identity: 'u2', metadata: JSON.stringify({ isAdmin: false }) },
      { identity: 'RECORDER_BOT', metadata: JSON.stringify({ is_admin: false }) },
      { identity: 'u3', metadata: 'pas du json' },
    ];
    const token_ = token(admin);
    const res = await decode(await post(token_));
    expect([res.status, res.msg]).toEqual([true, 'success']);
    expect(forwarded).toHaveLength(1);
    expect(forwarded[0]?.auth).toBe(token_);
    expect([...(forwarded[0]?.body ?? [])]).toEqual([0x0a, 0x03, 0x61, 0x62, 0x63]);
  });

  it('does not interfere for a participant, a forged token, or when PlugNMeet cannot tell', async () => {
    participants = [{ identity: 'u2', metadata: JSON.stringify({ isAdmin: true }) }];
    await post(token({ ...admin, is_admin: false }));
    await post(token(admin, 'autre secret'));
    await post('nimporte quoi');
    expect(forwarded).toHaveLength(3);

    vi.mocked(pnm.getActiveRoomInfo).mockRejectedValueOnce(new Error('down'));
    await post(token(admin));
    expect(forwarded).toHaveLength(4);
  });
});
