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
    cssFile: env['LANDING_CSS_FILE'] || undefined,
    logoFile: env['LANDING_LOGO_FILE'] || undefined,
  };
}
