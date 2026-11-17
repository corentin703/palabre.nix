// Dev mail relay + mailbox: an SMTP server that keeps what it receives, and a page to read it.
//   node mailbox.mjs   (SMTP on 2525, mailbox on http://localhost:8025)
import * as http from 'node:http';
import * as net from 'node:net';
import { pathToFileURL } from 'node:url';

export function startMailbox({ smtpPort = 2525, mailboxPort = 8025 } = {}) {

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
    .listen(smtpPort, "127.0.0.1");

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
    .listen(mailboxPort, "127.0.0.1");

}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  startMailbox({ smtpPort: Number(process.env.SMTP_PORT) || 2525, mailboxPort: Number(process.env.MAILBOX_PORT) || 8025 });
  console.log('mailbox   http://localhost:' + (process.env.MAILBOX_PORT || 8025));
}
