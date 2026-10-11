// The Bigglenet desktop app (Electron). Its window shows the Biggle browser, the same web app as
// on phones (browser/), loaded from the app's own files. .biggle and .b pages run inside it just
// as on the web; sites straight from the internet get real Chromium pages over their tab
// (sites.js).
import { app, BrowserWindow, ipcMain, nativeTheme, net, protocol, session, shell } from 'electron';
import { existsSync, statSync } from 'node:fs';
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

let main = null;
const getMain = () => (main && !main.isDestroyed() ? main : null);

if (!setupLinks(getMain)) {
  // Bigglenet is already open; the link (if any) went to it.
  app.quit();
} else {
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
  // screen and copy to the clipboard. Nothing else.
  const allowed = new Set(['media', 'fullscreen', 'pointerLock', 'clipboard-sanitized-write']);
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => callback(allowed.has(permission)));
  session.defaultSession.setPermissionCheckHandler((_contents, permission) => allowed.has(permission));

  setupMenu();
  const closeSites = setupSites(getMain);

  ipcMain.handle('window:minimize', () => getMain()?.minimize());
  ipcMain.handle('window:toggle-maximize', () => {
    const win = getMain();
    if (win) win.isMaximized() ? win.unmaximize() : win.maximize();
  });
  ipcMain.handle('window:close', () => getMain()?.close());
  ipcMain.handle('window:is-maximized', () => !!getMain()?.isMaximized());
  ipcMain.handle('shell:open-external', (_event, url) => {
    if (typeof url === 'string' && /^(https?|mailto|tel):/i.test(url)) return shell.openExternal(url);
  });

  main = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 420,
    minHeight: 400,
    title: 'Bigglenet',
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#161616' : '#e7e4dd',
    // The tabs are the title bar: next to the window buttons on macOS, with the browser's own
    // buttons on Windows and Linux.
    ...(isMac ? { titleBarStyle: 'hidden', trafficLightPosition: { x: 18, y: 13 } } : { frame: false }),
    ...(process.platform === 'linux' ? { icon: join(here, '../build/icon.png') } : {}),
    webPreferences: {
      preload: join(here, '../preload/preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      devTools: !app.isPackaged,
    },
  });
  main.once('ready-to-show', () => main.show());
  main.on('maximize', () => main.webContents.send('window:maximized', true));
  main.on('unmaximize', () => main.webContents.send('window:maximized', false));
  main.on('closed', () => {
    closeSites();
    main = null;
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

  main.loadURL(useDevServer ? DEV_URL : APP_URL);
}

// Closing the window quits, on every system (as before).
app.on('window-all-closed', () => app.quit());
