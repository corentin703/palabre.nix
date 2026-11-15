import { createContext, Fragment, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { LOCALES, isLocale } from '../../shared/locales';
import type { Locale } from '../../shared/locales';
import { en } from './en';
import { fr } from './fr';
import type { Messages } from './fr';

const MESSAGES: Record<Locale, Messages> = { fr, en };
const STORAGE_KEY = 'visio:locale';

/** Language picked on this device, otherwise the first browser language we can translate. */
function detectLocale(fallback: Locale): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    // localStorage may be unavailable (private browsing).
  }
  for (const language of navigator.languages) {
    const code = language.slice(0, 2).toLowerCase();
    if (isLocale(code)) return code;
  }
  return fallback;
}

interface I18n {
  locale: Locale;
  t: Messages;
  setLocale(locale: Locale): void;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ defaultLocale, children }: { defaultLocale: Locale; children: ReactNode }) {
  const [locale, setLocaleState] = useState(() => detectLocale(defaultLocale));
  document.documentElement.lang = locale;

  const value = useMemo<I18n>(
    () => ({
      locale,
      t: MESSAGES[locale],
      setLocale(next) {
        setLocaleState(next);
        try {
          localStorage.setItem(STORAGE_KEY, next);
        } catch {
          // The choice will not be remembered: no consequence.
        }
      },
    }),
    [locale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside <I18nProvider>');
  return value;
}

/** Language choice: one button per language. */
export function LocaleSwitcher() {
  const { locale, setLocale } = useI18n();
  return (
    <nav className="locale-switch" aria-label="Language">
      {LOCALES.map((code) => (
        <button
          key={code}
          type="button"
          lang={code}
          aria-pressed={code === locale}
          onClick={() => setLocale(code)}
        >
          {MESSAGES[code].localeName}
        </button>
      ))}
    </nav>
  );
}

const TAGS = /<(b|em)>(.*?)<\/\1>/g;

/** A text from the dictionaries, with its <b> and <em> tags rendered (never raw HTML). */
export function Rich({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(TAGS)) {
    nodes.push(text.slice(last, match.index));
    nodes.push(match[1] === 'b' ? <strong key={match.index}>{match[2]}</strong> : <em key={match.index}>{match[2]}</em>);
    last = match.index + match[0].length;
  }
  nodes.push(text.slice(last));
  return (
    <>
      {nodes.map((node, i) => (
        <Fragment key={i}>{node}</Fragment>
      ))}
    </>
  );
}
