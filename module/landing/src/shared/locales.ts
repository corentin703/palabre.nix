/** Interface languages. To add one: here, then web/i18n/<code>.ts and web/i18n/index.tsx. */
export const LOCALES = ['fr', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** Language code of the PlugNMeet client (`lng` parameter of the meeting address). */
export const PLUGNMEET_LANGUAGES: Record<Locale, string> = {
  fr: 'fr-FR',
  en: 'en-US',
};
