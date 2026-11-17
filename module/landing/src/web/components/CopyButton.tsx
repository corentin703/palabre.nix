import { useState } from 'react';
import { useI18n } from '../i18n';

/** A button that copies a text, and says so for a moment. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard unavailable (insecure page): nothing to fall back on here.
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button type="button" className="ghost" onClick={() => void copy()}>
      {copied ? t.admin.copied : label}
    </button>
  );
}
