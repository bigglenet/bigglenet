// Sites that load straight from the internet ("direct" links): each gets a real Chromium page of
// its own, laid exactly over its tab (a "site view"), so it runs like it would in any browser:
// full speed, its own storage, cross-origin isolation for games that need it. The person can pop
// one out into a window of its own. .biggle and .b pages don't come here: they run inside the
// Biggle browser's own page, as they do on the web.
//
// The Biggle browser (the web app) says where each view goes; see SiteView.svelte.
import { BrowserWindow, ipcMain, session, WebContentsView } from 'electron';
import { attachContextMenu } from './menus.js';

// All sites share one storage area, kept apart from the browser's own.
const PARTITION = 'persist:sites';

// What sites may use. No camera, microphone, location or notifications.
const ALLOWED = new Set(['fullscreen', 'pointerLock', 'keyboardLock', 'clipboard-sanitized-write']);

// Bigglenet's own shortcuts still work while a site has the keyboard.
const SHORTCUT = /^([twlr[\]]|[1-9])$/;

const isMac = process.platform === 'darwin';

export function setupSites(getMain) {
  const sites = session.fromPartition(PARTITION);
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
      const key = input.key.length === 1 ? input.key.toLowerCase() : input.key;
      if (inTab && ((mod && !input.alt && SHORTCUT.test(key)) || key === 'F5')) {
        // In a tab, they work the Biggle browser, like they do everywhere else in it.
        event.preventDefault();
        getMain()?.webContents.focus();
        getMain()?.webContents.send('shortcut', key === 'F5' ? 'r' : key);
      } else if (!inTab && mod && key === 'w') {
        // In its own window, ⌘W / Ctrl+W closes that window.
        event.preventDefault();
        BrowserWindow.fromWebContents(contents)?.close();
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

  function closeView(site) {
    const view = views.get(site);
    if (!view) return;
    views.delete(site);
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
