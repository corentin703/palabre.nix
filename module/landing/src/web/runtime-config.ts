import type { RuntimeConfig } from '../shared/api';

/** Applies the host's customization: title, browser color, icon and CSS. */
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

  // After the application's stylesheet, so that it can override everything; we wait for it
  // to be loaded so the page is not shown with the default style for a moment.
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
