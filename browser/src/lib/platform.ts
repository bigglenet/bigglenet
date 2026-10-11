// Differences between the desktop app (Tauri) and the PWA / plain web.

export const isApp = '__TAURI_INTERNALS__' in window;
const system = navigator.platform || navigator.userAgent;
const isMac = /Mac/.test(system);

/**
 * The desktop app on Windows and Linux has no system title bar: its tab bar is the title bar,
 * with its own minimize, maximize and close buttons. (macOS keeps its own window buttons.)
 */
export const ownWindowButtons = isApp && !isMac;

/** Open a normal-web link outside Biggle. */
export async function openExternal(url: string) {
  if (isApp) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

// Direct sites that have to be a top-level page (games that need cross-origin isolation, sites
// that won't be shown inside other apps) get a web view of their own in the desktop app: laid
// over the tab ("site view"), or popped out into a window. `relay` sends them through the app's
// relay on macOS and Linux, whose engine needs a slightly different isolation header.

/** Show a site view over the tab's page area, at these bounds (CSS pixels). */
export async function siteViewShow(site: string, url: string, relay: boolean, rect: DOMRect) {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('site_view_show', { site, url, relay, x: rect.left, y: rect.top, width: rect.width, height: rect.height });
}

export async function siteViewHide(site: string) {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('site_view_hide', { site });
}

export async function siteViewClose(site: string) {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('site_view_close', { site });
}

/** Called with a site's key and its page's title when the title changes. */
export async function onSiteViewTitle(handler: (site: string, title: string) => void): Promise<() => void> {
  const { listen } = await import('@tauri-apps/api/event');
  return listen<[string, string]>('site-view-title', (e) => handler(e.payload[0], e.payload[1]));
}

/** Open a site in a window of its own. If it's open already, it comes to the front. */
export async function openSiteWindow(site: string, url: string, title: string, relay: boolean) {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('open_site_window', { site, url, title, relay });
}

export async function closeSiteWindow(site: string) {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('close_site_window', { site });
}

/** Called with a site's key when its own window closes. Returns a function that stops listening. */
export async function onSiteWindowClosed(handler: (site: string) => void): Promise<() => void> {
  const { listen } = await import('@tauri-apps/api/event');
  return listen<string>('site-window-closed', (e) => handler(e.payload));
}

/** Close the desktop app's window (which quits it). */
export async function closeWindow() {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  await getCurrentWindow().close();
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
  // The tabs sit in the title bar: next to the window buttons on macOS, with our own elsewhere.
  document.documentElement.dataset.titlebar = isMac ? 'overlay' : 'custom';
  if (!isMac) document.documentElement.dataset.os = /Win/.test(system) ? 'windows' : 'linux';

  const { getCurrent, onOpenUrl } = await import('@tauri-apps/plugin-deep-link');
  (await getCurrent())?.forEach(open);
  await onOpenUrl((urls) => urls.forEach(open));
}
