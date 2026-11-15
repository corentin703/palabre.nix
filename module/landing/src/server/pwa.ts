import { execFile } from 'node:child_process';
import type { Config } from './config.js';
import type { LoadedFile } from './files.js';

/** Icons of the installed app: the logo, resized on request. */
export const PWA_ICON_PREFIX = '/visio-assets/pwa/';

interface IconSpec {
  size: number;
  maskable: boolean;
}
const ICON_SPECS: Record<string, IconSpec> = {
  'icon-192.png': { size: 192, maskable: false },
  'icon-512.png': { size: 512, maskable: false },
  'icon-maskable-512.png': { size: 512, maskable: true },
};

export interface PwaIcons {
  /** The icon `name`, or undefined if there is no such icon or it could not be made. */
  get(name: string): Promise<LoadedFile | undefined>;
}

/** What `magick` is asked, as arguments (no shell involved). */
export function iconArgs(logoFile: string, { size, maskable }: IconSpec, backgroundColor: string): string[] {
  // The adaptive icon keeps the logo inside the central 80%: platforms crop its edges.
  const content = maskable ? Math.round(size * 0.8) : size;
  return [
    '-background', 'none',
    '-density', '512', // sharp rasterization of a vector logo
    `${logoFile}[0]`, // first frame of an animated image
    '-resize', `${content}x${content}`,
    '-gravity', 'center',
    ...(maskable ? ['-background', backgroundColor] : []),
    '-extent', `${size}x${size}`,
    ...(maskable ? ['-alpha', 'remove', '-alpha', 'off'] : []),
    'png:-',
  ];
}

function runMagick(args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile('magick', args, { encoding: 'buffer', maxBuffer: 8 * 1024 * 1024, timeout: 20_000 }, (err, stdout) =>
      err ? reject(err) : resolve(stdout),
    );
  });
}

/**
 * Lazy: an icon is made when it is first requested (ImageMagick, which reads png, jpg, webp,
 * gif and svg) and kept in memory; later requests are answered from the memory only. Requests
 * arriving while it is being made wait for the same result. A failure is not kept.
 */
export function createPwaIcons(
  logoFile: string,
  backgroundColor: string,
  resize: (args: string[]) => Promise<Buffer> = runMagick,
): PwaIcons {
  const cache = new Map<string, Promise<LoadedFile>>();
  return {
    async get(name) {
      const spec = Object.hasOwn(ICON_SPECS, name) ? ICON_SPECS[name] : undefined;
      if (!spec) return undefined;
      let icon = cache.get(name);
      if (!icon) {
        const pending = resize(iconArgs(logoFile, spec, backgroundColor)).then(
          (data): LoadedFile => ({ data, contentType: 'image/png' }),
        );
        icon = pending;
        cache.set(name, pending);
        pending.catch(() => cache.delete(name));
      }
      try {
        return await icon;
      } catch (err) {
        console.error(`could not make the app icon ${name} (is ImageMagick installed?):`, err);
        return undefined;
      }
    },
  };
}

/** Web app manifest: name, colors and icons follow the host's settings. */
export function buildManifest(config: Config) {
  const icon = (file: string, size: number, purpose: string) => ({
    src: PWA_ICON_PREFIX + file,
    type: 'image/png',
    sizes: `${size}x${size}`,
    purpose,
  });
  return {
    name: config.brandName,
    short_name:
      config.shortName ?? (config.brandName.length > 12 ? config.brandName.slice(0, 12).trim() : config.brandName),
    lang: config.defaultLocale,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: config.backgroundColor,
    theme_color: config.themeColor,
    icons: [
      icon('icon-192.png', 192, 'any'),
      icon('icon-512.png', 512, 'any'),
      icon('icon-maskable-512.png', 512, 'maskable'),
    ],
  };
}
