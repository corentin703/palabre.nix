import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ApiError, ErrorCode } from '../shared/api.js';

/** Erreur à renvoyer au navigateur, qui traduit `code` (voir shared/api.ts). */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
  ) {
    super(code);
  }
}

/**
 * Derrière Caddy, l'adresse de la socket est toujours 127.0.0.1 : l'IP du visiteur est dans
 * X-Forwarded-For, que Caddy réécrit (le conteneur n'écoute que sur 127.0.0.1, donc l'en-tête ne
 * vient pas d'un client direct).
 */
export function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0]?.trim() || 'unknown';
  return req.socket.remoteAddress || 'unknown';
}

export function readBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer | string) => {
      body += chunk;
      if (body.length > maxBytes) {
        reject(new Error('body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

/** Corps JSON d'une requête, ou null s'il est illisible ou trop gros. */
export async function readJson(req: IncomingMessage, maxBytes: number): Promise<unknown> {
  try {
    return JSON.parse((await readBody(req, maxBytes)) || '{}');
  } catch {
    return null;
  }
}

export function sendJson(
  res: ServerResponse,
  status: number,
  payload: unknown,
  headers: Record<string, string> = {},
): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(JSON.stringify(payload));
}

export function sendText(res: ServerResponse, status: number, text: string): void {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

/** Réponse d'erreur JSON ; retourne vrai (requête traitée). */
export function sendError(res: ServerResponse, status: number, code: ErrorCode, detail?: string): true {
  const body: ApiError = detail ? { code, detail } : { code };
  sendJson(res, status, body);
  return true;
}
