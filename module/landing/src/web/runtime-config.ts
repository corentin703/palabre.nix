import type { RuntimeConfig } from '../shared/api';

/** Applique la personnalisation de l'hôte : titre, couleur du navigateur, icône et CSS. */
export async function applyRuntimeConfig(
  config: RuntimeConfig,
  { customCss }: { customCss: boolean },
): Promise<void> {
  document.title = config.brandName;

  const themeColor = document.createElement('meta');
  themeColor.name = 'theme-color';
  themeColor.content = config.themeColor;
  document.head.append(themeColor);

  if (config.hasLogo) {
    const icon = document.createElement('link');
    icon.rel = 'icon';
    icon.href = '/visio-assets/logo';
    document.head.append(icon);
  }

  // Après la feuille de l'application, pour pouvoir tout surcharger ; on attend qu'elle soit
  // chargée pour ne pas afficher la page avec le style par défaut un instant.
  if (customCss && config.hasCustomCss) {
    await new Promise<void>((resolve) => {
      const style = document.createElement('link');
      style.rel = 'stylesheet';
      style.href = '/visio-assets/custom.css';
      style.onload = () => resolve();
      style.onerror = () => resolve();
      document.head.append(style);
    });
  }
}
