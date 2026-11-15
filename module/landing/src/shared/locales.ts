/** Langues de l'interface. Pour en ajouter une : ici, puis web/i18n/<code>.ts et web/i18n/index.ts. */
export const LOCALES = ['fr', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** Code de langue du client PlugNMeet (paramètre `lng` de l'adresse de la réunion). */
export const PLUGNMEET_LANGUAGES: Record<Locale, string> = {
  fr: 'fr-FR',
  en: 'en-US',
};
