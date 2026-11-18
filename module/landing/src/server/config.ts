import { isLocale } from '../shared/locales.js';
import type { Locale } from '../shared/locales.js';
import type { SmtpConfig } from './smtp.js';

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
  /**
   * Secret the moderator keys are derived from (ROOM_KEY_SECRET). Distinct from the PlugNMeet
   * secret so that one never has to change, or leak, with the other; it falls back to the
   * PlugNMeet secret when not given, which keeps the links issued before it existed valid.
   */
  roomKeySecret: string;
  /** Where the closed rooms are remembered across restarts; absent: only until the next restart. */
  closedRoomsFile: string | undefined;
  /** Most rooms open at the same time: past it, nobody can start a new one (MAX_ROOMS). */
  maxRooms: number;
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
  /** Absent: the links cannot be sent by email. */
  mail: SmtpConfig | undefined;
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
  const maxRooms = env['MAX_ROOMS'] === undefined || env['MAX_ROOMS'] === '' ? 20 : Number(env['MAX_ROOMS']);
  if (!Number.isInteger(maxRooms) || maxRooms < 1) throw new ConfigError('MAX_ROOMS must be a positive integer');
  const backgroundColor = env['LANDING_BACKGROUND_COLOR'] || '#ffffff';
  // Handed to ImageMagick: only a hexadecimal color is accepted.
  if (!/^#[0-9a-f]{3,8}$/i.test(backgroundColor)) {
    throw new ConfigError('LANDING_BACKGROUND_COLOR must be a hexadecimal color such as #ffffff');
  }
  // Usual spellings of the same three modes (Vaultwarden's "force_tls" and "off", for instance).
  const securityNames: Record<string, SmtpConfig['security']> = {
    tls: 'tls',
    ssl: 'tls',
    force_tls: 'tls',
    starttls: 'starttls',
    none: 'none',
    off: 'none',
  };
  const security = securityNames[(env['MAIL_SECURITY'] || 'starttls').trim().toLowerCase()];
  if (!security) throw new ConfigError('MAIL_SECURITY must be tls, starttls or none');
  const mailHost = env['MAIL_HOST'];
  const mailFrom = env['MAIL_FROM'];
  if (mailHost && !mailFrom) throw new ConfigError('MAIL_HOST requires MAIL_FROM');
  const mail: SmtpConfig | undefined =
    mailHost && mailFrom
      ? {
          host: mailHost,
          port: Number(env['MAIL_PORT']) || (security === 'tls' ? 465 : 587),
          security,
          user: env['MAIL_USER'] || undefined,
          password: env['MAIL_PASSWORD'] || undefined,
          from: mailFrom,
        }
      : undefined;
  return {
    port: Number(env['PORT']) || 3000,
    bindHost: env['BIND_HOST'] || '0.0.0.0',
    plugnmeetHost,
    plugnmeetApiUrl: env['PLUGNMEET_API_URL'] || plugnmeetHost,
    plugnmeetApiKey,
    plugnmeetSecret,
    roomKeySecret: env['ROOM_KEY_SECRET'] || plugnmeetSecret,
    maxRooms,
    closedRoomsFile: env['CLOSED_ROOMS_FILE'] || undefined,
    adminToken: env['ADMIN_TOKEN'] || undefined,
    defaultLocale: isLocale(env['LANDING_DEFAULT_LOCALE']) ? env['LANDING_DEFAULT_LOCALE'] : 'fr',
    brandName: env['LANDING_BRAND_NAME'] || 'Visioconférence',
    themeColor: env['LANDING_THEME_COLOR'] || '#1f3a5f',
    pwa: env['LANDING_PWA'] === '1',
    shortName: env['LANDING_SHORT_NAME'] || undefined,
    backgroundColor,
    cssFile: env['LANDING_CSS_FILE'] || undefined,
    logoFile: env['LANDING_LOGO_FILE'] || undefined,
    mail,
  };
}
