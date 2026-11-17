import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { ActiveRoom, GeneratedLinks, RoomsListing } from '../../shared/api';
import { CopyField } from '../components/CopyField';
import { ApiFailure, request } from '../api';
import { CopyButton } from '../components/CopyButton';
import { LocaleSwitcher, useI18n } from '../i18n';
import { errorMessage } from '../i18n/errors';
import '../styles/admin.css';

const REFRESH_MS = 10_000;

/** Date of a room: PlugNMeet answers in seconds since 1970 or as "YYYY-MM-DD hh:mm:ss". */
function formatDate(value: string, locale: string): string {
  if (!value || value === '0000-00-00 00:00:00') return '';
  const date = /^[0-9]+$/.test(value) ? new Date(Number(value) * 1000) : new Date(value.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Invitation link and moderator link of a room, as copy buttons. */
function RoomLinks({ roomId, mod }: { roomId: string; mod: string }) {
  const { t } = useI18n();
  const url = `${location.origin}/r/${roomId}`;
  return (
    <>
      <CopyButton value={url} label={t.admin.copyInvitation} />
      {mod && <CopyButton value={`${url}?m=${mod}`} label={t.admin.copyModerator} />}
    </>
  );
}

const isUnauthorized = (failure: unknown): boolean =>
  failure instanceof ApiFailure && failure.status === 401;

export default function AdminPage({ brandName }: { brandName: string }) {
  const { t, locale } = useI18n();
  const [view, setView] = useState<'checking' | 'login' | 'app'>('checking');
  const [rooms, setRooms] = useState<RoomsListing>({ active: [], past: [] });
  const [token, setToken] = useState('');
  const [loginError, setLoginError] = useState('');
  const [error, setError] = useState('');
  const [linkName, setLinkName] = useState('');
  const [links, setLinks] = useState<GeneratedLinks | null>(null);

  document.title = `${t.admin.title} - ${brandName}`;

  const load = useCallback(async () => {
    try {
      setRooms(await request<RoomsListing>('/admin/api/rooms'));
      setError('');
      setView('app');
    } catch (failure) {
      if (isUnauthorized(failure)) setView('login');
      else {
        setError(errorMessage(t, failure));
        setView('app');
      }
    }
  }, [t]);

  // On load: if a valid session exists (cookie), the list is shown; on 401 we switch to the
  // login. After that the list refreshes by itself.
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (view !== 'app') return;
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [view, load]);

  async function login(event: FormEvent) {
    event.preventDefault();
    setLoginError('');
    try {
      await request('/admin/login', { token });
      setToken('');
      await load();
    } catch (failure) {
      setLoginError(errorMessage(t, failure));
    }
  }

  async function logout() {
    await request('/admin/logout', {}).catch(() => undefined);
    setView('login');
  }

  /** Calls an action on a room; an expired session sends back to the login. */
  async function act(action: () => Promise<void>) {
    try {
      await action();
    } catch (failure) {
      if (isUnauthorized(failure)) setView('login');
      else setError(errorMessage(t, failure));
    }
  }

  function joinAsModerator(room: ActiveRoom, observer = false) {
    // The tab is opened right away (the person's click) so the popup blocker does not stop it,
    // then receives its address once the token is ready.
    const tab = window.open('', '_blank');
    void act(async () => {
      try {
        const { url } = await request<{ url: string }>(observer ? '/admin/api/rooms/observe' : '/admin/api/rooms/join', {
          roomId: room.roomId,
          locale,
        });
        if (tab) tab.location.href = url;
        else location.href = url;
      } catch (failure) {
        tab?.close();
        throw failure;
      }
    });
  }

  function generateLinks(event: FormEvent) {
    event.preventDefault();
    void act(async () => {
      setLinks(await request<GeneratedLinks>('/admin/api/links', { name: linkName }));
      setError('');
    });
  }

  function closeRoom(room: ActiveRoom) {
    if (!confirm(t.admin.confirmClose(room.title || room.roomId))) return;
    void act(async () => {
      await request('/admin/api/rooms/end', { roomId: room.roomId, locale });
      await load();
    });
  }

  if (view === 'checking') return null;

  if (view === 'login') {
    return (
      <main>
        <section className="card">
          <span className="eyebrow">{brandName}</span>
          <h1>{t.admin.title}</h1>
          <form className="login-form" onSubmit={login}>
            <label htmlFor="token" className="muted">
              {t.admin.token}
            </label>
            <input
              id="token"
              type="password"
              autoComplete="off"
              required
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            {loginError && <p className="error">{loginError}</p>}
            <button type="submit">{t.admin.login}</button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main>
      <section className="card bar">
        <div>
          <span className="eyebrow">{brandName}</span>
          <h1>{t.admin.title}</h1>
        </div>
        <div>
          <LocaleSwitcher />
          <button className="ghost" onClick={() => void load()}>
            {t.admin.refresh}
          </button>
          <button className="ghost" onClick={() => void logout()}>
            {t.admin.logout}
          </button>
        </div>
      </section>
      {error && <p className="error">{error}</p>}

      <section className="card">
        <h2>{t.admin.newLinks}</h2>
        <p className="muted">{t.admin.newLinksHelp}</p>
        <form onSubmit={generateLinks}>
          <label htmlFor="link-name" className="muted">
            {t.admin.roomName}
          </label>
          <input
            id="link-name"
            type="text"
            required
            maxLength={128}
            value={linkName}
            onChange={(e) => setLinkName(e.target.value)}
          />
          <button type="submit">{t.admin.generate}</button>
        </form>
        {links && (
          <div className="share">
            <CopyField
              id="share-link"
              label={t.share.participantsLink}
              value={`${location.origin}/r/${links.roomId}`}
            />
            <CopyField
              id="mod-link"
              label={t.share.moderatorLink}
              value={`${location.origin}/r/${links.roomId}?m=${links.mod}`}
              note={t.share.moderatorNote}
            />
          </div>
        )}
      </section>

      <section className="card">
        <h2>
          {t.admin.activeRooms} ({rooms.active.length})
        </h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t.admin.room}</th>
                <th>{t.admin.participants}</th>
                <th>{t.admin.created}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rooms.active.map((room) => (
                <tr key={room.roomId}>
                  <td>
                    <strong>{room.title || room.roomId}</strong>
                    <div className="names">{room.roomId}</div>
                  </td>
                  <td>
                    {room.participants.length}
                    {room.participants.length > 0 && <div className="names">{room.participants.join(', ')}</div>}
                  </td>
                  <td>{formatDate(room.created, locale)}</td>
                  <td className="actions">
                    <RoomLinks roomId={room.roomId} mod={room.mod} />{' '}
                    <button className="ghost" onClick={() => joinAsModerator(room)}>
                      {t.admin.joinAsModerator}
                    </button>{' '}
                    <button className="ghost" onClick={() => joinAsModerator(room, true)} title={t.admin.observeHelp}>
                      {t.admin.observe}
                    </button>{' '}
                    <button onClick={() => closeRoom(room)}>{t.admin.closeRoom}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rooms.active.length === 0 && <p className="muted">{t.admin.noActiveRoom}</p>}
      </section>

      <section className="card">
        <h2>{t.admin.pastRooms}</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t.admin.room}</th>
                <th>{t.admin.participants}</th>
                <th>{t.admin.created}</th>
                <th>{t.admin.ended}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rooms.past.map((room) => (
                <tr key={`${room.roomId}-${room.created}`}>
                  <td>{room.title || room.roomId}</td>
                  <td>{room.participants}</td>
                  <td className="muted">{formatDate(room.created, locale)}</td>
                  <td className="muted">{formatDate(room.ended, locale)}</td>
                  <td className="actions">
                    <RoomLinks roomId={room.roomId} mod={room.mod} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rooms.past.length === 0 && <p className="muted">{t.admin.noPastRoom}</p>}
      </section>
    </main>
  );
}
