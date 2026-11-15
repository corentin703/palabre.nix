import { isLocale } from '../shared/locales.js';
import type { Locale } from '../shared/locales.js';

/** Configuration read from the environment (see services.palabre.landing.* and landing.nix). */
export interface Config {
  port: number;
  bindHost: string;
  /** Public URL: only for the browser redirect. */
  plugnmeetHost: string;
  /**
   * Internal URL for server-to-server API calls. Going through the public URL from the
   * container fails (ECONNREFUSED on the host's own public IP, seen in production).
   */
  plugnmeetApiUrl: string;
  plugnmeetApiKey: string;
  plugnmeetSecret: string;
  /** Absent: the /admin panel is disabled. */
  adminToken: string | undefined;
  defaultLocale: Locale;
  brandName: string;
  themeColor: string;
  /** Installed app: short name (home screen) and splash screen color. */
  pwa: boolean;
  shortName: string | undefined;
  backgroundColor: string;
  cssFile: string | undefined;
  logoFile: string | undefined;
}

export class ConfigError extends Error {}

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const plugnmeetHost = env['PLUGNMEET_HOST'];
  const plugnmeetApiKey = env['PLUGNMEET_API_KEY'];
  const plugnmeetSecret = env['PLUGNMEET_SECRET'];
  if (!plugnmeetHost || !plugnmeetApiKey || !plugnmeetSecret) {
    throw new ConfigError('PLUGNMEET_HOST, PLUGNMEET_API_KEY and PLUGNMEET_SECRET are required');
  }
  if (env['LANDING_PWA'] === '1' && !env['LANDING_LOGO_FILE']) {
    throw new ConfigError('LANDING_PWA=1 requires LANDING_LOGO_FILE: the app icons are made from it');
  }
  const backgroundColor = env['LANDING_BACKGROUND_COLOR'] || '#ffffff';
  // Handed to ImageMagick: only a hexadecimal color is accepted.
  if (!/^#[0-9a-f]{3,8}$/i.test(backgroundColor)) {
    throw new ConfigError('LANDING_BACKGROUND_COLOR must be a hexadecimal color such as #ffffff');
  }
  return {
    port: Number(env['PORT']) || 3000,
    bindHost: env['BIND_HOST'] || '0.0.0.0',
    plugnmeetHost,
    plugnmeetApiUrl: env['PLUGNMEET_API_URL'] || plugnmeetHost,
    plugnmeetApiKey,
    plugnmeetSecret,
    adminToken: env['ADMIN_TOKEN'] || undefined,
    defaultLocale: isLocale(env['LANDING_DEFAULT_LOCALE']) ? env['LANDING_DEFAULT_LOCALE'] : 'fr',
    brandName: env['LANDING_BRAND_NAME'] || 'Visioconférence',
    themeColor: env['LANDING_THEME_COLOR'] || '#1f3a5f',
    pwa: env['LANDING_PWA'] === '1',
    shortName: env['LANDING_SHORT_NAME'] || undefined,
    backgroundColor,
    cssFile: env['LANDING_CSS_FILE'] || undefined,
    logoFile: env['LANDING_LOGO_FILE'] || undefined,
  };
}
