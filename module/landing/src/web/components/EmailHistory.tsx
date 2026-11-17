import { useI18n } from '../i18n';

interface Props {
  /** Addresses the links were already sent to (newest first). */
  emails: string[];
  onPick(email: string): void;
}

/** Selector of the addresses used before; nothing if there are none. */
export function EmailHistory({ emails, onPick }: Props) {
  const { t } = useI18n();
  if (emails.length === 0) return null;
  return (
    <select
      className="email-history"
      aria-label={t.share.emailHistory}
      value=""
      onChange={(e) => e.target.value && onPick(e.target.value)}
    >
      <option value="" disabled>
        {t.share.emailHistory}
      </option>
      {emails.map((email) => (
        <option key={email} value={email}>
          {email}
        </option>
      ))}
    </select>
  );
}
