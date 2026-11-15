import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ServerResponse } from 'node:http';
import { sendText } from './http.js';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.woff2': 'font/woff2',
};

export const contentTypeOf = (file: string): string =>
  CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';

/**
 * Fichiers de l'application web construite (dist/web) : servis sous /visio-assets/app/, avec des
 * noms qui changent à chaque build (hachés), donc cachés sans limite.
 */
export function serveBuiltAsset(res: ServerResponse, webDir: string, relativePath: string): void {
  const root = path.resolve(webDir);
  const file = path.resolve(root, relativePath);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    sendText(res, 404, 'Not found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': contentTypeOf(file),
    'Cache-Control': 'public, max-age=31536000, immutable',
  });
  fs.createReadStream(file).pipe(res);
}

/** Fichier de l'hôte (logo, CSS) lu une fois au démarrage. */
export interface LoadedFile {
  data: Buffer;
  contentType: string;
}

export function loadFile(file: string | undefined): LoadedFile | undefined {
  return file ? { data: fs.readFileSync(file), contentType: contentTypeOf(file) } : undefined;
}

export function sendFile(
  res: ServerResponse,
  file: LoadedFile,
  headers: Record<string, string> = {},
): void {
  res.writeHead(200, {
    'Content-Type': file.contentType,
    'Content-Length': file.data.length,
    ...headers,
  });
  res.end(file.data);
}
