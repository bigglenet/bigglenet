// Sites that load straight from the internet ("direct" links): each gets a real Chromium page of
// its own, laid exactly over its tab (a "site view"), so it runs like it would in any browser:
// full speed, its own storage, cross-origin isolation for games that need it. The person can pop
// one out into a window of its own. .biggle and .b pages don't come here: they run inside the
// Biggle browser's own page, as they do on the web.
//
// The Biggle browser (the web app) says where each view goes; see SiteView.svelte.
import { BrowserWindow, ipcMain, session, WebContentsView } from 'electron';
import { setupAdblock } from './adblock.js';
import { attachContextMenu } from './menus.js';

// All sites share one storage area, kept apart from the browser's own.
const PARTITION = 'persist:sites';

// What sites may use. No camera, microphone, location or notifications.
const ALLOWED = new Set(['fullscreen', 'pointerLock', 'keyboardLock', 'clipboard-sanitized-write']);

const isMac = process.platform === 'darwin';

// Bigglenet's own shortcuts still work while a site has the keyboard, by the same names the
// browser uses (browser/src/lib/keys.ts): new tab, reopen a closed one, bookmark, find, zoom,
// history (⌘Y on a Mac, Ctrl+H elsewhere)…
const SHORTCUTS = new Set([
  't', 'shift+t', 'w', 'l', 'r', '[', ']', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  'd', 'shift+b', 'f', 'g', 'shift+g', '=', '-', '0', isMac ? 'y' : 'h',
]);
// These act on the site itself, so the keyboard stays with it.
const IN_PLACE = new Set(['g', 'shift+g', '=', '-', '0']);
const ZOOMS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];

/** Same as shortcutName() in browser/src/lib/keys.ts. */
function shortcutName(input) {
  let key = input.key.length === 1 ? input.key.toLowerCase() : input.key;
  if (key === '+') key = '=';
  if (key === '_') key = '-';
  if (key === '=' || key === '-') return key;
  return input.shift ? `shift+${key}` : key;
}

