// The Bigglenet desktop app (Electron). Its window shows the Biggle browser, the same web app as
// on phones (browser/), loaded from the app's own files. .biggle and .b pages run inside it just
// as on the web; sites straight from the internet get real Chromium pages over their tab
// (sites.js).
import { app, BrowserWindow, desktopCapturer, ipcMain, nativeImage, nativeTheme, net, protocol, session, shell } from 'electron';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setupLinks } from './links.js';
import { attachContextMenu, setupMenu } from './menus.js';
import { migrateOldData, setupMigration } from './migrate.js';
import { setupSites } from './sites.js';
import { setupUpdater } from './updater.js';

const here = dirname(fileURLToPath(import.meta.url));
const isMac = process.platform === 'darwin';
const isWindows = process.platform === 'win32';

// Where the browser is served from. On Windows it's the address the older app used, so what it
// saved carries over (see migrate.js). In development, Vite's server (npm run dev in browser/).
const APP_URL = isWindows ? 'http://tauri.localhost/' : 'app://bigglenet/';
const DEV_URL = process.env.BIGGLE_DEV_URL || 'http://localhost:5173/';
const useDevServer = !app.isPackaged && !process.env.BIGGLE_FILES;
const appFiles = app.isPackaged ? join(process.resourcesPath, 'app') : join(here, '../../browser/dist');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } },
]);

// Ubuntu 24.04 and later stop AppImages from setting up Chromium's sandbox (AppArmor restricts
// the user namespaces it needs), and Electron won't start at all. Only then, start without it,
// as other Electron apps do there. Installed .deb and .rpm packages keep the sandbox.
if (process.platform === 'linux' && process.env.APPIMAGE) {
  try {
    if (readFileSync('/proc/sys/kernel/apparmor_restrict_unprivileged_userns', 'utf8').trim() === '1') {
      app.commandLine.appendSwitch('no-sandbox');
    }
  } catch {}
}

// Browser windows. Usually one; dragging a tab out of the tab bar makes another. getMain() is
// the one used last (where links from other apps and the menu's commands go).
const windows = new Set();
let lastUsed = null;
const getMain = () => {
  if (lastUsed && !lastUsed.isDestroyed()) return lastUsed;
  return [...windows].find((w) => !w.isDestroyed()) ?? null;
};
const windowOf = (event) => BrowserWindow.fromWebContents(event.sender);

if (!setupLinks(getMain)) {
  // Bigglenet is already open; the link (if any) went to it.
  app.quit();
} else {
  // Windows shows notifications under this name (the installer's shortcuts use the same one).
  if (isWindows) app.setAppUserModelId('dev.ethembeldagli.bigglenet');
  migrateOldData();
  setupMigration();
  setupUpdater();
  app.whenReady().then(start);
}

/** The browser's files. Anything that isn't a file gets the app (it's a single-page app). */
function serveApp(request) {
  const path = normalize(join(appFiles, decodeURIComponent(new URL(request.url).pathname)));
  if (!path.startsWith(appFiles)) return new Response('Not found', { status: 404 });
  const file = existsSync(path) && statSync(path).isFile() ? path : join(appFiles, 'index.html');
  return net.fetch(pathToFileURL(file).toString());
}

