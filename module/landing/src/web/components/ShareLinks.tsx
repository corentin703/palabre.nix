import { useI18n } from '../i18n';
import { CopyField } from './CopyField';

interface Props {
  /** Room identifier ("name-tag"). */
  roomId: string;
  /** Moderator key; empty for a regular participant. */
  mod: string;
}

/** The two links of a room: the one to send to participants, and the moderator link. */
export function ShareLinks({ roomId, mod }: Props) {
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
    </section>
  );
}
