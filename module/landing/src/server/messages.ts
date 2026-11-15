import type { Locale } from '../shared/locales.js';

// The only texts the server writes itself: they go to PlugNMeet, not to the page.
// All the rest of the interface is translated in the browser (web/i18n).

const GUEST_NAME: Record<Locale, string> = {
  fr: 'Invité',
  en: 'Guest',
};

const ADMIN_NAME: Record<Locale, string> = {
  fr: 'Administration',
  en: 'Administration',
};

const WELCOME: Record<Locale, (roomTitle: string) => string> = {
  fr: (title) => `Soyez les bienvenus dans le salon ${title}.`,
  en: (title) => `Welcome to the ${title} room.`,
};

export const guestName = (locale: Locale): string => GUEST_NAME[locale];
export const adminName = (locale: Locale): string => ADMIN_NAME[locale];
export const welcomeMessage = (locale: Locale, roomTitle: string): string => WELCOME[locale](roomTitle);
