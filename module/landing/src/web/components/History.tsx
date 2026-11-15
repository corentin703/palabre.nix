import { useI18n } from '../i18n';
import type { HistoryItem } from '../room-storage';

interface Props {
  items: HistoryItem[];
  onClear(): void;
}

/** The latest meetings of this device; the link keeps the moderator key. */
export function History({ items, onClear }: Props) {
  const { t, locale } = useI18n();
  if (items.length === 0) return null;

  const format = new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <section className="history" id="history">
      <h2>{t.history.title}</h2>
      <ul>
        {items.map((item) => (
          <li key={item.slug}>
            <a href={`/r/${encodeURIComponent(item.slug)}${item.mod ? `?m=${encodeURIComponent(item.mod)}` : ''}`}>
              {item.title || item.slug}
            </a>
            <time>{format.format(item.at)}</time>
          </li>
        ))}
      </ul>
      <p className="note">{t.history.note}</p>
      <button type="button" className="clear" onClick={onClear}>
        {t.history.clear}
      </button>
    </section>
  );
}
