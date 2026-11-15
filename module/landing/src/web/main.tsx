import { StrictMode } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { RuntimeConfig } from '../shared/api';
import { getRuntimeConfig } from './api';
import { I18nProvider } from './i18n';
import { applyRuntimeConfig } from './runtime-config';

/**
 * Each page is its own chunk of code, loaded only when it is visited. It is loaded before the
 * host's CSS: the latter has to come after the page's stylesheet to be able to override it.
 */
async function loadPage(config: RuntimeConfig, isAdmin: boolean): Promise<ReactNode> {
  if (isAdmin) {
    const { default: AdminPage } = await import('./pages/AdminPage');
    return <AdminPage brandName={config.brandName} />;
  }
  const { default: JoinPage } = await import('./pages/JoinPage');
  return <JoinPage config={config} />;
}

async function start() {
  const config = await getRuntimeConfig();
  const isAdmin = location.pathname === '/admin' || location.pathname.startsWith('/admin/');

  const page = await loadPage(config, isAdmin);
  // The administration panel keeps its neutral style.
  await applyRuntimeConfig(config, { customCss: !isAdmin });

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <I18nProvider defaultLocale={config.defaultLocale}>{page}</I18nProvider>
    </StrictMode>,
  );
}

void start();
