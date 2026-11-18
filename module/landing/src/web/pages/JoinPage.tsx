import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { RoomKey, RuntimeConfig } from '../../shared/api';
import { ROOM_ID_RE, ROOM_NAME_MAX, slugifyRoomId } from '../../shared/slug';
import { ApiFailure, getRoomInfo, getRoomKey, joinRoom, lockRoom } from '../api';
import { Guide } from '../components/Guide';
import { InstallBanner } from '../components/InstallBanner';
import { History } from '../components/History';
import { EmailLinks, ShareLinks } from '../components/ShareLinks';
import { LocaleSwitcher, useI18n } from '../i18n';
import { errorMessage } from '../i18n/errors';
import {
  clearHistory,
  findRoomKey,
  loadHistory,
  loadName,
  rememberMeeting,
  saveName,
  markMailed,
  saveRoomKey,
  wasMailed,
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
 *
 * A key kept on this device from an earlier visit is asked about first: the server may no
 * longer recognise it (its secret changed), and a key it does not recognise would make a
 * moderator link that does not work, and a creator who is not a moderator of their own room.
 * Only a key the server has just confirmed is shown or used.
 */
function useRoomKey(roomInput: string, enabled: boolean) {
  const name = enabled ? slugifyRoomId(roomInput, ROOM_NAME_MAX) : '';
  const [, refresh] = useState(0);
  const pending = useRef(new Map<string, Promise<RoomKey | null>>());
  const confirmed = useRef(new Set<string>());

  const obtain = useCallback((forName: string): Promise<RoomKey | null> => {
    if (confirmed.current.has(forName)) return Promise.resolve(findRoomKey(forName));
    let request = pending.current.get(forName);
    if (!request) {
      request = (async () => {
        const known = findRoomKey(forName);
        // The server may be unable to answer: then the key is kept as it is.
        const recognised = known
          ? await getRoomInfo(`${forName}-${known.tag}`, known.mod).then(
              (info) => info.moderator,
              () => true,
            )
          : false;
        const key = known && recognised ? known : await getRoomKey();
        if (key !== known) saveRoomKey(forName, key);
        confirmed.current.add(forName);
        return key;
      })()
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
    if (!name || confirmed.current.has(name)) return;
    const timer = setTimeout(() => void obtain(name), 450);
    return () => clearTimeout(timer);
  }, [name, obtain]);

  return { name, key: name && confirmed.current.has(name) ? findRoomKey(name) : null, obtain };
}

export default function JoinPage({ config }: { config: RuntimeConfig }) {
  const { t, locale } = useI18n();
  const preset = useMemo(readPreset, []);
  const [roomInput, setRoomInput] = useState('');
  const [name, setName] = useState(loadName);
  const [history, setHistory] = useState(loadHistory);
  const [status, setStatus] = useState<'idle' | 'preparing' | 'connecting'>('idle');
  const [error, setError] = useState('');
  const [moderator, setModerator] = useState(false);
  const [locked, setLocked] = useState(false);
  /** Links not yet sent from this device when the page opened: they are asked for, all along the visit. */
  const [askToMail] = useState(() => preset !== null && !wasMailed(preset.room));
  const roomKey = useRoomKey(roomInput, !preset);

  // Moderator link of an existing room: the server checks the key, and we keep it so the
  // room can be recreated under the same identifier from this device.
  useEffect(() => {
    if (!preset?.mod) return;
    void getRoomInfo(preset.room, preset.mod)
      .then((info) => {
        setModerator(info.moderator);
        setLocked(info.closed);
        const parts = ROOM_ID_RE.exec(info.room);
        if (info.moderator && parts?.[1] && parts[2]) saveRoomKey(parts[1], { mod: preset.mod, tag: parts[2] });
      })
      .catch(() => setModerator(false));
  }, [preset]);

  // Links shown under the form: only on the page of an existing room (the creation page leads
  // to the moderator's own page, where they are).
  const shown = preset ? { roomId: preset.room, mod: moderator ? preset.mod : '' } : null;

  /** A moderator is urged to have the links sent by email: the moderator link cannot be found again otherwise. */
  const nudgeMail = config.mail && moderator && askToMail;

  /** The room's links, and their sending by email. */
  const shareLinks = (room: { roomId: string; mod: string }) => (
    <ShareLinks roomId={room.roomId} mod={room.mod} mail={config.mail && !nudgeMail} />
  );

  /** A moderator closes the room to new guests, or opens it again. */
  async function toggleLock() {
    if (!preset) return;
    setError('');
    try {
      setLocked((await lockRoom({ room: preset.room, mod: preset.mod, closed: !locked })).closed);
    } catch (failure) {
      setError(errorMessage(t, failure));
    }
  }

  /**
   * The meeting opens in a new tab. The tab is opened right away, on the person's click, so
   * the popup blocker lets it through; it gets its address once the meeting is ready. If the
   * browser refuses it, the meeting opens in this tab instead.
   */
  const meetingTab = useRef<Window | null>(null);
  function openMeetingTab() {
    meetingTab.current = window.open('', '_blank');
    if (meetingTab.current) meetingTab.current.opener = null;
  }
  function closeMeetingTab() {
    meetingTab.current?.close();
    meetingTab.current = null;
  }

  /** Opens the room (creating it if needed) and goes to the meeting, in the tab opened for it. */
  async function enter(room: Preset) {
    setStatus('connecting');
    try {
      const { url } = await joinRoom({ room: room.room, name, mod: room.mod, locale });
      rememberMeeting({ slug: room.room, title: room.room.replace(/-[0-9a-f]{12}$/, ''), mod: room.mod, at: Date.now() });
      saveName(name.trim());
      if (meetingTab.current) {
        meetingTab.current.location.href = url;
        meetingTab.current = null;
        // This page stays as it is, ready for another visit.
        setStatus('idle');
      } else {
        location.assign(url);
      }
    } catch (failure) {
      closeMeetingTab();
      setError(errorMessage(t, failure));
      setStatus('idle');
    }
  }

  /**
   * On a room's page: joins the meeting. On the creation page: the room is not entered, we go
   * to the moderator's own page, which has the links, the settings and the way in.
   */
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (preset) {
      openMeetingTab();
      await enter(preset);
      return;
    }
    try {
      // Room key not confirmed yet: we ask for it now rather than wait for the pause.
      if (!roomKey.name) throw new ApiFailure('invalid_room', 400);
      if (!roomKey.key) setStatus('preparing');
      const key = roomKey.key ?? (await roomKey.obtain(roomKey.name));
      if (!key) throw new ApiFailure('join_failed', 502);
      const room = `${roomKey.name}-${key.tag}`;
      // The name is optional here; typed, it is waiting on the next page.
      saveName(name.trim());
      rememberMeeting({ slug: room, title: roomInput.trim() || roomKey.name, mod: key.mod, at: Date.now() });
      location.assign(`/r/${room}?m=${key.mod}`);
    } catch (failure) {
      setError(errorMessage(t, failure));
      setStatus('idle');
    }
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
        {preset && nudgeMail && (
          <section className="callout">
            <h2>{t.join.keepLinksTitle}</h2>
            <p>{t.join.keepLinksText}</p>
            <EmailLinks roomId={preset.room} mod={preset.mod} onSent={() => markMailed(preset.room)} />
          </section>
        )}

        <form id="join-form" onSubmit={submit}>
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
              required={preset !== null}
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

        {preset && moderator && (
          <details className="settings">
            <summary>
              {t.join.settings}
              {locked && <span className="badge">{t.join.locked}</span>}
            </summary>
            <label className="option">
              <input type="checkbox" checked={locked} onChange={() => void toggleLock()} />
              <span>
                <strong>{t.join.lockLabel}</strong>
                <span className="note">{t.join.lockHelp}</span>
              </span>
            </label>
          </details>
        )}

        {shown && shareLinks(shown)}
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
