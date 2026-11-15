import { useI18n } from '../i18n';
import { CopyField } from './CopyField';

interface Props {
  /** Identifiant du salon (« nom-empreinte »). */
  roomId: string;
  /** Clé de modérateur ; vide pour un simple participant. */
  mod: string;
}

/** Les deux liens d'un salon : à transmettre aux participants, et le lien de modérateur. */
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
