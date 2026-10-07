// Differences between the desktop app (Tauri) and the PWA / plain web.

export const isApp = '__TAURI_INTERNALS__' in window;
const isMac = /Mac/.test(navigator.platform || navigator.userAgent);

/** Open a normal-web link outside Biggle. */
export async function openExternal(url: string) {
  if (isApp) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

/** The PWA's offline cache. Registered even on the install screen, so phones can install it. */
export function registerServiceWorker() {
  if (!isApp && import.meta.env.PROD && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

/** Set up the app shell. `open` is called with biggle:// links from other apps. */
export async function initPlatform(open: (href: string) => void) {
  if (!isApp) return;
  // On macOS the tabs sit in the title bar, next to the window buttons.
  if (isMac) document.documentElement.dataset.titlebar = 'overlay';

  const { getCurrent, onOpenUrl } = await import('@tauri-apps/plugin-deep-link');
  (await getCurrent())?.forEach(open);
  await onOpenUrl((urls) => urls.forEach(open));
}
