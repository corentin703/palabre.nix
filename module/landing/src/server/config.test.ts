import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config';

const required = { PLUGNMEET_HOST: 'https://v.example', PLUGNMEET_API_KEY: 'k', PLUGNMEET_SECRET: 's' };

describe('loadConfig', () => {
  it('requires the PlugNMeet host, key and secret', () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    expect(() => loadConfig({ ...required, PLUGNMEET_SECRET: '' })).toThrow(ConfigError);
  });

  it('has safe defaults', () => {
    expect(loadConfig(required)).toMatchObject({
      port: 3000,
      bindHost: '0.0.0.0',
      plugnmeetApiUrl: 'https://v.example',
      defaultLocale: 'fr',
      brandName: 'Visioconférence',
      adminToken: undefined,
    });
  });

  it('reads the customization and ignores an unknown language', () => {
    expect(loadConfig({ ...required, LANDING_DEFAULT_LOCALE: 'en', PORT: '8080' })).toMatchObject({
      defaultLocale: 'en',
      port: 8080,
    });
    expect(loadConfig({ ...required, LANDING_DEFAULT_LOCALE: 'de' }).defaultLocale).toBe('fr');
  });
});

describe('PWA settings', () => {
  const base = { PLUGNMEET_HOST: 'https://v.example', PLUGNMEET_API_KEY: 'k', PLUGNMEET_SECRET: 's' };

  it('requires a logo', () => {
    expect(() => loadConfig({ ...base, LANDING_PWA: '1' })).toThrow('LANDING_LOGO_FILE');
    expect(loadConfig({ ...base, LANDING_PWA: '1', LANDING_LOGO_FILE: '/l.png' }).pwa).toBe(true);
  });

  it('only accepts a hexadecimal background color', () => {
    expect(() => loadConfig({ ...base, LANDING_BACKGROUND_COLOR: '-write /x' })).toThrow('hexadecimal');
  });
});

describe('mail settings', () => {
  const base = { PLUGNMEET_HOST: 'https://v.example', PLUGNMEET_API_KEY: 'k', PLUGNMEET_SECRET: 's' };
  const mail = { ...base, MAIL_HOST: 'smtp.example', MAIL_FROM: 'visio@example.org' };

  it('is off without a host, and needs a sender with one', () => {
    expect(loadConfig(base).mail).toBeUndefined();
    expect(() => loadConfig({ ...base, MAIL_HOST: 'smtp.example' })).toThrow('MAIL_FROM');
  });

  it('defaults to STARTTLS on 587, and to port 465 with TLS', () => {
    expect(loadConfig(mail).mail).toMatchObject({ security: 'starttls', port: 587 });
    expect(loadConfig({ ...mail, MAIL_SECURITY: 'tls' }).mail).toMatchObject({ security: 'tls', port: 465 });
  });

  it('accepts the other usual names of the security modes', () => {
    expect(loadConfig({ ...mail, MAIL_SECURITY: 'force_tls' }).mail?.security).toBe('tls');
    expect(loadConfig({ ...mail, MAIL_SECURITY: 'SSL' }).mail?.security).toBe('tls');
    expect(loadConfig({ ...mail, MAIL_SECURITY: 'off' }).mail?.security).toBe('none');
    expect(() => loadConfig({ ...mail, MAIL_SECURITY: 'maybe' })).toThrow('MAIL_SECURITY');
  });
});

describe('moderator key secret', () => {
  const base = { PLUGNMEET_HOST: 'https://v.example', PLUGNMEET_API_KEY: 'k', PLUGNMEET_SECRET: 's' };

  it('falls back to the PlugNMeet secret, so the links issued before it existed stay valid', () => {
    expect(loadConfig(base).roomKeySecret).toBe('s');
    expect(loadConfig({ ...base, ROOM_KEY_SECRET: '' }).roomKeySecret).toBe('s');
  });

  it('uses its own when given', () => {
    expect(loadConfig({ ...base, ROOM_KEY_SECRET: 'r' }).roomKeySecret).toBe('r');
  });
});

describe('ADMIN_TOKEN', () => {
  const base = { PLUGNMEET_HOST: 'https://v.example', PLUGNMEET_API_KEY: 'k', PLUGNMEET_SECRET: 's' };

  it('needs at least 32 characters, or is absent (the panel is then disabled)', () => {
    expect(() => loadConfig({ ...base, ADMIN_TOKEN: 'a'.repeat(31) })).toThrow(ConfigError);
    expect(loadConfig({ ...base, ADMIN_TOKEN: 'a'.repeat(32) }).adminToken).toBe('a'.repeat(32));
    expect(loadConfig({ ...base, ADMIN_TOKEN: '' }).adminToken).toBeUndefined();
    expect(loadConfig(base).adminToken).toBeUndefined();
  });
});

describe('MAX_ROOMS', () => {
  const base = { PLUGNMEET_HOST: 'https://v.example', PLUGNMEET_API_KEY: 'k', PLUGNMEET_SECRET: 's' };

  it('defaults to 20 and takes a positive integer', () => {
    expect(loadConfig(base).maxRooms).toBe(20);
    expect(loadConfig({ ...base, MAX_ROOMS: '5' }).maxRooms).toBe(5);
    for (const bad of ['0', '-1', '2.5', 'beaucoup']) expect(() => loadConfig({ ...base, MAX_ROOMS: bad })).toThrow(ConfigError);
  });
});
