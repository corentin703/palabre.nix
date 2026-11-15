'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { createAdminHandler } = require('./admin');
const {
  PlugNmeet,
  createRequest,
  CreateRoomReqSchema,
  GenerateTokenReqSchema,
} = require('plugnmeet-sdk-js');

const PORT = process.env.PORT || 3000;
const BIND_HOST = process.env.BIND_HOST || '0.0.0.0';
// URL publique : uniquement pour la redirection du navigateur.
const PNM_HOST = process.env.PLUGNMEET_HOST;
// URL interne pour les appels API serveur-à-serveur. Passer par l'URL
// publique depuis le conteneur échoue (ECONNREFUSED sur l'IP publique de
// l'hôte lui-même, vu en prod).
const PNM_API_URL = process.env.PLUGNMEET_API_URL || PNM_HOST;
const PNM_API_KEY = process.env.PLUGNMEET_API_KEY;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const PNM_SECRET = process.env.PLUGNMEET_SECRET;

// Personnalisation de la page d'accueil (voir services.palabre.landing.*) :
// tout est optionnel, sans réglage la page est neutre.
const BRAND_NAME = process.env.LANDING_BRAND_NAME || 'Visioconférence';
const THEME_COLOR = process.env.LANDING_THEME_COLOR || '#1f3a5f';
const readOptional = (file) => (file ? fs.readFileSync(file) : null);
// Injecté après la feuille de style de base : il peut tout surcharger.
const CUSTOM_CSS = (readOptional(process.env.LANDING_CSS_FILE) || '')
  .toString()
  // Empêche de refermer la balise <style> depuis le CSS.
  .replace(/<\/style/gi, '<\\/style');
const LOGO = readOptional(process.env.LANDING_LOGO_FILE);
const LOGO_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.gif': 'image/gif',
};
const LOGO_TYPE = LOGO
  ? LOGO_TYPES[path.extname(process.env.LANDING_LOGO_FILE).toLowerCase()] || 'application/octet-stream'
  : null;

if (!PNM_HOST || !PNM_API_KEY || !PNM_SECRET) {
  console.error('PLUGNMEET_HOST, PLUGNMEET_API_KEY and PLUGNMEET_SECRET are required');
  process.exit(1);
}

const pnm = new PlugNmeet(PNM_API_URL, PNM_API_KEY, PNM_SECRET);

// Derrière Caddy, l'adresse de la socket est toujours 127.0.0.1 : l'IP du
// visiteur est dans X-Forwarded-For, que Caddy réécrit (le conteneur n'écoute
// que sur 127.0.0.1, donc l'en-tête ne vient pas d'un client direct).
function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

// Anti-abus minimal : un salon PlugNMeet consomme de vraies ressources
// (salle LiveKit), donc on limite le nombre de
// tentatives de creation/jonction par IP. Ce n'est pas une protection contre
// un attaquant distribue, juste un frein au spam trivial.
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX = 10;
const rateLimitState = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitState.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitState.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX;
}

// Limiteur séparé pour la création de clés (une par nouvel intitulé saisi).
const keyRateState = new Map();
function isKeyRateLimited(ip) {
  const now = Date.now();
  const entry = keyRateState.get(ip);
  if (!entry || now > entry.resetAt) {
    keyRateState.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > 60;
}

// Les identifiants de salon PlugNMeet doivent rester dans un jeu de
// caracteres restreint (contrainte NATS, voir config.yaml du serveur).
// Fonction autonome : elle est aussi injectée telle quelle dans la page.
function slugifyRoomId(input, max) {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max || 64)
    .replace(/-+$/, '');
}

// --- Propriétaire d'un salon -------------------------------------------------
// Le droit de modération voyage dans un lien secret, utilisable depuis
// n'importe quel appareil et n'importe quand :
//  - à la création, le navigateur obtient une clé aléatoire (`mod`, 128 bits) ;
//  - l'identifiant du salon est « nom-empreinte », l'empreinte (12 caractères)
//    étant un HMAC de la clé avec le secret du serveur : publique, mais
//    impossible à fabriquer ou à inverser sans ce secret ;
//  - est modérateur quiconque présente une clé dont l'empreinte est celle du
//    salon (lien de modérateur `/r/<salon>?m=<clé>`), quel que soit l'ordre
//    d'arrivée et que le salon existe déjà ou non.
// Aucun état n'est stocké côté serveur : un lien reste valable des mois.
const OWNER_TAG_LEN = 12;
const BASE_MAX = 50; // 50 + '-' + 12 = 63 caractères au plus (limite : 64)
const ROOM_ID_RE = /^(.+)-([0-9a-f]{12})$/;
const MOD_RE = /^[0-9a-f]{32}$/;

