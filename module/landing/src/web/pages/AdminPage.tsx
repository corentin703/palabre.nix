import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { ActiveRoom, RoomsListing } from '../../shared/api';
import { ApiFailure, request } from '../api';
import { LocaleSwitcher, useI18n } from '../i18n';
import { errorMessage } from '../i18n/errors';
import '../styles/admin.css';

const REFRESH_MS = 10_000;

/** Date d'un salon : PlugNMeet répond en secondes depuis 1970 ou en « AAAA-MM-JJ hh:mm:ss ». */
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

const isUnauthorized = (failure: unknown): boolean =>
  failure instanceof ApiFailure && failure.status === 401;

export default function AdminPage({ brandName }: { brandName: string }) {
  const { t, locale } = useI18n();
  const [view, setView] = useState<'checking' | 'login' | 'app'>('checking');
  const [rooms, setRooms] = useState<RoomsListing>({ active: [], past: [] });
  const [token, setToken] = useState('');
  const [loginError, setLoginError] = useState('');
  const [error, setError] = useState('');

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

  // Au chargement : si une session valide existe (cookie), on affiche la liste ; sur 401 on
  // bascule vers la connexion. Ensuite la liste se rafraîchit seule.
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

  /** Appelle une action sur un salon ; une session expirée ramène à la connexion. */
  async function act(action: () => Promise<void>) {
    try {
      await action();
    } catch (failure) {
      if (isUnauthorized(failure)) setView('login');
      else setError(errorMessage(t, failure));
    }
  }

  function joinAsModerator(room: ActiveRoom) {
    // L'onglet est ouvert tout de suite (clic de la personne) pour ne pas être bloqué par
    // l'anti-popup, puis reçoit son adresse une fois le jeton prêt.
    const tab = window.open('', '_blank');
    void act(async () => {
      try {
        const { url } = await request<{ url: string }>('/admin/api/rooms/join', { roomId: room.roomId, locale });
        if (tab) tab.location.href = url;
        else location.href = url;
      } catch (failure) {
        tab?.close();
        throw failure;
      }
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
                    <button className="ghost" onClick={() => joinAsModerator(room)}>
                      {t.admin.joinAsModerator}
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
              </tr>
            </thead>
            <tbody>
              {rooms.past.map((room) => (
                <tr key={`${room.roomId}-${room.created}`}>
                  <td>{room.title || room.roomId}</td>
                  <td>{room.participants}</td>
                  <td className="muted">{formatDate(room.created, locale)}</td>
                  <td className="muted">{formatDate(room.ended, locale)}</td>
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