function start() {
  if (isWindows) {
    // Only the app's own address is served from its files; everything else goes out as usual.
    protocol.handle('http', (request) =>
      new URL(request.url).host === 'tauri.localhost' ? serveApp(request) : net.fetch(request, { bypassCustomProtocolHandlers: true }),
    );
  } else {
    protocol.handle('app', serveApp);
  }

  // The browser's own page may use the camera and microphone (calls in chat.biggle), go full
  // screen, copy to the clipboard and show notifications (new messages). Nothing else.
  const allowed = new Set(['media', 'fullscreen', 'pointerLock', 'clipboard-sanitized-write', 'notifications']);
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => callback(allowed.has(permission)));
  session.defaultSession.setPermissionCheckHandler((_contents, permission) => allowed.has(permission));

  // Sharing your screen in a call: the system's own picker where there is one (macOS 15 and
  // later), otherwise the browser shows the screens and windows to pick from.
  const picks = new Map();
  let nextPick = 0;
  session.defaultSession.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      const main = getMain();
      let sources = [];
      try {
        sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 200 } });
      } catch {}
      if (!main || !sources.length) return callback({});
      const id = ++nextPick;
      picks.set(id, (sourceId) => {
        const source = sources.find((s) => s.id === sourceId);
        callback(source ? { video: source } : {});
      });
      main.webContents.send(
        'screen:choose',
        id,
        sources.map((s) => ({ id: s.id, name: s.name, thumbnail: s.thumbnail.toDataURL(), screen: s.id.startsWith('screen:') })),
      );
    },
    { useSystemPicker: true },
  );
  ipcMain.handle('screen:chosen', (_event, id, sourceId) => {
    picks.get(id)?.(typeof sourceId === 'string' ? sourceId : null);
    picks.delete(id);
  });

  // YouTube's player (watching together in a call) only plays on pages from a web address.
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['https://www.youtube-nocookie.com/*', 'https://www.youtube.com/*'] },
    (details, callback) => {
      const headers = { ...details.requestHeaders };
      if (!headers.Referer || !/^https:/.test(headers.Referer)) headers.Referer = 'https://bigglenet.ethembeldagli.dev/';
      callback({ requestHeaders: headers });
    },
  );

  setupMenu(getMain, (open) => createWindow(open));
  closeSites = setupSites();

  ipcMain.handle('window:minimize', (event) => windowOf(event)?.minimize());
  ipcMain.handle('window:toggle-maximize', (event) => {
    const win = windowOf(event);
    if (win) win.isMaximized() ? win.unmaximize() : win.maximize();
  });
  ipcMain.handle('window:close', (event) => windowOf(event)?.close());
  ipcMain.handle('window:is-maximized', (event) => !!windowOf(event)?.isMaximized());
  // Bigglenet is the app in use: one of its windows (or a site popped out of one) has focus.
  ipcMain.handle('window:is-focused', () => !!BrowserWindow.getFocusedWindow());
  ipcMain.handle('window:focus', (event) => {
    const win = windowOf(event);
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
  ipcMain.handle('window:fullscreen', (event, on) => windowOf(event)?.setFullScreen(!!on));
  /** A new browser window, opening an address (a tab dragged out of the tab bar). */
  ipcMain.handle('window:new', (event, open, opts = {}) => {
    const from = windowOf(event);
    const at = from && opts.x !== undefined ? { x: Math.round(opts.x), y: Math.round(opts.y) } : null;
    createWindow(typeof open === 'string' && /^biggle:/i.test(open) ? open : null, { ...at, private: !!opts.private });
  });
  /** A picture of part of the window (screenshots, tab previews). CSS pixels. */
  ipcMain.handle('window:capture', async (event, rect, width) => {
    const win = windowOf(event);
    if (!win) return null;
    const r = rect && { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.max(1, Math.round(rect.width)), height: Math.max(1, Math.round(rect.height)) };
    const image = await win.webContents.capturePage(r);
    return (width ? image.resize({ width: Math.round(width) }) : image).toDataURL();
  });
  // Unread messages on the app's icon: a number on the Dock (and Linux launchers that show one),
  // a red dot with the number over the taskbar button on Windows.
  ipcMain.handle('app:badge', (_event, count, image) => {
    const n = Math.max(0, Math.floor(Number(count) || 0));
    if (isWindows) {
      const icon = n && typeof image === 'string' && image.startsWith('data:image/png') ? nativeImage.createFromDataURL(image) : null;
      for (const win of windows) if (!win.isDestroyed()) win.setOverlayIcon(icon, n ? `${n} unread` : '');
    } else {
      app.setBadgeCount(n);
    }
  });
  ipcMain.handle('shell:open-external', (_event, url) => {
    if (typeof url === 'string' && /^(https?|mailto|tel):/i.test(url)) return shell.openExternal(url);
  });

  createWindow(null);
}

let closeSites = () => {};

/** A browser window. `open`: a biggle:// address for its first tab. */
function createWindow(open, opts = {}) {
  const query = new URLSearchParams();
  if (open) query.set('open', open);
  if (opts.private) query.set('private', '1');
  const main = new BrowserWindow({
    width: 1280,
    height: 820,
    ...(opts.x !== undefined ? { x: opts.x, y: opts.y } : {}),
    minWidth: 420,
    minHeight: 400,
    title: 'Bigglenet',
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#161616' : '#e7e4dd',
    // The tabs are the title bar: next to the window buttons on macOS, with the browser's own
    // buttons on Windows and Linux.
    ...(isMac ? { titleBarStyle: 'hidden', trafficLightPosition: { x: 18, y: 18 } } : { frame: false }),
    ...(process.platform === 'linux' ? { icon: join(here, '../build/icon.png') } : {}),
    webPreferences: {
      preload: join(here, '../preload/preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      devTools: !app.isPackaged,
    },
  });
  windows.add(main);
  lastUsed = main;
  const contentsId = main.webContents.id;
  main.once('ready-to-show', () => main.show());
  main.on('focus', () => (lastUsed = main));
  main.on('maximize', () => main.webContents.send('window:maximized', true));
  main.on('unmaximize', () => main.webContents.send('window:maximized', false));
  main.on('enter-full-screen', () => main.webContents.send('window:fullscreen', true));
  main.on('leave-full-screen', () => main.webContents.send('window:fullscreen', false));
  main.on('closed', () => {
    closeSites(contentsId);
    windows.delete(main);
    if (lastUsed === main) lastUsed = null;
  });
  attachContextMenu(main.webContents);

  // The browser stays the browser: it never navigates away, and anything that tries to open a
  // window goes to the system browser instead.
  const home = useDevServer ? new URL(DEV_URL).origin : new URL(APP_URL).origin;
  main.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== home) event.preventDefault();
  });
  main.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto|tel):/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  const base = useDevServer ? DEV_URL : APP_URL;
  main.loadURL(query.size ? `${base}?${query}` : base);
  return main;
}

// Closing the window quits, on every system (as before).
app.on('window-all-closed', () => app.quit());