function ownerTagOf(mod) {
  return crypto.createHmac('sha256', PNM_SECRET).update(`owner-tag|${mod}`).digest('hex').slice(0, OWNER_TAG_LEN);
}

function newRoomKey() {
  const mod = crypto.randomBytes(16).toString('hex');
  return { mod, tag: ownerTagOf(mod) };
}

// Nom lisible d'un identifiant de salon (sans l'empreinte).
function roomLabel(roomId) {
  const m = roomId.match(ROOM_ID_RE);
  return m ? m[1] : roomId;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function renderPage({ error, room = '', preset = false, modKey = '' } = {}) {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(BRAND_NAME)}</title>
<meta name="theme-color" content="${escapeHtml(THEME_COLOR)}">
${LOGO ? '<link rel="icon" href="/visio-assets/logo">' : ''}
<style>
  :root {
    color-scheme: light;
    /* Palette neutre par défaut. Tout est surchargeable via
       services.palabre.landing.css (voir README du module). */
    --brand: #1f3a5f;
    --ink: #1b1f27;
    --muted: #5b6472;
    --line: #e3e6eb;
    --sheet: #ffffff;
    --tint: #f3f5f8;
    --action: #2563eb;
    --action-hover: #1d4ed8;
    --accent: #f59e0b;
    --input-border: #8a94a3;
    --placeholder: #6b7585;
    --red: #a4161a;
    --red-bg: #fdecea;
    --page-bg: #e9edf2;
  }
  * { box-sizing: border-box; }
  html { font-size: 112.5%; }
  body {
    margin: 0;
    min-height: 100vh;
    font-family: ui-rounded, "SF Pro Rounded", "Nunito", "Segoe UI", system-ui, sans-serif;
    line-height: 1.55;
    color: var(--ink);
    background: var(--page-bg);
    padding: 1.5rem 1rem 3rem;
  }
  .sheet {
    position: relative; z-index: 1;
    max-width: 34rem;
    margin: 1.5rem auto 0;
    background: var(--sheet);
    border-radius: 1rem;
    padding: 1.6rem 1.75rem 2.25rem;
    border-top: 0.4rem solid var(--accent);
    box-shadow: 0 0.5rem 2rem rgba(0, 0, 0, 0.25);
  }
  .brand { display: flex; align-items: center; gap: 0.9rem; margin: 0 0 1.25rem; font-weight: 800; font-size: 1.1rem; color: var(--brand); }
  .brand img { width: 5.2rem; height: 5.2rem; flex: none; display: block; }
  h1 { font-size: clamp(1.9rem, 7vw, 2.6rem); line-height: 1.1; letter-spacing: -0.02em; font-weight: 800; margin: 0 0 0.6rem; text-wrap: balance; }
  .lead { margin: 0 0 1.5rem; color: var(--muted); }
  h2 { font-size: 1.3rem; line-height: 1.2; font-weight: 800; margin: 0 0 0.9rem; }
  h3 { font-size: 1.05rem; font-weight: 800; margin: 1.5rem 0 0.4rem; }
  section { border-top: 2px solid var(--line); margin-top: 2rem; padding-top: 1.75rem; }

  form { display: flex; flex-direction: column; gap: 1.25rem; }
  .field { display: flex; flex-direction: column; gap: 0.4rem; }
  label { font-weight: 700; }
  input {
    font: inherit;
    min-height: 3.4rem;
    padding: 0.6rem 0.9rem;
    border: 2px solid var(--input-border);
    border-radius: 0.7rem;
    background: #fff;
    color: var(--ink);
  }
  input::placeholder { color: var(--placeholder); }
  input:focus-visible, button:focus-visible, a:focus-visible, summary:focus-visible {
    outline: 3px solid var(--brand);
    outline-offset: 2px;
  }
  input:focus { border-color: var(--brand); }

  button {
    font: inherit;
    font-weight: 800;
    min-height: 3.4rem;
    padding: 0.7rem 1.2rem;
    border: 2px solid var(--brand);
    border-radius: 0.7rem;
    background: #fff;
    color: var(--brand);
    cursor: pointer;
  }
  button:hover { background: var(--tint); }
  button:disabled { opacity: 0.65; cursor: wait; }
  #join-button { background: var(--action); border-color: var(--action); color: #fff; font-size: 1.15rem; min-height: 3.8rem; }
  #join-button:hover { background: var(--action-hover); border-color: var(--action-hover); }

  .room-fixed { font-size: 1.5rem; font-weight: 800; word-break: break-word; padding: 0.6rem 0.9rem; border-left: 6px solid var(--accent); background: var(--tint); border-radius: 0.3rem 0.7rem 0.7rem 0.3rem; }

  .error { background: var(--red-bg); color: var(--red); border: 2px solid var(--red); border-radius: 0.7rem; padding: 0.8rem 1rem; margin: 0 0 1.25rem; font-weight: 700; }

  .share-row { display: flex; gap: 0.6rem; }
  .share-row input { flex: 1; min-width: 0; }
  .share[hidden], [hidden] { display: none !important; }
  .banner { background: var(--tint); border-left: 6px solid var(--accent); border-radius: 0.3rem 0.7rem 0.7rem 0.3rem; padding: 0.7rem 0.9rem; margin: 0 0 1.25rem; font-weight: 700; }
  .share .field + .field { margin-top: 1.5rem; }
  .note { color: var(--muted); font-size: 0.9rem; margin: 0.9rem 0 0; }

  .history ul { list-style: none; margin: 0; padding: 0; }
  .history li { display: flex; gap: 1rem; justify-content: space-between; align-items: baseline; padding: 0.6rem 0; border-bottom: 1px solid var(--line); }
  .history a { color: var(--brand); font-weight: 800; word-break: break-word; }
  .history time { color: var(--muted); font-size: 0.85rem; white-space: nowrap; }
  .history .clear { min-height: 0; padding: 0.2rem 0; margin-top: 0.8rem; border: none; background: none; color: var(--muted); font-weight: 600; font-size: 0.9rem; text-decoration: underline; }

  .steps { list-style: none; counter-reset: step; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 1rem; }
  .steps li { counter-increment: step; position: relative; padding-left: 3.1rem; }
  .steps li::before {
    content: counter(step);
    position: absolute; left: 0; top: -0.05rem;
    width: 2.2rem; height: 2.2rem; border-radius: 50%;
    background: var(--brand); color: #fff;
    display: grid; place-items: center; font-weight: 800;
  }
  .help { margin: 0; padding-left: 1.2rem; display: flex; flex-direction: column; gap: 0.7rem; }
  .guide p { margin: 0.3rem 0 0; }

  /* Grand écran : formulaire à gauche, mode d'emploi à droite. */
  @media (min-width: 60rem) {
    body { padding-top: 2.5rem; }
    .sheet {
      max-width: 70rem;
      display: grid;
      grid-template-columns: minmax(0, 5fr) minmax(0, 4fr);
      gap: 3rem;
      padding: 2.5rem 2.75rem 2.75rem;
    }
    .sheet .guide {
      margin-top: 0;
      padding-top: 0;
      border-top: none;
      border-left: 2px solid var(--line);
      padding-left: 3rem;
    }
  }

  @media (max-width: 30rem) {
    .sheet { padding: 1.5rem 1.15rem 1.75rem; }
    .share-row { flex-direction: column; }
  }
</style>
${CUSTOM_CSS ? `<style id="custom-css">\n${CUSTOM_CSS}\n</style>` : ''}
</head>
<body>
  <main class="sheet">
    <div class="main-col">
    <div class="brand">
      ${LOGO ? '<img src="/visio-assets/logo" alt="" width="94" height="94">' : ''}
      <span>${escapeHtml(BRAND_NAME)}</span>
    </div>
    <h1>${preset ? 'Rejoindre la visioconférence' : 'Visioconférence'}</h1>
    <p class="lead">${preset ? 'Veuillez renseigner votre prénom, puis valider d’un clic sur le bouton principal.' : 'Veuillez indiquer l’intitulé du salon ainsi que votre prénom, puis valider.'}</p>
    ${error ? `<p class="error" role="alert">${escapeHtml(error)}</p>` : ''}
    ${preset && modKey ? '<p class="banner">Vous rejoignez ce salon en tant que modérateur.</p>' : ''}
    <form method="post" action="/join" id="join-form">
      <input type="hidden" name="mod" id="mod-field" value="">
      ${preset ? `
      <input type="hidden" name="room" value="${escapeHtml(room)}">
      <div class="field">
        <span id="room-label"><strong>Salon</strong></span>
        <div class="room-fixed" aria-labelledby="room-label">${escapeHtml(roomLabel(room))}</div>
      </div>` : `
      <div class="field">
        <label for="room">Intitulé du salon</label>
        <input id="room" name="room" type="text" required maxlength="80" autocomplete="off" placeholder="par exemple : reunion-bureau" value="${escapeHtml(room)}">
      </div>`}
      <div class="field">
        <label for="name">Votre prénom</label>
        <input id="name" name="name" type="text" required maxlength="64" autocomplete="name" placeholder="par exemple : Camille" ${preset ? 'autofocus' : ''}>
      </div>
      <button type="submit" id="join-button">${preset ? 'Rejoindre la visioconférence' : 'Valider et entrer dans le salon'}</button>
    </form>
    ${preset ? '' : '<p class="note">Vous serez le seul modérateur de ce salon. Deux liens vous seront proposés ci-dessous : l\'un à transmettre aux autres participants, l\'autre à conserver pour vous.</p>'}

    <section class="share" id="share" hidden>
      <div class="field">
        <label for="share-link">Lien à transmettre aux autres participants</label>
        <div class="share-row">
          <input id="share-link" type="text" readonly>
          <button type="button" id="copy-button">Copier</button>
        </div>
      </div>
      <div class="field" id="mod-block" hidden>
        <label for="mod-link">Votre lien de modérateur</label>
        <div class="share-row">
          <input id="mod-link" type="text" readonly>
          <button type="button" id="copy-mod-button">Copier</button>
        </div>
        <p class="note">À conserver pour vous seul : il vous permet de retrouver vos droits de modérateur depuis n'importe quel appareil, même dans plusieurs semaines (envoyez-le vous par courriel). Ne le transmettez pas aux autres participants.</p>
      </div>
    </section>

    <section class="history" id="history" hidden>
      <h2>Vos dernières réunions</h2>
      <ul id="history-list"></ul>
      <p class="note">Cliquez sur un intitulé pour y retourner. Cette liste demeure exclusivement sur cet appareil.</p>
      <button type="button" class="clear" id="history-clear">Effacer cette liste</button>
    </section>

    </div>

    <section class="guide">
      <h2>Mode d'emploi</h2>
      <ol class="steps">
        ${preset ? `
        <li>Veuillez saisir <strong>votre prénom</strong> dans la case ci-dessus.</li>
        <li>Validez ensuite en cliquant sur le bouton principal <strong>« Rejoindre la visioconférence »</strong>.</li>
        ` : `
        <li>Veuillez choisir un <strong>intitulé pour le salon</strong>, par exemple <em>reunion-bureau</em>. Deux liens sont alors générés (voir plus bas).</li>
        <li>Veuillez saisir <strong>votre prénom</strong>.</li>
        <li>Validez en cliquant sur le bouton principal <strong>« Valider et entrer dans le salon »</strong>.</li>
        `}
        <li>Votre navigateur sollicite alors l'autorisation d'employer la <strong>caméra</strong> et le <strong>micro</strong> : veuillez cliquer sur <strong>« Autoriser »</strong>. À défaut, nul ne pourra vous voir ni vous entendre.</li>
        <li>Vous voilà en réunion. Les autres participants vous rejoindront au fur et à mesure.</li>
      </ol>
      ${preset ? `
      <h3>Qui est modérateur ?</h3>
      <p>${modKey
        ? `Vous avez ouvert le <strong>lien de modérateur</strong> de ce salon : vous pouvez couper le micro d'un participant, l'exclure ou clore la réunion. Conservez ce lien pour retrouver vos droits ultérieurement.`
        : `Vous entrez en <strong>simple participant</strong>. Seule la personne qui a créé le salon, ainsi que celles à qui elle a confié son lien de modérateur, en assure la modération.`}</p>
      ` : `
      <h3>Les deux liens et leur rôle</h3>
      <p>Dès que l'intitulé du salon est saisi, <strong>deux liens</strong> apparaissent sous le formulaire. Cliquez sur <strong>« Copier »</strong> pour en recopier un, puis collez-le dans un courriel ou un message (clic droit, « Coller »).</p>
      <ul class="help">
        <li><strong>Le lien à transmettre aux autres participants</strong> : toute personne qui l'ouvre entre dans le salon en <strong>simple participant</strong>, après avoir indiqué son prénom.</li>
        <li><strong>Votre lien de modérateur</strong> : toute personne qui l'ouvre devient <strong>modérateur</strong> du salon (couper le micro d'un participant, l'exclure, clore la réunion). Vous pouvez donc le confier à une personne de confiance, mais à personne d'autre.</li>
      </ul>
      <h3>Pourquoi conserver votre lien de modérateur ?</h3>
      <p>Les liens restent valables durablement : vous pouvez créer un salon longtemps à l'avance. Votre qualité de modérateur ne dépend <strong>ni de l'appareil, ni de l'ordre d'arrivée</strong> : si un participant se connecte avant vous, il reste simple participant, et vous retrouvez vos droits dès que vous ouvrez votre lien de modérateur, depuis un téléphone comme depuis un ordinateur.</p>
      <p>Le site ne retient rien sur vous : <strong>sans ce lien, vos droits de modérateur ne peuvent pas être retrouvés</strong>. Envoyez-le vous par courriel ou conservez-le dans vos notes. Sur l'appareil que vous venez d'utiliser, la liste « Vos dernières réunions » le retient également.</p>
      <p>Enfin, saisir le même intitulé qu'une autre personne ne permet pas de rejoindre son salon : chacun obtient le sien. Pour rejoindre un salon, il faut toujours en avoir reçu le lien.</p>
      `}
      <h3>En cas de difficulté</h3>
      <ul class="help">
        <li><strong>On ne vous entend pas ou on ne vous voit pas</strong> : cliquez sur le cadenas ou sur l'icône de caméra située à gauche de l'adresse du site, autorisez la caméra et le micro, puis actualisez la page (touche F5).</li>
        <li><strong>Vous n'entendez personne</strong> : veuillez vérifier le volume de l'ordinateur ainsi que le branchement de vos écouteurs.</li>
        <li><strong>La page est figée</strong> : actualisez-la au moyen de la touche F5. Vous réintégrerez la même réunion.</li>
      </ul>
      <h3>Pour quitter la réunion</h3>
      <p>Cliquez sur le bouton de sortie au sein de la réunion, ou fermez simplement l'onglet. La réunion se poursuit pour les autres participants.</p>
      <p class="note">Lorsque le dernier participant a quitté le salon, celui-ci est supprimé : le tableau blanc, la discussion et les fichiers déposés sont définitivement effacés. Pensez à les enregistrer ou à les exporter au préalable.</p>
    </section>
  </main>
  <script>
    var slugify = ${slugifyRoomId.toString()};
    var PRESET_ROOM = ${JSON.stringify(preset ? room : '').replace(/</g, '\\u003c')};
    var PRESET_MOD = ${JSON.stringify(modKey)};
    var form = document.getElementById('join-form');
    var roomInput = document.getElementById('room');
    var modField = document.getElementById('mod-field');
    var share = document.getElementById('share');
    var shareLink = document.getElementById('share-link');
    var modBlock = document.getElementById('mod-block');
    var modLink = document.getElementById('mod-link');

    // --- Clés des salons créés ou ouverts en modérateur sur cet appareil ------
    // localStorage peut être indisponible (navigation privée) : on garde aussi
    // une copie en mémoire pour la durée de la page.
    var ROOMS_KEY = 'visio:rooms';
    var memo = {};
    function loadRooms() {
      try {
        var o = JSON.parse(localStorage.getItem(ROOMS_KEY) || '{}');
        return o && typeof o === 'object' ? o : {};
      } catch (e) { return {}; }
    }
    function saveRoom(base, k) {
      memo[base] = k;
      try { var o = loadRooms(); o[base] = k; localStorage.setItem(ROOMS_KEY, JSON.stringify(o)); } catch (e) {}
    }
    function findRoom(base) { return memo[base] || loadRooms()[base] || null; }

    // Salon affiché : identifiant (nom-empreinte) et clé de modérateur éventuelle.
    var current = { id: '', mod: '' };
    function setCurrent(id, mod) {
      current = { id: id, mod: mod };
      if (!id) { share.hidden = true; return; }
      var pub = location.origin + '/r/' + id;
      shareLink.value = pub;
      if (mod) { modLink.value = pub + '?m=' + mod; modBlock.hidden = false; } else { modBlock.hidden = true; }
      share.hidden = false;
    }
    function refresh() {
      if (PRESET_ROOM) { setCurrent(PRESET_ROOM, PRESET_MOD); return; }
      var base = slugify(roomInput.value, 50);
      var k = base ? findRoom(base) : null;
      if (k) { setCurrent(base + '-' + k.tag, k.mod); } else { setCurrent('', ''); }
    }

    // Lien de modérateur ouvert sur un nouvel appareil : on retient la clé, ce
    // qui permet d'y recréer ce salon sous le même identifiant.
    if (PRESET_ROOM && PRESET_MOD) {
      var pm = PRESET_ROOM.match(/^(.+)-([0-9a-f]{12})$/);
      if (pm) saveRoom(pm[1], { mod: PRESET_MOD, tag: pm[2] });
    }

    // Nouvelle clé demandée au serveur (il en garantit l'empreinte), une seule
    // fois par intitulé, après une courte pause de saisie.
    var timer = null, inflight = {}, keyFailed = false, pendingSubmit = false;
    function ensureKey(base) {
      if (inflight[base]) return;
      inflight[base] = true;
      fetch('/visio-api/room-key', { credentials: 'same-origin' })
        .then(function (r) { if (!r.ok) throw new Error('key'); return r.json(); })
        .then(function (k) { if (!findRoom(base)) saveRoom(base, { mod: k.mod, tag: k.tag }); })
        .catch(function () { keyFailed = true; })
        .then(function () {
          inflight[base] = false;
          refresh();
          if (pendingSubmit && (current.mod || keyFailed)) {
            pendingSubmit = false;
            if (form.requestSubmit) { form.requestSubmit(); } else { form.submit(); }
          }
        });
    }
    function onInput() {
      refresh();
      var base = roomInput ? slugify(roomInput.value, 50) : '';
      if (base && !findRoom(base)) {
        clearTimeout(timer);
        timer = setTimeout(function () { ensureKey(base); }, 450);
      }
    }
    if (roomInput) roomInput.addEventListener('input', onInput);
    onInput();

    function wireCopy(btn, input) {
      btn.addEventListener('click', function () {
        input.select();
        var done = function () {
          btn.textContent = 'Lien copié';
          setTimeout(function () { btn.textContent = 'Copier'; }, 2000);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(input.value).then(done, function () {
            document.execCommand('copy'); done();
          });
        } else { document.execCommand('copy'); done(); }
      });
      input.addEventListener('focus', function () { input.select(); });
    }
    wireCopy(document.getElementById('copy-button'), shareLink);
    wireCopy(document.getElementById('copy-mod-button'), modLink);

    // --- Historique local (localStorage) ---------------------------------------
    var HIST_KEY = 'visio:history';
    var NAME_KEY = 'visio:name';
    function loadHistory() {
      try {
        var list = JSON.parse(localStorage.getItem(HIST_KEY) || '[]');
        return Array.isArray(list) ? list : [];
      } catch (e) { return []; }
    }
    function saveHistory(list) {
      try { localStorage.setItem(HIST_KEY, JSON.stringify(list)); } catch (e) {}
    }
    function renderHistory() {
      var list = loadHistory();
      var box = document.getElementById('history');
      var ul = document.getElementById('history-list');
      ul.textContent = '';
      box.hidden = list.length === 0;
      list.forEach(function (item) {
        if (!item || !item.slug) return;
        var li = document.createElement('li');
        var a = document.createElement('a');
        // Le lien garde la clé de modérateur : on retrouve ses droits d'un clic.
        a.href = '/r/' + encodeURIComponent(item.slug) + (item.mod ? '?m=' + encodeURIComponent(item.mod) : '');
        a.textContent = item.title || item.slug;
        var t = document.createElement('time');
        try {
          t.textContent = new Date(item.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        } catch (e) {}
        li.appendChild(a);
        li.appendChild(t);
        ul.appendChild(li);
      });
    }
    function rememberRoom() {
      var id = current.id;
      if (!id) return;
      var title = roomInput ? roomInput.value.trim() : id.replace(/-[0-9a-f]{12}$/, '');
      var list = loadHistory().filter(function (i) { return i && i.slug !== id; });
      list.unshift({ slug: id, title: title, mod: current.mod || '', at: Date.now() });
      saveHistory(list.slice(0, 10));
      try { localStorage.setItem(NAME_KEY, document.getElementById('name').value.trim()); } catch (e) {}
    }
    document.getElementById('history-clear').addEventListener('click', function () {
      saveHistory([]);
      renderHistory();
    });
    try {
      var savedName = localStorage.getItem(NAME_KEY);
      var nameInput = document.getElementById('name');
      if (savedName && !nameInput.value) nameInput.value = savedName;
    } catch (e) {}
    renderHistory();

    form.addEventListener('submit', function (ev) {
      var btn = document.getElementById('join-button');
      // Clé du salon pas encore reçue : on attend quelques instants puis on envoie.
      if (!PRESET_ROOM && !current.mod && !keyFailed) {
        ev.preventDefault();
        pendingSubmit = true;
        btn.textContent = 'Préparation du salon…';
        onInput();
        return;
      }
      modField.value = current.mod;
      rememberRoom();
      btn.disabled = true;
      btn.textContent = 'Connexion en cours…';
    });
  </script>
</body>
</html>
`;
}

function sendHtml(res, status, html, extraHeaders = {}) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', ...extraHeaders });
  res.end(html);
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

async function handleJoin(req, res) {
  const ip = getClientIp(req);
  if (isRateLimited(ip)) {
    sendHtml(res, 429, renderPage({ error: 'Le nombre de tentatives autorisé est dépassé ; veuillez patienter quelques minutes.' }));
    return;
  }

  let body;
  try {
    body = await readBody(req, 10_000);
  } catch {
    sendHtml(res, 400, renderPage({ error: 'Requête invalide.' }));
    return;
  }

  const params = new URLSearchParams(body);
  const roomNameRaw = (params.get('room') || '').trim();
  const displayName = (params.get('name') || '').trim().slice(0, 64) || 'Invité';
  const slug = slugifyRoomId(roomNameRaw, 64);

  if (!slug) {
    sendHtml(res, 400, renderPage({ error: 'Intitulé de salon invalide (lettres, chiffres et tirets uniquement).', room: roomNameRaw }));
    return;
  }

  // Deux cas :
  //  - lien (identifiant « nom-empreinte ») : on rejoint ce salon ; on en est le
  //    modérateur seulement si on présente une clé dont l'empreinte correspond
  //    (lien de modérateur) ;
  //  - intitulé saisi sur la page d'accueil : on crée SON salon avec la clé
  //    fournie par le navigateur ; l'identifiant en porte l'empreinte.
  const modParam = (params.get('mod') || '').trim();
  let ownerMod = MOD_RE.test(modParam) ? modParam : '';
  const linkMatch = slug.match(ROOM_ID_RE);
  let roomId;
  let isOwner;
  let titleRaw;
  if (linkMatch) {
    roomId = slug;
    titleRaw = linkMatch[1];
    isOwner = ownerMod !== '' && ownerTagOf(ownerMod) === linkMatch[2];
  } else {
    // Repli sans JavaScript : clé tirée ici, la salle reste propre à cette session.
    if (!ownerMod) ownerMod = newRoomKey().mod;
    roomId = `${slugifyRoomId(roomNameRaw, BASE_MAX)}-${ownerTagOf(ownerMod)}`;
    titleRaw = roomNameRaw;
    isOwner = true;
  }

  try {
    const activeRes = await pnm.isRoomActive({ roomId });
    if (!activeRes.status) {
      throw new Error(activeRes.msg || 'isRoomActive failed');
    }

    if (!activeRes.isActive) {
      const roomInfo = createRequest(CreateRoomReqSchema, {
        roomId,
        metadata: {
          roomTitle: titleRaw.slice(0, 128),
          // Où le client PlugNMeet renvoie la personne quand elle quitte la
          // réunion : retour à cette page d'accueil.
          logoutUrl: `${PNM_HOST}/`,
          welcomeMessage: `Soyez les bienvenus dans le salon ${escapeHtml(titleRaw)}.`,
          roomFeatures: {
            allowWebcams: true,
            muteOnStart: false,
            allowScreenShare: true,
            adminOnlyWebcams: false,
            allowViewOtherWebcams: true,
            allowViewOtherUsersList: true,
            allowVirtualBg: true,
            allowRaiseHand: true,
            allowReactions: true,
            roomDuration: '0',
            recordingFeatures: {
              isAllow: true,
              isAllowCloud: false,
              isAllowLocal: true,
              enableAutoCloudRecording: false,
            },
            chatFeatures: { isAllow: true, isAllowFileUpload: true, maxFileSize: '50' },
            sharedNotePadFeatures: { isAllow: true },
            whiteboardFeatures: { isAllow: true },
          },
        },
      });

      const createRes = await pnm.createRoom(roomInfo);
      if (!createRes.status) {
        throw new Error(createRes.msg || 'createRoom failed');
      }
    }

    // Modérateur = propriétaire du salon, jamais « le premier arrivé ».
    const tokenInfo = createRequest(GenerateTokenReqSchema, {
      roomId,
      userInfo: {
        name: displayName,
        // Une identité par connexion, modérateur ou non : plusieurs personnes
        // peuvent utiliser le même lien de modérateur sans se déconnecter
        // mutuellement (PlugNMeet remplace toute session de même identité).
        userId: crypto.randomUUID(),
        isAdmin: isOwner,
        isHidden: false,
      },
    });

    const tokenRes = await pnm.getJoinToken(tokenInfo);
    if (!tokenRes.status) {
      throw new Error(tokenRes.msg || 'getJoinToken failed');
    }

    // lng=fr-FR : le client PlugNMeet détecte la langue via
    // i18next-browser-languagedetector, qui priorise le paramètre d'URL
    // `lng` avant la langue du navigateur (fallback par défaut : anglais).
    // Une fois posé, le choix reste mémorisé dans le navigateur (localStorage)
    // pour les visites suivantes.
    const headers = {
      Location: `${PNM_HOST}/?access_token=${encodeURIComponent(tokenRes.token)}&lng=fr-FR`,
    };
    res.writeHead(302, headers);
    res.end();
  } catch (err) {
    console.error('join failed:', err);
    sendHtml(res, 502, renderPage({ error: "Il n'est pas possible de rejoindre le salon pour le moment ; veuillez réessayer ultérieurement.", room: roomNameRaw }));
  }
}

// Jeton de modérateur pour l'administrateur : identité éphémère, droits admin.
async function createAdminJoinUrl(roomId, name) {
  const tokenInfo = createRequest(GenerateTokenReqSchema, {
    roomId,
    userInfo: { name, userId: crypto.randomUUID(), isAdmin: true, isHidden: false },
  });
  const tokenRes = await pnm.getJoinToken(tokenInfo);
  if (!tokenRes.status) throw new Error(tokenRes.msg || 'getJoinToken failed');
  return `${PNM_HOST}/?access_token=${encodeURIComponent(tokenRes.token)}&lng=fr-FR`;
}

const adminHandler = ADMIN_TOKEN
  ? createAdminHandler({ pnm, adminToken: ADMIN_TOKEN, getClientIp, createAdminJoinUrl, brandName: BRAND_NAME })
  : null;
if (!adminHandler) console.warn('ADMIN_TOKEN absent : panneau /admin désactivé');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (adminHandler && (await adminHandler(req, res, url))) return;

  if (LOGO && req.method === 'GET' && url.pathname === '/visio-assets/logo') {
    res.writeHead(200, {
      'Content-Type': LOGO_TYPE,
      'Content-Length': LOGO.length,
      'Cache-Control': 'public, max-age=86400',
    });
    res.end(LOGO);
    return;
  }

  // Nouvelle clé de salon (voir « Propriétaire d'un salon »). Chemin dédié :
  // /api/ est pris par PlugNMeet sur le même domaine.
  if (req.method === 'GET' && url.pathname === '/visio-api/room-key') {
    const ip = getClientIp(req);
    if (isKeyRateLimited(ip)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end('{"error":"rate"}');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(newRoomKey()));
    return;
  }

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/join')) {
    sendHtml(res, 200, renderPage());
    return;
  }

  const presetMatch = req.method === 'GET' && url.pathname.match(/^\/r\/([^/]+)$/);
  if (presetMatch) {
    let decoded = '';
    try { decoded = decodeURIComponent(presetMatch[1]); } catch { /* slug invalide */ }
    const slug = slugifyRoomId(decoded, 64);
    if (slug) {
      // Clé de modérateur dans le lien (?m=) : valable seulement si son
      // empreinte est celle du salon.
      const m = slug.match(ROOM_ID_RE);
      const q = url.searchParams.get('m') || '';
      const modKey = m && MOD_RE.test(q) && ownerTagOf(q) === m[2] ? q : '';
      sendHtml(res, 200, renderPage({ room: slug, preset: true, modKey }),
        { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
      return;
    }
    res.writeHead(302, { Location: '/' });
    res.end();
    return;
  }

  if (req.method === 'POST' && url.pathname === '/join') {
    handleJoin(req, res);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

server.listen(PORT, BIND_HOST, () => {
  console.log(`palabre-landing listening on ${BIND_HOST}:${PORT}, PLUGNMEET_HOST=${PNM_HOST}`);
});
