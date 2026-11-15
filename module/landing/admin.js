'use strict';

const crypto = require('crypto');

// Panneau d'administration (/admin) : liste des salles PlugNMeet et fermeture
// manuelle. Authentification par un jeton unique (sops) échangé contre un
// cookie de session signé.

const SESSION_MAX_AGE_S = 8 * 60 * 60;
const COOKIE_NAME = 'admin_session';

// Anti force-brute sur le jeton : peu d'essais ratés par IP et par fenêtre.
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest();
}

function parseCookies(header) {
  const out = {};
  for (const part of (header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > maxBytes) {
        reject(new Error('body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

const PAGE = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Administration - __BRAND__</title>
<style>
  :root {
    color-scheme: light dark;
    --accent: #dc2626; --accent-hover: #b91c1c;
    --bg: #f4f4f5; --card-bg: #ffffff; --text: #18181b; --muted: #71717a; --border: #e4e4e7;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #0b0b0d; --card-bg: #18181b; --text: #f4f4f5; --muted: #a1a1aa; --border: #303036; }
  }
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; background: var(--bg); color: var(--text); margin: 0; padding: 1.5rem; }
  main { max-width: 52rem; margin: 0 auto; display: flex; flex-direction: column; gap: 1rem; }
  .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 1rem; padding: 1.5rem; }
  h1 { font-size: 1.3rem; margin: 0; }
  h2 { font-size: 1.05rem; margin: 0 0 0.9rem; }
  .bar { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; }
  .eyebrow { font-size: 0.8rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--accent); }
  input { font-size: 1rem; padding: 0.65rem 0.8rem; border-radius: 0.6rem; border: 1px solid var(--border); background: transparent; color: var(--text); width: 100%; }
  input:focus { outline: none; border-color: var(--accent); }
  button { font-size: 0.9rem; font-weight: 700; padding: 0.55rem 0.9rem; border-radius: 0.6rem; border: none; background: var(--accent); color: #fff; cursor: pointer; }
  button:hover { background: var(--accent-hover); }
  button:disabled { opacity: 0.6; cursor: wait; }
  button.ghost { background: transparent; color: var(--muted); border: 1px solid var(--border); font-weight: 600; }
  button.ghost:hover { background: transparent; color: var(--text); }
  form { display: flex; flex-direction: column; gap: 0.9rem; max-width: 22rem; }
  table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
  th, td { text-align: left; padding: 0.55rem 0.5rem; border-bottom: 1px solid var(--border); vertical-align: top; }
  th { color: var(--muted); font-weight: 600; font-size: 0.8rem; }
  td.actions { text-align: right; white-space: nowrap; }
  .muted { color: var(--muted); }
  .names { color: var(--muted); font-size: 0.8rem; margin-top: 0.2rem; }
  .error { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; border-radius: 0.6rem; padding: 0.6rem 0.8rem; font-size: 0.9rem; }
  .table-wrap { overflow-x: auto; }
  [hidden] { display: none !important; }
</style>
</head>
<body>
<main>
  <section class="card" id="login" hidden>
    <span class="eyebrow">__BRAND__</span>
    <h1>Administration de la visio</h1>
    <form id="login-form" style="margin-top:1rem">
      <label for="token" class="muted">Jeton d'administration</label>
      <input id="token" type="password" autocomplete="off" required>
      <p class="error" id="login-error" hidden></p>
      <button type="submit">Se connecter</button>
    </form>
  </section>

  <div id="app" hidden>
    <section class="card bar">
      <div>
        <span class="eyebrow">__BRAND__</span>
        <h1>Administration de la visio</h1>
      </div>
      <div>
        <button class="ghost" id="refresh">Actualiser</button>
        <button class="ghost" id="logout">Se déconnecter</button>
      </div>
    </section>
    <p class="error" id="app-error" hidden></p>

    <section class="card">
      <h2>Salles ouvertes (<span id="active-count">0</span>)</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>Salon</th><th>Participants</th><th>Créée le</th><th></th></tr></thead>
        <tbody id="active-body"></tbody>
      </table></div>
      <p class="muted" id="active-empty" hidden>Aucune salle ouverte.</p>
    </section>

    <section class="card">
      <h2>Salles terminées (30 dernières)</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>Salon</th><th>Participants</th><th>Créée le</th><th>Terminée le</th></tr></thead>
        <tbody id="past-body"></tbody>
      </table></div>
      <p class="muted" id="past-empty" hidden>Aucune salle terminée.</p>
    </section>
  </div>
</main>
<script>
  var $ = function (id) { return document.getElementById(id); };
  var timer = null;

  function show(which) {
    $('login').hidden = which !== 'login';
    $('app').hidden = which !== 'app';
  }
  function fmt(v) {
    if (!v || v === '0000-00-00 00:00:00') return '';
    var d = /^[0-9]+$/.test(String(v)) ? new Date(Number(v) * 1000) : new Date(String(v).replace(' ', 'T'));
    return isNaN(d) ? String(v) : d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  function cell(text, cls) {
    var td = document.createElement('td');
    if (cls) td.className = cls;
    td.textContent = text;
    return td;
  }
  function api(path, body) {
    return fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      credentials: 'same-origin',
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401) { stop(); show('login'); throw new Error('unauthorized'); }
        if (!r.ok) throw new Error(j.error || ('Erreur ' + r.status));
        return j;
      });
    });
  }
  function setError(msg) {
    $('app-error').hidden = !msg;
    $('app-error').textContent = msg || '';
  }

  function joinRoom(room) {
    // On ouvre l'onglet tout de suite (clic utilisateur) pour ne pas être
    // bloqué par l'anti-popup, puis on lui donne l'adresse une fois le jeton prêt.
    var w = window.open('', '_blank');
    api('/admin/api/rooms/join', { roomId: room.roomId }).then(function (j) {
      if (w) { w.location.href = j.url; } else { location.href = j.url; }
    }).catch(function (e) {
      if (w) w.close();
      if (e.message !== 'unauthorized') setError(e.message);
    });
  }

  function closeRoom(room) {
    var ok = confirm('Fermer et supprimer le salon « ' + (room.title || room.roomId) + ' » ?\\n\\n'
      + 'Les participants sont déconnectés. Le tableau blanc, le chat et les fichiers déposés sont effacés définitivement.');
    if (!ok) return;
    api('/admin/api/rooms/end', { roomId: room.roomId }).then(load).catch(function (e) {
      if (e.message !== 'unauthorized') setError(e.message);
    });
  }

  function render(data) {
    var body = $('active-body');
    body.textContent = '';
    data.active.forEach(function (r) {
      var tr = document.createElement('tr');
      var first = document.createElement('td');
      var strong = document.createElement('strong');
      strong.textContent = r.title || r.roomId;
      first.appendChild(strong);
      var id = document.createElement('div');
      id.className = 'names';
      id.textContent = r.roomId;
      first.appendChild(id);
      tr.appendChild(first);
      var people = cell(String(r.participants.length));
      if (r.participants.length) {
        var names = document.createElement('div');
        names.className = 'names';
        names.textContent = r.participants.join(', ');
        people.appendChild(names);
      }
      tr.appendChild(people);
      tr.appendChild(cell(fmt(r.created)));
      var act = document.createElement('td');
      act.className = 'actions';
      var j = document.createElement('button');
      j.className = 'ghost';
      j.textContent = 'Rejoindre en modérateur';
      j.addEventListener('click', function () { joinRoom(r); });
      act.appendChild(j);
      act.appendChild(document.createTextNode(' '));
      var b = document.createElement('button');
      b.textContent = 'Fermer / supprimer';
      b.addEventListener('click', function () { closeRoom(r); });
      act.appendChild(b);
      tr.appendChild(act);
      body.appendChild(tr);
    });
    $('active-count').textContent = String(data.active.length);
    $('active-empty').hidden = data.active.length > 0;

    var pb = $('past-body');
    pb.textContent = '';
    data.past.forEach(function (r) {
      var tr = document.createElement('tr');
      tr.appendChild(cell(r.title || r.roomId));
      tr.appendChild(cell(String(r.participants)));
      tr.appendChild(cell(fmt(r.created), 'muted'));
      tr.appendChild(cell(fmt(r.ended), 'muted'));
      pb.appendChild(tr);
    });
    $('past-empty').hidden = data.past.length > 0;
  }

  function load() {
    return api('/admin/api/rooms').then(function (data) {
      setError('');
      render(data);
      show('app');
    }).catch(function (e) {
      if (e.message !== 'unauthorized') { setError(e.message); show('app'); }
    });
  }
  function start() { stop(); timer = setInterval(load, 10000); }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }

  $('login-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    $('login-error').hidden = true;
    api('/admin/login', { token: $('token').value }).then(function () {
      $('token').value = '';
      return load().then(start);
    }).catch(function (e) {
      if (e.message === 'unauthorized') e = new Error('Jeton incorrect.');
      $('login-error').textContent = e.message;
      $('login-error').hidden = false;
      show('login');
    });
  });
  $('refresh').addEventListener('click', load);
  $('logout').addEventListener('click', function () {
    stop();
    api('/admin/logout', {}).catch(function () {}).then(function () { show('login'); });
  });

  // Au chargement : si une session valide existe (cookie), on affiche la
  // liste ; sur 401 api() bascule d'elle-même vers la connexion.
  load().then(function () { if (!$('app').hidden) start(); });
