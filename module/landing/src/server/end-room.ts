import * as crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { isLocale } from '../shared/locales.js';
import type { Locale } from '../shared/locales.js';
import type { Config } from './config.js';
import { GetActiveRoomInfoReqSchema, createRequest } from './plugnmeet.js';
import type { PnmApi } from './plugnmeet.js';

// The red button of the PlugNMeet client does not mean "leave" for an administrator: it ends the
// meeting for everyone (POST /api/endRoom). With several administrators, one of them leaving
// would therefore cut the others off. The reverse proxy sends that request here: while another
// administrator is in the room, it is refused (with a message; the administrator leaves by
// closing the tab); when the caller is the last one, the request goes on to PlugNMeet unchanged.
// Anything we cannot tell (unreadable token, PlugNMeet not answering...) goes on to PlugNMeet
// too: we never keep a meeting from ending because of a doubt.

const MAX_BODY = 4096;

const MESSAGES: Record<Locale, string> = {
  fr: 'Un autre administrateur est présent : la réunion continue (fermez l’onglet pour la quitter).',
  en: 'Another administrator is present: the meeting goes on (close the tab to leave it).',
};

interface Claims {
  roomId: string;
  userId: string;
  isAdmin: boolean;
}

const pick = (o: Record<string, unknown>, snake: string, camel: string): unknown => o[snake] ?? o[camel];

/** Checks the signature (HS256, with the PlugNMeet secret) and the expiry of a join token. */
export function verifyToken(token: string, secret: string, now: number = Date.now()): Claims | null {
  const [header, payload, signature] = token.split('.');
  if (!header || !payload || !signature) return null;
  try {
    if ((JSON.parse(Buffer.from(header, 'base64url').toString()) as { alg?: string }).alg !== 'HS256') return null;
    const expected = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest();
    const given = Buffer.from(signature, 'base64url');
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Record<string, unknown>;
    if (typeof claims['exp'] === 'number' && claims['exp'] * 1000 < now) return null;
    const roomId = pick(claims, 'room_id', 'roomId');
    const userId = pick(claims, 'user_id', 'userId');
    if (typeof roomId !== 'string' || typeof userId !== 'string') return null;
    return { roomId, userId, isAdmin: pick(claims, 'is_admin', 'isAdmin') === true };
  } catch {
    return null;
  }
}

/** The `CommonResponse` message of PlugNMeet (status = 1, msg = 2), as protobuf: a refusal. */
export function refusalBody(msg: string): Buffer {
  const text = Buffer.from(msg);
  const length: number[] = [];
  for (let n = text.length; ; n >>= 7) {
    length.push(n > 127 ? (n & 127) | 128 : n);
    if (n <= 127) break;
  }
  // `status` is false, the default value: it is not written.
  return Buffer.concat([Buffer.from([0x12, ...length]), text]);
}

function readRaw(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('body too large'));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function languageOf(req: IncomingMessage, fallback: Locale): Locale {
  const first = String(req.headers['accept-language'] ?? '').split(',')[0]?.trim().slice(0, 2).toLowerCase();
  return isLocale(first) ? first : fallback;
}

export function createEndRoomHandler({ config, pnm }: { config: Config; pnm: PnmApi }) {
  /** Is an administrator, other than `except`, online in the room? */
  async function otherAdminOnline(roomId: string, except: string): Promise<boolean> {
    const info = await pnm.getActiveRoomInfo(createRequest(GetActiveRoomInfoReqSchema, { roomId }));
    if (!info.status) throw new Error(info.msg || 'getActiveRoomInfo failed');
    return (info.room?.participantsInfo ?? []).some((p) => {
      if (p.identity === except) return false;
      try {
        const meta = JSON.parse(p.metadata || '{}') as Record<string, unknown>;
        return pick(meta, 'is_admin', 'isAdmin') === true;
      } catch {
        return false;
      }
    });
  }

  /** Hands the request over to PlugNMeet, as it came, and relays the answer. */
  async function forward(req: IncomingMessage, res: ServerResponse, body: Buffer): Promise<void> {
    const upstream = await fetch(`${config.plugnmeetApiUrl}/api/endRoom`, {
      method: 'POST',
      headers: {
        Authorization: String(req.headers.authorization ?? ''),
        'Content-Type': String(req.headers['content-type'] ?? 'application/protobuf'),
      },
      body,
    });
    res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') ?? 'application/protobuf' });
    res.end(Buffer.from(await upstream.arrayBuffer()));
  }

  return async function handleEndRoom(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let body: Buffer;
    try {
      body = await readRaw(req);
    } catch {
      res.writeHead(413).end();
      return;
    }

    const claims = verifyToken(String(req.headers.authorization ?? ''), config.plugnmeetSecret);
    if (claims?.isAdmin) {
      try {
        if (await otherAdminOnline(claims.roomId, claims.userId)) {
          console.log(`end of room ${claims.roomId} refused: another administrator is present`);
          res.writeHead(200, { 'Content-Type': 'application/protobuf' });
          res.end(refusalBody(MESSAGES[languageOf(req, config.defaultLocale)]));
          return;
        }
      } catch (err) {
        console.warn('could not look for other administrators, ending the room:', err instanceof Error ? err.message : err);
      }
    }

    try {
      await forward(req, res, body);
    } catch (err) {
      console.error('endRoom forwarding failed:', err);
      if (!res.headersSent) res.writeHead(502).end();
    }
  };
}
