import { useRef, useState } from 'react';
import { useI18n } from '../i18n';

interface Props {
  id: string;
  label: string;
  value: string;
  note?: string;
}

/** A read-only link, with its "Copy" button. */
export function CopyField({ id, label, value, note }: Props) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

  async function copy() {
    input.current?.select();
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      document.execCommand('copy');
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="share-row">
        <input id={id} ref={input} type="text" readOnly value={value} onFocus={(e) => e.currentTarget.select()} />
        <button type="button" onClick={copy}>
          {copied ? t.share.copied : t.share.copy}
        </button>
      </div>
      {note && <p className="note">{note}</p>}
    </div>
  );
}