</script>
</body>
</html>
`;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function createAdminHandler({ pnm, adminToken, getClientIp, createAdminJoinUrl, brandName }) {
  const page = PAGE.replaceAll('__BRAND__', escapeHtml(brandName));

  const tokenDigest = sha256(adminToken);
  const failures = new Map();

  function sign(exp) {
    return crypto.createHmac('sha256', adminToken).update(`admin-session|${exp}`).digest('hex');
  }

  function isAuthenticated(req) {
    const raw = parseCookies(req.headers.cookie)[COOKIE_NAME];
    if (!raw) return false;
    const [exp, sig] = raw.split('.');
    if (!exp || !sig || !/^[0-9]+$/.test(exp)) return false;
    if (Number(exp) < Math.floor(Date.now() / 1000)) return false;
    const a = Buffer.from(sig);
    const b = Buffer.from(sign(exp));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  function sessionCookie() {
    const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_S;
    return `${COOKIE_NAME}=${exp}.${sign(exp)}; Path=/admin; Max-Age=${SESSION_MAX_AGE_S}; HttpOnly; Secure; SameSite=Strict`;
  }

  const clearCookie = `${COOKIE_NAME}=; Path=/admin; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;

  function tooManyFailures(ip) {
    const entry = failures.get(ip);
    if (!entry || Date.now() > entry.resetAt) return false;
    return entry.count >= LOGIN_MAX_FAILURES;
  }

  function recordFailure(ip) {
    const now = Date.now();
    const entry = failures.get(ip);
    if (!entry || now > entry.resetAt) {
      failures.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    } else {
      entry.count += 1;
    }
  }

  function sendJson(res, status, payload, extraHeaders = {}) {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      ...extraHeaders,
    });
    res.end(JSON.stringify(payload));
  }

  // Protection CSRF en plus de SameSite=Strict : les requêtes qui modifient
  // l'état doivent être du JSON (déclenche un preflight CORS pour les autres
  // origines) et, si un Origin est présent, venir de ce même hôte.
  function isSafeMutation(req) {
    if (!(req.headers['content-type'] || '').startsWith('application/json')) return false;
    const origin = req.headers.origin;
    if (!origin) return true;
    try {
      return new URL(origin).host === req.headers.host;
    } catch {
      return false;
    }
  }

  async function readJson(req) {
    try {
      return JSON.parse((await readBody(req, 2000)) || '{}');
    } catch {
      return null;
    }
  }

  async function listRooms() {
    // L'historique est secondaire : s'il échoue, on affiche quand même les
    // salles ouvertes plutôt que de bloquer toute la page.
    const [activeRes, pastRes] = await Promise.all([
      pnm.getActiveRoomsInfo(),
      pnm.fetchPastRoomsInfo({ roomIds: [], from: 0, limit: 30, orderBy: 'DESC' }).catch((err) => {
        console.warn('fetchPastRoomsInfo failed:', err.message);
        return { status: false, msg: 'no room found' };
      }),
    ]);
    // PlugNMeet répond status=false + "no active room found" quand il n'y a
    // simplement aucune salle : ce n'est pas une panne.
    const isEmpty = (r) => !r.status && /no .*(room|record).*found/i.test(r.msg || '');
    if (!activeRes.status && !isEmpty(activeRes)) {
      throw new Error(activeRes.msg || 'getActiveRoomsInfo failed');
    }
    if (!pastRes.status && !isEmpty(pastRes)) {
      console.warn('fetchPastRoomsInfo:', pastRes.msg);
    }

    const active = (activeRes.status ? activeRes.rooms || [] : []).map((r) => ({
      roomId: r.roomInfo?.roomId,
      title: r.roomInfo?.roomTitle,
      sid: r.roomInfo?.sid,
      created: r.roomInfo?.creationTime,
      participants: (r.participantsInfo || []).map((p) => p.name || p.userId || '?'),
    }));
    const activeSids = new Set(active.map((r) => r.sid));
    const past = (pastRes.status ? pastRes.result?.roomsList || [] : [])
      .filter((r) => !activeSids.has(r.roomSid))
      .map((r) => ({
        roomId: r.roomId,
        title: r.roomTitle,
        participants: Number(r.joinedParticipants) || 0,
        created: r.created,
        ended: r.ended,
      }));
    return { active, past };
  }

  // Retourne true si la requête a été traitée.
  return async function handle(req, res, url) {
    if (url.pathname !== '/admin' && !url.pathname.startsWith('/admin/')) return false;
    const ip = getClientIp(req);

    if (req.method === 'GET' && (url.pathname === '/admin' || url.pathname === '/admin/')) {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
      });
      res.end(page);
      return true;
    }

    if (req.method === 'POST' && url.pathname === '/admin/login') {
      if (!isSafeMutation(req)) { sendJson(res, 400, { error: 'Requête invalide.' }); return true; }
      if (tooManyFailures(ip)) {
        sendJson(res, 429, { error: 'Trop de tentatives, réessayez dans quelques minutes.' });
        return true;
      }
      const body = await readJson(req);
      const given = typeof body?.token === 'string' ? body.token : '';
      if (!given || !crypto.timingSafeEqual(sha256(given), tokenDigest)) {
        recordFailure(ip);
        console.warn(`admin login failed from ${ip}`);
        sendJson(res, 401, { error: 'Jeton incorrect.' });
        return true;
      }
      failures.delete(ip);
      console.log(`admin login ok from ${ip}`);
      sendJson(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie() });
      return true;
    }

    if (req.method === 'POST' && url.pathname === '/admin/logout') {
      sendJson(res, 200, { ok: true }, { 'Set-Cookie': clearCookie });
      return true;
    }

    // Tout le reste exige une session valide.
    if (!isAuthenticated(req)) {
      sendJson(res, 401, { error: 'Non authentifié.' });
      return true;
    }

    try {
      if (req.method === 'GET' && url.pathname === '/admin/api/rooms') {
        sendJson(res, 200, await listRooms());
        return true;
      }

      if (req.method === 'POST' && url.pathname === '/admin/api/rooms/join') {
        if (!isSafeMutation(req)) { sendJson(res, 400, { error: 'Requête invalide.' }); return true; }
        const body = await readJson(req);
        const roomId = typeof body?.roomId === 'string' ? body.roomId : '';
        if (!/^[a-z0-9-]{1,64}$/.test(roomId)) {
          sendJson(res, 400, { error: 'Identifiant de salon invalide.' });
          return true;
        }
        const joinUrl = await createAdminJoinUrl(roomId, 'Administration');
        console.log(`admin joined room ${roomId} as moderator (from ${ip})`);
        sendJson(res, 200, { url: joinUrl });
        return true;
      }

      if (req.method === 'POST' && url.pathname === '/admin/api/rooms/end') {
        if (!isSafeMutation(req)) { sendJson(res, 400, { error: 'Requête invalide.' }); return true; }
        const body = await readJson(req);
        const roomId = typeof body?.roomId === 'string' ? body.roomId : '';
        if (!/^[a-z0-9-]{1,64}$/.test(roomId)) {
          sendJson(res, 400, { error: 'Identifiant de salon invalide.' });
          return true;
        }
        const result = await pnm.endRoom({ roomId });
        if (!result.status) throw new Error(result.msg || 'endRoom failed');
        console.log(`admin ended room ${roomId} (from ${ip})`);
        sendJson(res, 200, { ok: true });
        return true;
      }
    } catch (err) {
      console.error('admin api failed:', err);
      sendJson(res, 502, { error: "L'API PlugNMeet a échoué : " + (err.message || 'erreur inconnue') });
      return true;
    }

    sendJson(res, 404, { error: 'Introuvable.' });
    return true;
  };
}

module.exports = { createAdminHandler };
