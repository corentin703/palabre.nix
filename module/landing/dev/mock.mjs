// Dev server: the real landing server (built in dist/), with a fake PlugNMeet and a fake mail
// relay, to try the page, /admin and the mails without any infrastructure.
//
//   landing + admin   http://localhost:3000        (/admin: token "admin-token")
//   mailbox           http://localhost:8025        (what the "email me the links" form sends)
//
// "Entering" a room leads to a fake meeting page (/?access_token=...) showing the room, the
// name and whether you are a moderator.
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as net from 'node:net';
import * as path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const { createApp } = await import(path.join(root, 'dist/server/app.js'));
const { loadConfig } = await import(path.join(root, 'dist/server/config.js'));

const PORT = Number(process.env.PORT) || 3000;
const SMTP_PORT = 2525;
const MAILBOX_PORT = 8025;

// --- Fake PlugNMeet: rooms open in memory ------------------------------------------------------

const open = new Map(); // roomId -> creation time (seconds)
const past = [];

const pnm = {
  isRoomActive: async ({ roomId }) => ({ status: true, isActive: open.has(roomId) }),
  createRoom: async ({ roomId }) => {
    open.set(roomId, Math.floor(Date.now() / 1000));
    return { status: true };
  },
  // The token carries what the fake meeting page shows.
  getJoinToken: async ({ roomId, userInfo }) => ({
    status: true,
    token: Buffer.from(JSON.stringify({ roomId, name: userInfo?.name, isAdmin: userInfo?.isAdmin })).toString('base64url'),
  }),
  getActiveRoomsInfo: async () => ({
    status: true,
    rooms: [...open].map(([roomId, created]) => ({
      roomInfo: { roomId, roomTitle: roomId.replace(/-[0-9a-f]{12}$/, ''), sid: roomId, creationTime: String(created) },
      participantsInfo: [{ name: 'Camille' }],
    })),
  }),
  fetchPastRoomsInfo: async () => ({ status: true, result: { roomsList: past } }),
  endRoom: async ({ roomId }) => {
    const created = open.get(roomId) ?? 0;
    open.delete(roomId);
    past.unshift({ roomId, roomTitle: roomId.replace(/-[0-9a-f]{12}$/, ''), roomSid: `${roomId}-${created}`, joinedParticipants: '2', created: String(created), ended: String(Math.floor(Date.now() / 1000)) });
    return { status: true };
  },
};
past.push({ roomId: 'reunion-passee-0123456789ab', roomTitle: 'reunion-passee', roomSid: 'old', joinedParticipants: '4', created: String(Math.floor(Date.now() / 1000) - 7200), ended: String(Math.floor(Date.now() / 1000) - 3600) });

// --- Fake mail relay + mailbox -----------------------------------------------------------------

const mails = [];

/** Decodes a stored message: subject, recipient and the HTML part. */
function parseMail(raw) {
  const header = (name) => new RegExp(`^${name}: (.*)$`, 'mi').exec(raw)?.[1] ?? '';
  const decodeWord = (v) => v.replace(/=\?UTF-8\?B\?([^?]*)\?=/g, (_, b) => Buffer.from(b, 'base64').toString());
  const part = (type) => {
    const m = new RegExp(`Content-Type: ${type}[^]*?\\r?\\n\\r?\\n([^]*?)\\r?\\n--`, 'i').exec(raw);
    return m ? Buffer.from(m[1].replace(/\s+/g, ''), 'base64').toString() : '';
  };
  return { to: header('To'), subject: decodeWord(header('Subject')), html: part('text/html'), at: new Date() };
}

net
  .createServer((socket) => {
    socket.write('220 dev-relay\r\n');
    let data = false;
    let buffer = '';
    let message = '';
    socket.on('data', (chunk) => {
      buffer += chunk;
      for (let end = buffer.indexOf('\r\n'); end >= 0; end = buffer.indexOf('\r\n')) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (data) {
          if (line === '.') {
            data = false;
            mails.unshift(parseMail(message));
            message = '';
            socket.write('250 queued\r\n');
          } else message += `${line}\r\n`;
        } else if (line.startsWith('EHLO')) socket.write('250 dev-relay\r\n');
        else if (line === 'DATA') {
          data = true;
          socket.write('354 go\r\n');
        } else if (line === 'QUIT') socket.end('221 bye\r\n');
        else socket.write('250 ok\r\n');
      }
    });
  })
  .listen(SMTP_PORT, '127.0.0.1');

const escape = (s) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
http
  .createServer((req, res) => {
    const index = /^\/mail\/(\d+)$/.exec(req.url ?? '')?.[1];
    if (index !== undefined) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return void res.end(mails[Number(index)]?.html ?? 'Not found');
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', Refresh: '5' });
    res.end(`<!doctype html><meta charset="utf-8"><title>Dev mailbox</title>
<body style="font-family:system-ui;max-width:60rem;margin:2rem auto">
<h1>Dev mailbox</h1><p>${mails.length} mail(s), newest first. This page refreshes by itself.</p>
${mails.map((m, i) => `<details${i < 2 ? ' open' : ''} style="margin:1rem 0"><summary><b>${escape(m.subject)}</b> — ${escape(m.to)} — ${m.at.toLocaleTimeString()}</summary>
<iframe src="/mail/${i}" style="width:100%;height:34rem;border:1px solid #ccc"></iframe></details>`).join('')}`);
  })
  .listen(MAILBOX_PORT, '127.0.0.1');

// --- The real server -----------------------------------------------------------------------------

const web = path.join(root, 'dist/web');
const config = loadConfig({
  PORT: String(PORT),
  BIND_HOST: '127.0.0.1',
  PLUGNMEET_HOST: `http://localhost:${PORT}`,
  PLUGNMEET_API_KEY: 'dev',
  PLUGNMEET_SECRET: 'dev-secret',
  ADMIN_TOKEN: 'admin-token',
  LANDING_BRAND_NAME: 'Palabre (dev)',
  MAIL_HOST: '127.0.0.1',
  MAIL_PORT: String(SMTP_PORT),
  MAIL_SECURITY: 'none',
  MAIL_FROM: 'visio@palabre.test',
  ...process.env,
});
const app = createApp({ config, pnm, indexHtml: fs.readFileSync(path.join(web, 'index.html')), webDir: web, logo: undefined, customCss: undefined });

/** What PlugNMeet's client would show at the meeting address: here, a stand-in page. */
function meetingPage(token, res) {
  let who = {};
  try {
    who = JSON.parse(Buffer.from(token, 'base64url').toString());
  } catch {
    // Unreadable token: shown as unknown.
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><meta charset="utf-8"><title>Fake meeting</title>
<body style="font-family:system-ui;max-width:36rem;margin:4rem auto;text-align:center">
<h1>🎥 Fake meeting</h1>
<p>Room <b>${escape(String(who.roomId ?? '?'))}</b></p>
<p>${escape(String(who.name ?? '?'))} — <b>${who.isAdmin ? 'moderator' : 'participant'}</b></p>
<p><a href="/">Back to the landing page</a> · <a href="/admin">Admin</a></p>`);
}

http
  .createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const token = url.searchParams.get('access_token');
    if (url.pathname === '/' && token) return meetingPage(token, res);
    return app(req, res);
  })
  .listen(config.port, config.bindHost, () => {
    console.log(`landing   http://localhost:${config.port}\nadmin     http://localhost:${config.port}/admin  (token: admin-token)\nmailbox   http://localhost:${MAILBOX_PORT}`);
  });
