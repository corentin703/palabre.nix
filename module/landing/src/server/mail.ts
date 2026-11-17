import type { Locale } from '../shared/locales.js';
import type { Config } from './config.js';
import type { Mail } from './smtp.js';

// The two mails of a room: the invitation link, then the moderator link. They are written to
// look like the landing page (same palette, same white sheet with its accent bar, same
// logo); the page's own stylesheet cannot be loaded by a mail client, so its default
// variables are repeated below, and the brand color is the one of `landing.themeColor`.

const PALETTE = { red: '#a4161a', redBg: '#fdecea', ink: '#1b1f27', muted: '#5b6472', line: '#e3e6eb', tint: '#f3f5f8', action: '#2563eb', accent: '#f59e0b', pageBg: '#e9edf2' };

interface Texts {
  invitationSubject: (brand: string, title: string) => string;
  invitationTitle: string;
  invitationIntro: (title: string) => string;
  invitationNote: string;
  moderatorSubject: (brand: string, title: string) => string;
  moderatorTitle: string;
  moderatorIntro: (title: string) => string;
  moderatorNote: string;
  moderatorWarning: string;
  open: string;
  orCopy: string;
}

const TEXTS: Record<Locale, Texts> = {
  fr: {
    invitationSubject: (brand, title) => `${brand} : lien d’invitation au salon « ${title} »`,
    invitationTitle: 'Lien d’invitation',
    invitationIntro: (title) => `Voici le lien à transmettre aux participants du salon « ${title} ».`,
    invitationNote:
      'Vous pouvez transférer ce courriel tel quel aux participants : toute personne qui ouvre ce lien entre dans le salon en simple participant, après avoir indiqué son prénom.',
    moderatorSubject: (brand, title) => `${brand} : votre lien de modérateur pour le salon « ${title} »`,
    moderatorTitle: 'Votre lien de modérateur',
    moderatorIntro: (title) => `Voici votre lien de modérateur pour le salon « ${title} ».`,
    moderatorNote:
      'À conserver : ce lien vous permet de retrouver vos droits de modérateur depuis n’importe quel appareil. Le lien d’invitation, lui, est dans un autre courriel.',
    moderatorWarning:
      'Attention : ce courriel ne doit PAS être transféré. Toute personne qui ouvre ce lien devient modératrice du salon (couper le micro, exclure, clore la réunion).',
    open: 'Ouvrir le salon',
    orCopy: 'Ou copiez cette adresse dans votre navigateur :',
  },
  en: {
    invitationSubject: (brand, title) => `${brand}: invitation link to the “${title}” room`,
    invitationTitle: 'Invitation link',
    invitationIntro: (title) => `Here is the link to send to the participants of the “${title}” room.`,
    invitationNote:
      'You can forward this email as is to the participants: anyone who opens this link enters the room as a regular participant, after giving their first name.',
    moderatorSubject: (brand, title) => `${brand}: your moderator link for the “${title}” room`,
    moderatorTitle: 'Your moderator link',
    moderatorIntro: (title) => `Here is your moderator link for the “${title}” room.`,
    moderatorNote:
      'Keep it: this link lets you get your moderator rights back from any device. The invitation link is in a separate email.',
    moderatorWarning:
      'Warning: do NOT forward this email. Anyone who opens this link becomes a moderator of the room (mute, remove participants, end the meeting).',
    open: 'Open the room',
    orCopy: 'Or copy this address into your browser:',
  },
};

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

interface Body {
  brand: string;
  heading: string;
  intro: string;
  note: string;
  warning?: string;
  url: string;
  open: string;
  orCopy: string;
}

function render(config: Config, body: Body): { text: string; html: string } {
  const e = escapeHtml;
  const brandColor = /^#[0-9a-f]{3,8}$/i.test(config.themeColor) ? config.themeColor : '#1f3a5f';
  const warning = body.warning
    ? `<p style="margin:0 0 22px;padding:12px 14px;background:${PALETTE.redBg};color:${PALETTE.red};border:2px solid ${PALETTE.red};border-radius:11px;font-weight:700">${e(body.warning)}</p>\n`
    : '';
  const logo = config.logoFile
    ? `<img src="${e(config.plugnmeetHost)}/visio-assets/logo" alt="" width="52" height="52" style="display:block;border:0;margin:0 0 12px">`
    : '';
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;padding:24px 12px;background:${PALETTE.pageBg};font-family:'Segoe UI',system-ui,sans-serif;color:${PALETTE.ink};line-height:1.55">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:34rem;background:#ffffff;border-radius:16px;border-top:6px solid ${PALETTE.accent}">
<tr><td style="padding:28px 28px 32px">
${logo}<div style="font-weight:800;font-size:17px;color:${brandColor};margin:0 0 18px">${e(body.brand)}</div>
<h1 style="font-size:28px;line-height:1.15;letter-spacing:-0.02em;font-weight:800;margin:0 0 12px;color:${PALETTE.ink}">${e(body.heading)}</h1>
<p style="margin:0 0 22px;color:${PALETTE.muted}">${e(body.intro)}</p>
${warning}<p style="margin:0 0 22px"><a href="${e(body.url)}" style="display:inline-block;background:${PALETTE.action};color:#ffffff;font-weight:800;text-decoration:none;padding:14px 22px;border-radius:11px">${e(body.open)}</a></p>
<p style="margin:0 0 6px;font-size:14px;color:${PALETTE.muted}">${e(body.orCopy)}</p>
<p style="margin:0 0 22px;padding:10px 14px;border-left:6px solid ${PALETTE.accent};background:${PALETTE.tint};border-radius:5px 11px 11px 5px;font-size:14px;word-break:break-all"><a href="${e(body.url)}" style="color:${brandColor};font-weight:700">${e(body.url)}</a></p>
<p style="margin:0;padding-top:18px;border-top:2px solid ${PALETTE.line};font-size:14px;color:${PALETTE.muted}">${e(body.note)}</p>
</td></tr></table>
</td></tr></table>
</body></html>`;
  const text = `${body.heading}\n\n${body.intro}\n\n${body.warning ? `${body.warning}\n\n` : ''}${body.url}\n\n${body.note}\n\n-- ${body.brand}\n`;
  return { text, html };
}

/** Both mails, for the room `roomId` (identifier "name-tag") whose moderator key is `mod`. */
export function invitationMails(
  config: Config,
  { roomId, label, mod, locale, to }: { roomId: string; label: string; mod: string; locale: Locale; to: string },
): [Mail, Mail] {
  const t = TEXTS[locale];
  const base = `${config.plugnmeetHost}/r/${roomId}`;
  const make = (subject: string, heading: string, intro: string, note: string, url: string, warning?: string): Mail => ({
    to,
    fromName: config.brandName,
    subject,
    ...render(config, { brand: config.brandName, heading, intro, note, url, open: t.open, orCopy: t.orCopy, ...(warning ? { warning } : {}) }),
  });
  return [
    make(t.invitationSubject(config.brandName, label), t.invitationTitle, t.invitationIntro(label), t.invitationNote, base),
    make(t.moderatorSubject(config.brandName, label), t.moderatorTitle, t.moderatorIntro(label), t.moderatorNote, `${base}?m=${mod}`, t.moderatorWarning),
  ];
}
