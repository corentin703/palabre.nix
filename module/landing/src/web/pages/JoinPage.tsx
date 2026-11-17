import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { RoomKey, RuntimeConfig } from '../../shared/api';
import { ROOM_ID_RE, ROOM_NAME_MAX, slugifyRoomId } from '../../shared/slug';
import { getRoomInfo, getRoomKey, joinRoom, sendLinks } from '../api';
import { Guide } from '../components/Guide';
import { InstallBanner } from '../components/InstallBanner';
import { History } from '../components/History';
import { ShareLinks } from '../components/ShareLinks';
import { LocaleSwitcher, useI18n } from '../i18n';
import { errorMessage } from '../i18n/errors';
import {
  clearHistory,
  findRoomKey,
  loadHistory,
  loadName,
  rememberMeeting,
  saveName,
  saveRoomKey,
} from '../room-storage';
import '../styles/page.css';

/** Link to an existing room: /r/<room>, with the moderator key, if any, in ?m=. */
interface Preset {
  room: string;
  mod: string;
}

function readPreset(): Preset | null {
  const encoded = /^\/r\/([^/]+)$/.exec(location.pathname)?.[1];
  if (!encoded) return null;
  let decoded = '';
  try {
    decoded = decodeURIComponent(encoded);
  } catch {
    // Invalid identifier: treated as a creation page.
  }
  const room = slugifyRoomId(decoded);
  return room ? { room, mod: new URLSearchParams(location.search).get('m') ?? '' } : null;
}

/**
 * Moderator key of the room whose name is being typed: requested from the server (which
 * guarantees its tag), once per name, after a short typing pause.
 */
function useRoomKey(roomInput: string, enabled: boolean) {
  const name = enabled ? slugifyRoomId(roomInput, ROOM_NAME_MAX) : '';
  const [, refresh] = useState(0);
  const pending = useRef(new Map<string, Promise<RoomKey | null>>());

  const obtain = useCallback((forName: string): Promise<RoomKey | null> => {
    const known = findRoomKey(forName);
    if (known) return Promise.resolve(known);
    let request = pending.current.get(forName);
    if (!request) {
      request = getRoomKey()
        .then((key) => {
          saveRoomKey(forName, findRoomKey(forName) ?? key);
          return findRoomKey(forName);
        })
        .catch(() => null)
        .finally(() => {
          pending.current.delete(forName);
          refresh((n) => n + 1);
        });
      pending.current.set(forName, request);
    }
    return request;
  }, []);

  useEffect(() => {
    if (!name || findRoomKey(name)) return;
    const timer = setTimeout(() => void obtain(name), 450);
    return () => clearTimeout(timer);
  }, [name, obtain]);

  return { name, key: name ? findRoomKey(name) : null, obtain };
}

