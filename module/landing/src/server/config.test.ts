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
