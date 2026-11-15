import { Rich, useI18n } from '../i18n';

interface Props {
  /** Page of an existing room (shareable link) rather than a creation page. */
  preset: boolean;
  moderator: boolean;
}

function Steps({ items }: { items: string[] }) {
  return (
    <>
      {items.map((text) => (
        <li key={text}>
          <Rich text={text} />
        </li>
      ))}
    </>
  );
}

function Help({ items }: { items: string[] }) {
  return (
    <ul className="help">
      {items.map((text) => (
        <li key={text}>
          <Rich text={text} />
        </li>
      ))}
    </ul>
  );
}

/** The user guide, next to the form. */
export function Guide({ preset, moderator }: Props) {
  const { t } = useI18n();
  const g = t.guide;
  return (
    <section className="guide">
      <h2>{g.title}</h2>
      <ol className="steps">
        <Steps items={preset ? g.stepsExisting : g.stepsNew} />
        <Steps items={g.stepsCommon} />
      </ol>

      {preset ? (
        <>
          <h3>{g.whoModerates}</h3>
          <p>
            <Rich text={moderator ? g.moderatorOfThisRoom : g.participantOfThisRoom} />
          </p>
        </>
      ) : (
        <>
          <h3>{g.twoLinks}</h3>
          <p>
            <Rich text={g.twoLinksIntro} />
          </p>
          <Help items={[g.participantsLinkRole, g.moderatorLinkRole]} />
          <h3>{g.whyKeepTitle}</h3>
          {[g.whyKeep1, g.whyKeep2, g.whyKeep3].map((text) => (
            <p key={text}>
              <Rich text={text} />
            </p>
          ))}
        </>
      )}

      <h3>{g.troubleTitle}</h3>
      <Help items={[g.troubleNoSound, g.troubleNoHearing, g.troubleFrozen]} />
      <h3>{g.leaveTitle}</h3>
      <p>{g.leave}</p>
      <p className="note">{g.leaveNote}</p>
    </section>
  );
}
