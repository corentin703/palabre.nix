import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import { createApp } from './app.js';
import { ConfigError, loadConfig } from './config.js';
import { loadFile } from './files.js';
import { createPnm } from './plugnmeet.js';

/** Root of the installed application: dist/server/ -> .. -> .. */
const ROOT = path.resolve(import.meta.dirname, '..', '..');
const WEB_DIR = path.join(ROOT, 'dist', 'web');

try {
  const config = loadConfig(process.env);
  const app = createApp({
    config,
    pnm: createPnm(config),
    indexHtml: fs.readFileSync(path.join(WEB_DIR, 'index.html')),
    webDir: WEB_DIR,
    logo: loadFile(config.logoFile),
    customCss: loadFile(config.cssFile),
  });

  http.createServer(app).listen(config.port, config.bindHost, () => {
    console.log(
      `palabre-landing listening on ${config.bindHost}:${config.port}, PLUGNMEET_HOST=${config.plugnmeetHost}`,
    );
  });
} catch (err) {
  console.error(err instanceof ConfigError ? err.message : err);
  process.exit(1);
}
