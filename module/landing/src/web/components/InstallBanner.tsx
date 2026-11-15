import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';

/** `beforeinstallprompt` exists in Chromium browsers only (Chrome, Edge, Opera, Brave...). */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'visio:install-dismissed';

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Invites the visitor to install the app. Shown only when the browser itself says the app is
 * installable (the event never fires in Firefox, nor once the app is installed), and not again
 * after the visitor closed it.
 */
export function InstallBanner() {
  const { t } = useI18n();
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    if (wasDismissed()) return;
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => setPrompt(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!prompt) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // Not remembered: the banner comes back on the next visit.
    }
    setPrompt(null);
  };

  const install = async () => {
    await prompt.prompt();
    await prompt.userChoice;
    // The prompt can only be used once, whatever the answer.
    setPrompt(null);
  };

  return (
    <div className="banner install-banner" role="region" aria-label={t.install.title}>
      <span>{t.install.text}</span>
      <span className="install-actions">
        <button type="button" onClick={() => void install()}>
          {t.install.action}
        </button>
        <button type="button" className="link-button" onClick={dismiss}>
          {t.install.dismiss}
        </button>
      </span>
    </div>
  );
}
