import { useState } from 'react';
import type { FormEvent } from 'react';
import { sendLinks } from '../api';
import { useI18n } from '../i18n';
import { errorMessage } from '../i18n/errors';
import { loadEmails, rememberEmail } from '../room-storage';
import { EmailHistory } from './EmailHistory';
import { CopyField } from './CopyField';

interface Props {
  /** Room identifier ("name-tag"). */
  roomId: string;
  /** Moderator key; empty for a regular participant. */
  mod: string;
  /** The server can send the links by email. */
  mail?: boolean;
  /** The links were just sent by email. */
  onMailSent?: () => void;
}

/** The two links of a room: the one to send to participants, and the moderator link. */
export function ShareLinks({ roomId, mod, mail = false, onMailSent }: Props) {
  const { t } = useI18n();
  const participantsUrl = `${location.origin}/r/${roomId}`;
  return (
    <section className="share" id="share">
      <CopyField id="share-link" label={t.share.participantsLink} value={participantsUrl} />
      {mod && (
        <CopyField
          id="mod-link"
          label={t.share.moderatorLink}
          value={`${participantsUrl}?m=${mod}`}
          note={t.share.moderatorNote}
        />
      )}
      {mail && mod && <EmailLinks roomId={roomId} mod={mod} {...(onMailSent ? { onSent: onMailSent } : {})} />}
    </section>
  );
}

/** "Send me the links": two separate mails, one with the invitation link, one with the moderator link. */
function EmailLinks({ roomId, mod, onSent }: { roomId: string; mod: string; onSent?: () => void }) {
  const { t, locale } = useI18n();
  const [history, setHistory] = useState(loadEmails);
  const [email, setEmail] = useState(() => loadEmails()[0] ?? '');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setStatus('sending');
    try {
      await sendLinks({ room: roomId, mod, email: email.trim(), locale });
      rememberEmail(email);
      setHistory(loadEmails());
      setStatus('sent');
      onSent?.();
    } catch (failure) {
      setError(errorMessage(t, failure));
      setStatus('idle');
    }
  }

  return (
    <form className="field email-links" onSubmit={submit}>
      <label htmlFor="email-links">{t.share.emailLabel}</label>
      <div className="share-row">
        <input
          id="email-links"
          type="email"
          required
          autoComplete="email"
          placeholder={t.share.emailPlaceholder}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setStatus('idle');
            setError('');
          }}
        />
        <button type="submit" disabled={status === 'sending'}>
          {status === 'sending' ? t.share.emailSending : t.share.emailSend}
        </button>
      </div>
      <EmailHistory
        emails={history}
        onPick={(picked) => {
          setEmail(picked);
          setStatus('idle');
          setError('');
        }}
      />
      {status === 'sent' && (
        <p className="note" role="status">
          {t.share.emailSent}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p className="note">{t.share.emailNote}</p>
    </form>
  );
}