export function setupSites(getMain) {
  const sites = session.fromPartition(PARTITION);
  // No ads or trackers (uBlock Origin's lists, see adblock.js).
  setupAdblock(sites);
  sites.setPermissionRequestHandler((_contents, permission, callback) => callback(ALLOWED.has(permission)));
  sites.setPermissionCheckHandler((_contents, permission) => ALLOWED.has(permission));

  /** site key → its view over the tab, or its own window. */
  const views = new Map();
  const windows = new Map();

  /** A site's page: its pop-ups open as windows, and its context menu offers copy and paste. */
  function wire(contents, { inTab }) {
    contents.setWindowOpenHandler(({ url }) =>
      /^https?:/i.test(url)
        ? { action: 'allow', overrideBrowserWindowOptions: { width: 1280, height: 760, autoHideMenuBar: true } }
        : { action: 'deny' },
    );
    contents.on('did-create-window', (child) => wire(child.webContents, { inTab: false }));
    attachContextMenu(contents);
    contents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;
      const mod = isMac ? input.meta && !input.control : input.control && !input.meta;
      const key = input.key === 'F5' ? 'r' : mod && !input.alt ? shortcutName(input) : null;
      if (inTab && key && (SHORTCUTS.has(key) || input.key === 'F5')) {
        // In a tab, they work the Biggle browser, like they do everywhere else in it.
        event.preventDefault();
        if (!IN_PLACE.has(key)) getMain()?.webContents.focus();
        getMain()?.webContents.send('shortcut', key);
      } else if (!inTab && key === 'w') {
        // In its own window, ⌘W / Ctrl+W closes that window…
        event.preventDefault();
        BrowserWindow.fromWebContents(contents)?.close();
      } else if (!inTab && (key === '=' || key === '-' || key === '0')) {
        // …and ⌘+ / ⌘− / ⌘0 zoom it.
        event.preventDefault();
        const i = ZOOMS.findIndex((z) => z >= contents.getZoomFactor() - 0.001);
        const next = key === '0' ? 1 : ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, (i === -1 ? ZOOMS.length - 1 : i) + (key === '=' ? 1 : -1)))];
        contents.setZoomFactor(next);
      }
    });
  }

  ipcMain.handle('site-view:show', (event, site, url, rect) => {
    const main = BrowserWindow.fromWebContents(event.sender);
    if (!main) return;
    let view = views.get(site);
    if (!view) {
      if (!/^https?:\/\//i.test(url)) throw new Error("That isn't a web address.");
      view = new WebContentsView({ webPreferences: { partition: PARTITION, sandbox: true, contextIsolation: true } });
      views.set(site, view);
      wire(view.webContents, { inTab: true });
      // The zoom the person picked for this site (Chromium resets it when the page changes).
      view.webContents.on('did-navigate', () => view.webContents.setZoomFactor(zooms.get(site) ?? 1));
      // The tab shows the page's title, like any other tab.
      view.webContents.on('page-title-updated', (_e, title) => main.webContents.send('site-view:title', site, title));
      main.contentView.addChildView(view);
      view.webContents.loadURL(url);
    }
    view.setBounds({
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.max(1, Math.round(rect.width)),
      height: Math.max(1, Math.round(rect.height)),
    });
    view.setVisible(true);
  });

  ipcMain.handle('site-view:hide', (_event, site) => views.get(site)?.setVisible(false));

  const zooms = new Map();
  ipcMain.handle('site-view:zoom', (_event, site, factor) => {
    const z = Number(factor);
    if (!(z >= 0.25 && z <= 5)) return;
    zooms.set(site, z);
    views.get(site)?.webContents.setZoomFactor(z);
  });

  // Find in page: Chromium's own, for sites in their tabs. Resolves with how many matches there
  // are and which one is showing (from 0), or null when the site isn't open.
  ipcMain.handle('site-view:find', (_event, site, text, { forward = true, first = true } = {}) => {
    const contents = views.get(site)?.webContents;
    if (!contents || typeof text !== 'string' || !text) return null;
    return new Promise((resolve) => {
      let id = 0;
      const timer = setTimeout(() => finish(null), 3000);
      function finish(result) {
        clearTimeout(timer);
        contents.off('found-in-page', onFound);
        resolve(result);
      }
      function onFound(_e, result) {
        if (result.requestId === id && result.finalUpdate) finish({ count: result.matches, index: result.activeMatchOrdinal - 1 });
      }
      contents.on('found-in-page', onFound);
      id = contents.findInPage(text, { forward, findNext: first });
    });
  });
  ipcMain.handle('site-view:find-stop', (_event, site) => views.get(site)?.webContents.stopFindInPage('clearSelection'));

  function closeView(site) {
    const view = views.get(site);
    if (!view) return;
    views.delete(site);
    zooms.delete(site);
    getMain()?.contentView.removeChildView(view);
    view.webContents.close();
  }
  ipcMain.handle('site-view:close', (_event, site) => closeView(site));

  ipcMain.handle('site-window:open', (event, site, url, title) => {
    const existing = windows.get(site);
    if (existing) {
      if (existing.isMinimized()) existing.restore();
      existing.focus();
      return;
    }
    if (!/^https?:\/\//i.test(url)) throw new Error("That isn't a web address.");
    const win = new BrowserWindow({
      width: 1280,
      height: 760,
      minWidth: 400,
      minHeight: 300,
      title,
      autoHideMenuBar: true,
      webPreferences: { partition: PARTITION, sandbox: true, contextIsolation: true },
    });
    windows.set(site, win);
    wire(win.webContents, { inTab: false });
    win.on('closed', () => {
      windows.delete(site);
      // Let the tab know, so it can offer to open it again.
      if (!event.sender.isDestroyed()) event.sender.send('site-window:closed', site);
    });
    win.loadURL(url);
  });

  ipcMain.handle('site-window:close', (_event, site) => windows.get(site)?.close());

  /** The browser's window is closing: every site goes with it. */
  return function closeAll() {
    for (const site of [...views.keys()]) closeView(site);
    for (const win of windows.values()) win.destroy();
  };
}
