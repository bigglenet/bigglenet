// Differences between the desktop app (Electron, see desktop/) and the PWA / plain web.

type Rect = { x: number; y: number; width: number; height: number };
type Stop = () => void;
export type ScreenSource = { id: string; name: string; thumbnail: string; screen: boolean };

/** What the desktop app offers the browser (desktop/preload/preload.cjs). */
type Desktop = {
  openExternal(url: string): Promise<void>;
  window: {
    minimize(): Promise<void>;
    toggleMaximize(): Promise<void>;
    close(): Promise<void>;
    isMaximized(): Promise<boolean>;
    onMaximizedChange(callback: (maximized: boolean) => void): Stop;
    /** Whether Bigglenet's window is the one in use (a site view in it counts). */
    isFocused(): Promise<boolean>;
    /** Bring Bigglenet's window to the front. */
    focus(): Promise<void>;
    fullscreen(on: boolean): Promise<void>;
    onFullscreenChange(callback: (on: boolean) => void): Stop;
    newWindow(open: string | null, opts?: { x?: number; y?: number; private?: boolean }): Promise<void>;
    capture(rect: Rect | null, width?: number): Promise<string | null>;
  };
  links: { initial(): Promise<string[]>; onOpen(callback: (url: string) => void): Stop };
  sites: {
    show(id: string, url: string, rect: Rect, opts?: { private?: boolean }): Promise<void>;
    hide(id: string): Promise<void>;
    close(id: string): Promise<void>;
    onTitle(callback: (id: string, title: string) => void): Stop;
    onAudio(callback: (id: string, audible: boolean) => void): Stop;
    onHover(callback: (id: string, url: string) => void): Stop;
    onZoomRequest(callback: (id: string, by: 1 | -1) => void): Stop;
    onPermission(callback: (id: string, requestId: number, origin: string, what: string) => void): Stop;
    onFocus(callback: (id: string) => void): Stop;
    answerPermission(requestId: number, allow: boolean, remember: boolean): Promise<void>;
    permissions(): Promise<Record<string, Record<string, boolean>>>;
    forgetPermissions(origin: string): Promise<void>;
    clearData(url: string): Promise<void>;
    openWindow(id: string, url: string, title: string, opts?: { private?: boolean }): Promise<void>;
    closeWindow(id: string): Promise<void>;
    onWindowClosed(callback: (id: string) => void): Stop;
    find(id: string, text: string, options: { forward: boolean; first: boolean }): Promise<{ count: number; index: number } | null>;
    stopFind(id: string): Promise<void>;
    zoom(id: string, factor: number): Promise<void>;
    mute(id: string, muted: boolean): Promise<void>;
    dark(id: string, on: boolean): Promise<void>;
    capture(id: string, width?: number): Promise<string | null>;
    run(id: string, action: 'reader' | 'pip' | 'print' | 'fps'): Promise<unknown>;
    metrics(id: string): Promise<{ cpu: number; memory: number } | null>;
  };
  downloads: {
    list(): Promise<Download[]>;
    start(url: string): Promise<void>;
    open(id: number): Promise<void>;
    show(id: number): Promise<void>;
    cancel(id: number): Promise<void>;
    pause(id: number): Promise<void>;
    resume(id: number): Promise<void>;
    forget(id?: number): Promise<Download[]>;
    onUpdate(callback: (d: Download) => void): Stop;
  };
  onShortcut(callback: (key: string) => void): Stop;
  info(): Promise<{ version: string; electron: string; chromium: string; packaged: boolean }>;
  updates: {
    check(): Promise<{ version: string; downloaded: boolean } | null>;
    download(): Promise<{ version: string }>;
    install(): Promise<void>;
    onCheckRequested(callback: () => void): Stop;
  };
  /** The unread count on the app's icon. `image`: the same as a picture, for Windows' taskbar. */
  badge(count: number, image: string | null): Promise<void>;
  screen: {
    onChoose(callback: (id: number, sources: ScreenSource[]) => void): Stop;
    chosen(id: number, sourceId: string | null): Promise<void>;
  };
};

export type Download = {
  id: number;
  name: string;
  url: string;
  path: string;
  received: number;
  total: number;
  state: 'progressing' | 'paused' | 'completed' | 'cancelled' | 'interrupted';
  at: number;
};

/** The desktop app, when running inside it. */
export const desktop = (window as unknown as { bigglenet?: Desktop }).bigglenet;
export const isApp = !!desktop;
const system = navigator.platform || navigator.userAgent;
export const isMac = /Mac|iPhone|iPad/.test(system);

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

/** Show a site view over the tab's page area, at these bounds (CSS pixels). `id`: the tab's. */
export async function siteViewShow(id: string, url: string, rect: DOMRect, opts?: { private?: boolean }) {
  await desktop?.sites.show(id, url, { x: rect.left, y: rect.top, width: rect.width, height: rect.height }, opts);
}

export async function siteViewHide(id: string) {
  await desktop?.sites.hide(id);
}

export async function siteViewClose(id: string) {
  await desktop?.sites.close(id);
}

/** Called with a tab's id and its site's title when the title changes. */
export async function onSiteViewTitle(handler: (id: string, title: string) => void): Promise<Stop> {
  return desktop?.sites.onTitle(handler) ?? (() => {});
}

/** Open a site in a window of its own. If it's open already, it comes to the front. */
export async function openSiteWindow(id: string, url: string, title: string, opts?: { private?: boolean }) {
  await desktop?.sites.openWindow(id, url, title, opts);
}

export async function closeSiteWindow(id: string) {
  await desktop?.sites.closeWindow(id);
}

/** Called with a tab's id when its site's own window closes. Returns a function that stops listening. */
export async function onSiteWindowClosed(handler: (id: string) => void): Promise<Stop> {
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
