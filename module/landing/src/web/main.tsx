import { StrictMode } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { RuntimeConfig } from '../shared/api';
import { getRuntimeConfig } from './api';
import { I18nProvider } from './i18n';
import { applyRuntimeConfig } from './runtime-config';

/**
 * Chaque page est son propre morceau de code, chargé seulement quand on la visite. Il l'est avant
 * le CSS de l'hôte : ce dernier doit venir après la feuille de la page pour pouvoir la surcharger.
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
  // Le panneau d'administration garde son style neutre.
  await applyRuntimeConfig(config, { customCss: !isAdmin });

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <I18nProvider defaultLocale={config.defaultLocale}>{page}</I18nProvider>
    </StrictMode>,
  );
}

void start();
