import * as crypto from 'node:crypto';
import * as net from 'node:net';
import * as tls from 'node:tls';

// A minimal SMTP client (one message, one recipient): enough to hand a mail to the
// organization's relay, without any dependency.

export interface SmtpConfig {
  host: string;
  port: number;
  /** tls: encrypted from the start (usually 465); starttls: upgraded (587); none: clear text. */
  security: 'tls' | 'starttls' | 'none';
  user: string | undefined;
  password: string | undefined;
  /** Sender address. */
  from: string;
}

export interface Mail {
  to: string;
  /** Name shown next to the sender address. */
  fromName: string;
  subject: string;
  text: string;
  html: string;
}

const TIMEOUT_MS = 15_000;

/** The relay refused the recipient for good (5xx: unknown mailbox, invalid address...). */
export class RecipientRejected extends Error {}

class SmtpReplyError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

const clean = (value: string): string => value.replace(/[\r\n]+/g, ' ').trim();
const encodeWord = (value: string): string => `=?UTF-8?B?${Buffer.from(clean(value)).toString('base64')}?=`;
const wrap64 = (data: string): string => Buffer.from(data).toString('base64').replace(/(.{76})/g, '$1\r\n');

/** The complete message (headers and body), with CRLF line ends. */
export function buildMessage(mail: Mail, from: string, host: string): string {
  const boundary = `=_${crypto.randomBytes(12).toString('hex')}`;
  const part = (type: string, body: string): string =>
    `--${boundary}\r\nContent-Type: ${type}; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap64(body)}\r\n`;
  return [
    `From: ${encodeWord(mail.fromName)} <${clean(from)}>`,
    `To: <${clean(mail.to)}>`,
    `Subject: ${encodeWord(mail.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomBytes(12).toString('hex')}@${clean(host)}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    part('text/plain', mail.text) + part('text/html', mail.html) + `--${boundary}--`,
    '',
  ].join('\r\n');
}

/** Reads the server's replies, one at a time (a reply can span several lines: "250-…", "250 …"). */
class Replies {
  private buffer = '';
  private lines: string[] = [];
  private waiting: { resolve: (reply: { code: number; text: string }) => void; reject: (e: Error) => void } | null = null;
  private failure: Error | null = null;

  attach(socket: net.Socket): void {
    socket.setEncoding('utf8');
    socket.setTimeout(TIMEOUT_MS, () => socket.destroy(new Error('SMTP timeout')));
    socket.on('data', (chunk: string) => {
      this.buffer += chunk;
      let end: number;
      while ((end = this.buffer.indexOf('\r\n')) >= 0) {
        const line = this.buffer.slice(0, end);
        this.buffer = this.buffer.slice(end + 2);
        this.lines.push(line);
        if (/^\d{3} /.test(line)) this.flush();
      }
    });
    const fail = (error: Error): void => {
      this.failure = error;
      this.waiting?.reject(error);
      this.waiting = null;
    };
    socket.on('error', fail);
    socket.on('close', () => fail(new Error('SMTP connection closed')));
  }

  private flush(): void {
    if (!this.waiting) return;
    const lines = this.lines.splice(0);
    const { resolve } = this.waiting;
    this.waiting = null;
    resolve({ code: Number(lines[lines.length - 1]?.slice(0, 3)), text: lines.join('\n') });
  }

  next(): Promise<{ code: number; text: string }> {
    return new Promise((resolve, reject) => {
      if (this.failure) return reject(this.failure);
      this.waiting = { resolve, reject };
      if (this.lines.some((line) => /^\d{3} /.test(line))) this.flush();
    });
  }
}

export async function sendMail(config: SmtpConfig, mail: Mail): Promise<void> {
  const replies = new Replies();
  let socket: net.Socket =
    config.security === 'tls'
      ? tls.connect({ host: config.host, port: config.port, servername: config.host })
      : net.connect({ host: config.host, port: config.port });
  replies.attach(socket);

  const expect = async (accepted: number[], send?: string): Promise<string> => {
    if (send !== undefined) socket.write(`${send}\r\n`);
    const reply = await replies.next();
    if (!accepted.includes(reply.code)) throw new SmtpReplyError(reply.code, `SMTP: unexpected reply "${reply.text}"`);
    return reply.text;
  };

  try {
    await expect([220]);
    const ehlo = (): Promise<string> => expect([250], `EHLO ${clean(config.host) === 'localhost' ? 'localhost' : 'palabre'}`);
    await ehlo();
    if (config.security === 'starttls') {
      await expect([220], 'STARTTLS');
      const plain = socket;
      plain.removeAllListeners('data');
      socket = tls.connect({ socket: plain, servername: config.host });
      replies.attach(socket);
      await ehlo();
    }
    if (config.user !== undefined && config.password !== undefined) {
      const credentials = Buffer.from(`\0${config.user}\0${config.password}`).toString('base64');
      await expect([235], `AUTH PLAIN ${credentials}`);
    }
    await expect([250], `MAIL FROM:<${clean(config.from)}>`);
    try {
      await expect([250, 251], `RCPT TO:<${clean(mail.to)}>`);
    } catch (err) {
      if (err instanceof SmtpReplyError && err.code >= 500) throw new RecipientRejected(err.message);
      throw err;
    }
    await expect([354], 'DATA');
    // Dot-stuffing: a line starting with "." would end the message.
    const body = buildMessage(mail, config.from, config.host).replace(/^\./gm, '..');
    await expect([250], `${body}\r\n.`);
    // The message is accepted: whether the goodbye goes well does not matter.
    await expect([221], 'QUIT').catch(() => undefined);
  } finally {
    socket.destroy();
  }
}