export default function JoinPage({ config }: { config: RuntimeConfig }) {
  const { t, locale } = useI18n();
  const preset = useMemo(readPreset, []);
  const [roomInput, setRoomInput] = useState('');
  const [name, setName] = useState(loadName);
  const [history, setHistory] = useState(loadHistory);
  const [status, setStatus] = useState<'idle' | 'preparing' | 'connecting'>('idle');
  const [error, setError] = useState('');
  const [askMail, setAskMail] = useState<{ roomId: string; mod: string } | null>(null);
  const [mailAddress, setMailAddress] = useState('');
  const [mailSent, setMailSent] = useState(false);
  const [moderator, setModerator] = useState(false);
  const roomKey = useRoomKey(roomInput, !preset);

  // Moderator link of an existing room: the server checks the key, and we keep it so the
  // room can be recreated under the same identifier from this device.
  useEffect(() => {
    if (!preset?.mod) return;
    void getRoomInfo(preset.room, preset.mod)
      .then((info) => {
        setModerator(info.moderator);
        const parts = ROOM_ID_RE.exec(info.room);
        if (info.moderator && parts?.[1] && parts[2]) saveRoomKey(parts[1], { mod: preset.mod, tag: parts[2] });
      })
      .catch(() => setModerator(false));
  }, [preset]);

  // Room shown under the form: its identifier and the moderator key, if any.
  const shown = preset
    ? { roomId: preset.room, mod: moderator ? preset.mod : '' }
    : roomKey.key
      ? { roomId: `${roomKey.name}-${roomKey.key.tag}`, mod: roomKey.key.mod }
      : null;

  /** Opens the room (creating it if needed) and goes to the meeting. */
  async function enter(roomId: string, mod: string) {
    setStatus('connecting');
    try {
      const { url } = await joinRoom({
        room: roomId || roomInput,
        name,
        mod,
        locale,
        ...(preset ? {} : { title: roomInput.trim() }),
      });
      if (roomId) {
        rememberMeeting({ slug: roomId, title: roomInput.trim() || roomId.replace(/-[0-9a-f]{12}$/, ''), mod, at: Date.now() });
      }
      saveName(name.trim());
      location.assign(url);
    } catch (failure) {
      setError(errorMessage(t, failure));
      setStatus('idle');
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      // Room key not received yet: we ask for it now rather than wait for the pause.
      let key = roomKey.key;
      if (!preset && !key && roomKey.name) {
        setStatus('preparing');
        key = await roomKey.obtain(roomKey.name);
      }
      const mod = preset ? preset.mod : (key?.mod ?? '');
      const roomId = preset ? preset.room : key ? `${roomKey.name}-${key.tag}` : '';
      // New room, and mails are possible: before entering, offer to get the links by email.
      if (config.mail && !preset && mod && roomId) {
        setStatus('idle');
        setAskMail({ roomId, mod });
        return;
      }
      await enter(roomId, mod);
    } catch (failure) {
      setError(errorMessage(t, failure));
      setStatus('idle');
    }
  }

  /** "Send and enter": the links are sent first, then we go to the meeting. */
  async function sendThenEnter(event: FormEvent) {
    event.preventDefault();
    if (!askMail) return;
    setError('');
    setStatus('connecting');
    try {
      await sendLinks({ room: askMail.roomId, mod: askMail.mod, email: mailAddress, locale });
    } catch (failure) {
      // The person stays on the question: they can fix the address, or enter without mail.
      setError(errorMessage(t, failure));
      setStatus('idle');
      return;
    }
    setMailSent(true);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await enter(askMail.roomId, askMail.mod);
  }

  const roomLabel = preset ? (ROOM_ID_RE.exec(preset.room)?.[1] ?? preset.room) : '';
  const submitLabel =
    status === 'preparing'
      ? t.join.preparing
      : status === 'connecting'
        ? t.join.connecting
        : preset
          ? t.join.submitExisting
          : t.join.submitNew;

  return (
    <main className="sheet">
      <div className="main-col">
        <LocaleSwitcher />
        <div className="brand">
          {config.hasLogo && <img src="/visio-assets/logo" alt="" width={94} height={94} />}
          <span>{config.brandName}</span>
        </div>
        <h1>{preset ? t.join.titleExisting : t.join.titleNew}</h1>
        <p className="lead">{preset ? t.join.leadExisting : t.join.leadNew}</p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {config.pwa && <InstallBanner />}
        {preset && moderator && <p className="banner">{t.join.moderatorBanner}</p>}

        {askMail && (
          <form id="mail-form" onSubmit={sendThenEnter}>
            <h2>{t.join.mailAskTitle}</h2>
            <p>{t.join.mailAskText}</p>
            <div className="field">
              <label htmlFor="mail-address">{t.share.emailLabel}</label>
              <input
                id="mail-address"
                type="email"
                required
                autoFocus
                autoComplete="email"
                placeholder={t.share.emailPlaceholder}
                value={mailAddress}
                onChange={(e) => setMailAddress(e.target.value)}
              />
            </div>
            {mailSent && (
              <p className="banner" role="status">
                {t.share.emailSent}
              </p>
            )}
            <button type="submit" id="join-button" disabled={status !== 'idle'}>
              {status === 'connecting' ? (mailSent ? t.join.connecting : t.share.emailSending) : t.join.mailAskSend}
            </button>
            <button
              type="button"
              disabled={status !== 'idle'}
              onClick={() => void enter(askMail.roomId, askMail.mod)}
            >
              {t.join.mailAskSkip}
            </button>
          </form>
        )}
        <form id="join-form" onSubmit={submit} hidden={askMail !== null}>
          {preset ? (
            <div className="field">
              <span id="room-label">
                <strong>{t.join.room}</strong>
              </span>
              <div className="room-fixed" aria-labelledby="room-label">
                {roomLabel}
              </div>
            </div>
          ) : (
            <div className="field">
              <label htmlFor="room">{t.join.roomName}</label>
              <input
                id="room"
                type="text"
                required
                maxLength={80}
                autoComplete="off"
                placeholder={t.join.roomPlaceholder}
                value={roomInput}
                onChange={(e) => setRoomInput(e.target.value)}
              />
            </div>
          )}
          <div className="field">
            <label htmlFor="name">{t.join.yourName}</label>
            <input
              id="name"
              type="text"
              required
              maxLength={64}
              autoComplete="name"
              placeholder={t.join.namePlaceholder}
              autoFocus={preset !== null}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <button type="submit" id="join-button" disabled={status !== 'idle'}>
            {submitLabel}
          </button>
        </form>
        {!preset && <p className="note">{t.join.soleModeratorNote}</p>}

        {shown && <ShareLinks roomId={shown.roomId} mod={shown.mod} mail={config.mail} />}
        <History
          items={history}
          onClear={() => {
            clearHistory();
            setHistory([]);
          }}
        />
      </div>

      <Guide preset={preset !== null} moderator={moderator} />
    </main>
  );
}
