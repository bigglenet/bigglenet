// Differences between the desktop app (Electron, see desktop/) and the PWA / plain web.

type Rect = { x: number; y: number; width: number; height: number };
type Stop = () => void;

/** What the desktop app offers the browser (desktop/preload/preload.cjs). */
type Desktop = {
  openExternal(url: string): Promise<void>;
  window: {
    minimize(): Promise<void>;
    toggleMaximize(): Promise<void>;
    close(): Promise<void>;
    isMaximized(): Promise<boolean>;
    onMaximizedChange(callback: (maximized: boolean) => void): Stop;
  };
  links: { initial(): Promise<string[]>; onOpen(callback: (url: string) => void): Stop };
  sites: {
    show(site: string, url: string, rect: Rect): Promise<void>;
    hide(site: string): Promise<void>;
    close(site: string): Promise<void>;
    onTitle(callback: (site: string, title: string) => void): Stop;
    openWindow(site: string, url: string, title: string): Promise<void>;
    closeWindow(site: string): Promise<void>;
    onWindowClosed(callback: (site: string) => void): Stop;
  };
  onShortcut(callback: (key: string) => void): Stop;
  info(): Promise<{ version: string; electron: string; chromium: string; packaged: boolean }>;
  updates: {
    check(): Promise<{ version: string; downloaded: boolean } | null>;
    download(): Promise<{ version: string }>;
    install(): Promise<void>;
    onCheckRequested(callback: () => void): Stop;
  };
};

/** The desktop app, when running inside it. */
export const desktop = (window as unknown as { bigglenet?: Desktop }).bigglenet;
export const isApp = !!desktop;
const system = navigator.platform || navigator.userAgent;
const isMac = /Mac/.test(system);

/**
 * The desktop app on Windows and Linux has no system title bar: its tab bar is the title bar,
 * with its own minimize, maximize and close buttons. (macOS keeps its own window buttons.)
 */
export const ownWindowButtons = isApp && !isMac;

/** Open a normal-web link outside Biggle. */
export async function openExternal(url: string) {
  if (desktop) await desktop.openExternal(url);
  else window.open(url, '_blank', 'noopener,noreferrer');
}

// Sites straight from the internet get a real Chromium page of their own in the desktop app,
// laid over their tab ("site view"), or popped out into a window. See desktop/main/sites.js.

/** Show a site view over the tab's page area, at these bounds (CSS pixels). */
export async function siteViewShow(site: string, url: string, rect: DOMRect) {
  await desktop?.sites.show(site, url, { x: rect.left, y: rect.top, width: rect.width, height: rect.height });
}

export async function siteViewHide(site: string) {
  await desktop?.sites.hide(site);
}

export async function siteViewClose(site: string) {
  await desktop?.sites.close(site);
}

/** Called with a site's key and its page's title when the title changes. */
export async function onSiteViewTitle(handler: (site: string, title: string) => void): Promise<Stop> {
  return desktop?.sites.onTitle(handler) ?? (() => {});
}

/** Open a site in a window of its own. If it's open already, it comes to the front. */
export async function openSiteWindow(site: string, url: string, title: string) {
  await desktop?.sites.openWindow(site, url, title);
}

export async function closeSiteWindow(site: string) {
  await desktop?.sites.closeWindow(site);
}

/** Called with a site's key when its own window closes. Returns a function that stops listening. */
export async function onSiteWindowClosed(handler: (site: string) => void): Promise<Stop> {
  return desktop?.sites.onWindowClosed(handler) ?? (() => {});
}

/** Close the desktop app's window (which quits it). */
export async function closeWindow() {
  await desktop?.window.close();
}

/** The PWA's offline cache. Registered even on the install screen, so phones can install it. */
export function registerServiceWorker() {
  if (!isApp && import.meta.env.PROD && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

/**
 * Set up the app shell. `open` is called with biggle:// links from other apps, `shortcut` with
 * keyboard shortcuts pressed while a site view has the keyboard.
 */
export async function initPlatform(open: (href: string) => void, shortcut: (key: string) => void) {
  if (!desktop) return;
  // The tabs sit in the title bar: next to the window buttons on macOS, with our own elsewhere.
  document.documentElement.dataset.titlebar = isMac ? 'overlay' : 'custom';
  if (!isMac) document.documentElement.dataset.os = /Win/.test(system) ? 'windows' : 'linux';

  desktop.onShortcut(shortcut);
  (await desktop.links.initial()).forEach(open);
  desktop.links.onOpen(open);
}
