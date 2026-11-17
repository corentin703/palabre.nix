import * as net from 'node:net';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { buildMessage, sendMail } from './smtp';

// A tiny SMTP server that records what the client says.
let server: net.Server;
afterEach(() => new Promise<void>((resolve) => server.close(() => resolve())));

async function fakeServer(): Promise<{ port: number; received: string[] }> {
  const received: string[] = [];
  server = net.createServer((socket) => {
    socket.write('220 fake ESMTP\r\n');
    let data = false;
    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      for (let end = buffer.indexOf('\r\n'); end >= 0; end = buffer.indexOf('\r\n')) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        received.push(line);
        if (data) {
          if (line === '.') {
            data = false;
            socket.write('250 queued\r\n');
          }
        } else if (line.startsWith('EHLO')) socket.write('250-fake\r\n250 AUTH PLAIN\r\n');
        else if (line.startsWith('AUTH')) socket.write('235 ok\r\n');
        else if (line === 'DATA') {
          data = true;
          socket.write('354 go\r\n');
        } else if (line === 'QUIT') socket.end('221 bye\r\n');
        else socket.write('250 ok\r\n');
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { port: (server.address() as AddressInfo).port, received };
}

const mail = { to: 'camille@example.org', fromName: 'Mon organisation', subject: 'Lien é', text: 'Bonjour\n.point seul', html: '<p>Bonjour</p>' };

describe('sendMail', () => {
  it('speaks SMTP: greeting, login, envelope, message', async () => {
    const { port, received } = await fakeServer();
    await sendMail({ host: '127.0.0.1', port, security: 'none', user: 'u', password: 'p', from: 'visio@example.org' }, mail);
    expect(received.some((l) => l === `AUTH PLAIN ${Buffer.from('\0u\0p').toString('base64')}`)).toBe(true);
    expect(received).toContain('MAIL FROM:<visio@example.org>');
    expect(received).toContain('RCPT TO:<camille@example.org>');
    expect(received).toContain('DATA');
    expect(received).toContain('QUIT');
  });

  it('fails with the server’s answer when the recipient is refused', async () => {
    server = net.createServer((socket) => {
      socket.write('220 hi\r\n');
      socket.on('data', (chunk) => {
        const line = chunk.toString();
        socket.write(line.startsWith('RCPT') ? '550 no such user\r\n' : line.startsWith('EHLO') ? '250 ok\r\n' : '250 ok\r\n');
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    await expect(
      sendMail({ host: '127.0.0.1', port, security: 'none', user: undefined, password: undefined, from: 'a@b.fr' }, mail),
    ).rejects.toThrow(/550/);
  });
});

describe('buildMessage', () => {
  it('writes a multipart message with encoded headers and no header injection', () => {
    const message = buildMessage({ ...mail, subject: 'Salut\r\nBcc: x@y.z' }, 'visio@example.org', 'smtp.example');
    expect(message).toContain('multipart/alternative');
    expect(message).toContain('From: =?UTF-8?B?');
    expect(message).not.toMatch(/^Bcc:/m);
    const text = /text\/plain[^]*?\r\n\r\n([^]*?)\r\n--/.exec(message)?.[1] ?? '';
    expect(Buffer.from(text.replace(/\r\n/g, ''), 'base64').toString()).toBe(mail.text);
  });
});
