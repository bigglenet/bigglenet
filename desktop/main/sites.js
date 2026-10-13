// Sites that load straight from the internet ("direct" links): each gets a real Chromium page of
// its own, laid exactly over its tab (a "site view"), so it runs like it would in any browser:
// full speed, its own storage, cross-origin isolation for games that need it. The person can pop
// one out into a window of its own. .biggle and .b pages don't come here: they run inside the
// Biggle browser's own page, as they do on the web.
//
// The Biggle browser (the web app) in each window says where its views go (SiteView.svelte). A
// view is known by its window and the id the browser gives it (its tab's id).
import { app, BrowserWindow, ipcMain, session, WebContentsView } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setupAdblock } from './adblock.js';
import { setupDownloads } from './downloads.js';
import { t } from './language.js';
import { attachContextMenu } from './menus.js';
import { READER_SCRIPT } from './reader.js';

// All sites share one storage area, kept apart from the browser's own. Private tabs get one that
// lives only until Bigglenet quits.
const PARTITION = 'persist:sites';
const PRIVATE_PARTITION = 'sites-private';

// Always fine. Camera, microphone, location, notifications and MIDI are asked about, per site.
const ALLOWED = new Set(['fullscreen', 'pointerLock', 'keyboardLock', 'clipboard-sanitized-write']);
const ASKABLE = new Set(['media', 'geolocation', 'notifications', 'midi', 'midiSysex']);

const isMac = process.platform === 'darwin';

// Bigglenet's own shortcuts still work while a site has the keyboard, by the same names the
// browser uses (browser/src/lib/keys.ts).
const SHORTCUTS = new Set([
  't', 'shift+t', 'w', 'l', 'r', '[', ']', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  'd', 'shift+b', 'f', 'g', 'shift+g', '=', '-', '0', isMac ? 'y' : 'h', isMac ? 'shift+j' : 'j',
  'k', 'shift+a', 'shift+n', 'p', 'shift+s', 'shift+r', 'shift+f',
]);
// These act on the site itself, so the keyboard stays with it.
const IN_PLACE = new Set(['g', 'shift+g', '=', '-', '0', 'p', 'shift+s', 'shift+f']);
const ZOOMS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];

// Dark mode for sites that don't have one: everything turned around, except pictures and video.
const DARK_CSS = `html { filter: invert(1) hue-rotate(180deg) !important; background: #fff !important; }
img, video, picture, canvas, iframe, svg image, [style*="background-image"] { filter: invert(1) hue-rotate(180deg) !important; }`;

/** Same as shortcutName() in browser/src/lib/keys.ts. */
function shortcutName(input) {
  let key = input.key.length === 1 ? input.key.toLowerCase() : input.key;
  if (key === '+') key = '=';
  if (key === '_') key = '-';
  if (key === '=' || key === '-') return key;
  return input.shift ? `shift+${key}` : key;
}

// --- Permissions people gave sites (camera, location…), kept between runs ---

const permissionsFile = () => join(app.getPath('userData'), 'site-permissions.json');
function loadPermissions() {
  try {
    return JSON.parse(readFileSync(permissionsFile(), 'utf8'));
  } catch {
    return {};
  }
}
let permissions = null;
function savePermissions() {
  try {
    writeFileSync(permissionsFile(), JSON.stringify(permissions));
  } catch {}
}

export function setupSites() {
  permissions = loadPermissions();
  const persistent = session.fromPartition(PARTITION);
  const privateSession = session.fromPartition(PRIVATE_PARTITION);

  /** `${window id}:${view id}` → { view, owner, id, zoom, dark }. */
  const views = new Map();
  /** Same, for sites popped out into windows of their own. */
  const popped = new Map();
  const keyFor = (sender, id) => `${sender.id}:${id}`;
  const entryFor = (contents) => [...views.values()].find((e) => e.view.webContents === contents) ?? null;

  // Permission prompts: answered by the person in the browser (SiteView.svelte).
  const pending = new Map();
  let nextRequest = 0;

  for (const s of [persistent, privateSession]) {
    // No ads or trackers (uBlock Origin's lists, see adblock.js).
    setupAdblock(s);
    s.setPermissionCheckHandler((_contents, permission, origin) => {
      if (ALLOWED.has(permission)) return true;
      return !!origin && permissions[new URL(origin).origin]?.[permission] === true;
    });
    s.setPermissionRequestHandler((contents, permission, callback, details) => {
      if (ALLOWED.has(permission)) return callback(true);
      if (!ASKABLE.has(permission)) return callback(false);
      let origin;
      try {
        origin = new URL(details.requestingUrl).origin;
      } catch {
        return callback(false);
      }
      const saved = permissions[origin]?.[permission];
      if (saved !== undefined) return callback(saved);
      const entry = entryFor(contents);
      if (!entry || entry.owner.isDestroyed()) return callback(false);
      const id = ++nextRequest;
      const what = permission === 'media' ? (details.mediaTypes?.includes('video') ? 'camera' : 'microphone') : permission;
      pending.set(id, { callback, origin, permission, private: s === privateSession });
      entry.owner.webContents.send('site-view:permission', entry.id, id, origin, what);
    });
  }
  // Downloads from sites, and from the browser's own page (.biggle pages, chat files).
  setupDownloads([persistent, privateSession, session.defaultSession]);

  ipcMain.handle('site-permission:answer', (_event, requestId, allow, remember) => {
    const p = pending.get(requestId);
    if (!p) return;
    pending.delete(requestId);
    if (remember && !p.private) {
      permissions[p.origin] = { ...permissions[p.origin], [p.permission]: !!allow };
      savePermissions();
    }
    p.callback(!!allow);
  });
  ipcMain.handle('site-permissions:list', () => permissions);
  ipcMain.handle('site-permissions:forget', (_event, origin) => {
    delete permissions[origin];
    savePermissions();
  });
  ipcMain.handle('site-data:clear', async (_event, url) => {
    const origin = new URL(url).origin;
    await persistent.clearStorageData({ origin });
  });

  /** A site's page: its pop-ups open as windows, and its context menu offers copy and paste. */
  function wire(contents, entry) {
    contents.setWindowOpenHandler(({ url }) =>
      /^https?:/i.test(url)
        ? { action: 'allow', overrideBrowserWindowOptions: { width: 1280, height: 760, autoHideMenuBar: true } }
        : { action: 'deny' },
    );
    contents.on('did-create-window', (child) => wire(child.webContents, null));
    attachContextMenu(contents, { site: true });
    contents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;
      const mod = isMac ? input.meta && !input.control : input.control && !input.meta;
      const key = input.key === 'F5' ? 'r' : mod && !input.alt ? shortcutName(input) : null;
      if (entry && key && (SHORTCUTS.has(key) || input.key === 'F5')) {
        // In a tab, they work the Biggle browser, like they do everywhere else in it.
        event.preventDefault();
        if (entry.owner.isDestroyed()) return;
        if (!IN_PLACE.has(key)) entry.owner.webContents.focus();
        entry.owner.webContents.send('shortcut', key);
      } else if (!entry && key === 'w') {
        // In its own window, ⌘W / Ctrl+W closes that window…
        event.preventDefault();
        BrowserWindow.fromWebContents(contents)?.close();
      } else if (!entry && (key === '=' || key === '-' || key === '0')) {
        // …and ⌘+ / ⌘− / ⌘0 zoom it.
        event.preventDefault();
        zoomStep(contents, key);
      }
    });
    if (!entry) {
      contents.on('zoom-changed', (_e, direction) => zoomStep(contents, direction === 'in' ? '=' : '-'));
      return;
    }
    // Ctrl or ⌘ and the wheel (or a pinch) zoom it, the browser's way, remembered per site.
    contents.on('zoom-changed', (_e, direction) => send(entry, 'site-view:zoom-request', direction === 'in' ? 1 : -1));
    contents.on('audio-state-changed', (e) => send(entry, 'site-view:audio', e.audible));
    contents.on('update-target-url', (_e, url) => send(entry, 'site-view:hover', url));
    contents.on('page-title-updated', (_e, title) => send(entry, 'site-view:title', title));
    contents.on('did-navigate', () => {
      contents.setZoomFactor(entry.zoom);
      if (entry.dark) applyDark(entry, true);
    });
    contents.on('did-navigate-in-page', () => send(entry, 'site-view:url', contents.getURL()));
    // Clicking into a site makes its tab the active one (side by side, two are showing).
    contents.on('focus', () => send(entry, 'site-view:focus'));
  }

  function send(entry, channel, ...args) {
    if (!entry.owner.isDestroyed()) entry.owner.webContents.send(channel, entry.id, ...args);
  }

  function zoomStep(contents, key) {
    const i = ZOOMS.findIndex((z) => z >= contents.getZoomFactor() - 0.001);
    const next = key === '0' ? 1 : ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, (i === -1 ? ZOOMS.length - 1 : i) + (key === '=' ? 1 : -1)))];
    contents.setZoomFactor(next);
  }

  async function applyDark(entry, on) {
    const contents = entry.view.webContents;
    if (entry.darkKey) await contents.removeInsertedCSS(entry.darkKey).catch(() => {});
    entry.darkKey = on ? await contents.insertCSS(DARK_CSS).catch(() => null) : null;
  }

  const get = (event, id) => views.get(keyFor(event.sender, id));

  ipcMain.handle('site-view:show', (event, id, url, rect, opts = {}) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    if (!owner) return;
    const key = keyFor(event.sender, id);
    let entry = views.get(key);
    if (!entry) {
      if (!/^https?:\/\//i.test(url)) throw new Error(t("That isn't a web address."));
      const view = new WebContentsView({
        webPreferences: { partition: opts.private ? PRIVATE_PARTITION : PARTITION, sandbox: true, contextIsolation: true },
      });
      entry = { view, owner, id, zoom: 1, dark: false, darkKey: null };
      views.set(key, entry);
      wire(view.webContents, entry);
      owner.contentView.addChildView(view);
      view.webContents.loadURL(url);
    }
    entry.view.setBounds({
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.max(1, Math.round(rect.width)),
      height: Math.max(1, Math.round(rect.height)),
    });
    entry.view.setVisible(true);
  });

  ipcMain.handle('site-view:hide', (event, id) => get(event, id)?.view.setVisible(false));

  ipcMain.handle('site-view:zoom', (event, id, factor) => {
    const entry = get(event, id);
    const z = Number(factor);
    if (!entry || !(z >= 0.25 && z <= 5)) return;
    entry.zoom = z;
    entry.view.webContents.setZoomFactor(z);
  });

  ipcMain.handle('site-view:mute', (event, id, muted) => get(event, id)?.view.webContents.setAudioMuted(!!muted));
  ipcMain.handle('site-view:dark', (event, id, on) => {
    const entry = get(event, id);
    if (!entry) return;
    entry.dark = !!on;
    return applyDark(entry, entry.dark);
  });

  /** A picture of the page: small for tab previews, full size for screenshots. */
  ipcMain.handle('site-view:capture', async (event, id, width) => {
    const entry = get(event, id);
    if (!entry) return null;
    // Fails while the window can't be seen (hidden, or on another space): no picture then.
    const image = await entry.view.webContents.capturePage().catch(() => null);
    if (!image) return null;
    return (width ? image.resize({ width: Math.round(width) }) : image).toDataURL();
  });

  /** Things the browser asks of a site: reader mode, picture-in-picture, printing. */
  ipcMain.handle('site-view:run', async (event, id, action) => {
    const entry = get(event, id);
    if (!entry) return null;
    const contents = entry.view.webContents;
    if (action === 'reader') return contents.executeJavaScript(READER_SCRIPT).catch(() => null);
    if (action === 'pip') {
      return contents
        .executeJavaScript(
          `(() => { const v = [...document.querySelectorAll('video')].filter((v) => v.readyState > 0).sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
             if (!v) return false; (document.pictureInPictureElement === v ? document.exitPictureInPicture() : v.requestPictureInPicture()).catch(() => {}); return true; })()`,
          true,
        )
        .catch(() => false);
    }
    if (action === 'print') return new Promise((resolve) => contents.print({}, (ok) => resolve(ok)));
    if (action === 'fps') {
      // Frames drawn since last asked, counted in the page.
      return contents
        .executeJavaScript(
          `(() => { const w = window; if (!w.__biggleFps) { w.__biggleFps = { n: 0, at: performance.now() }; const tick = () => { w.__biggleFps.n++; requestAnimationFrame(tick); }; requestAnimationFrame(tick); return null; }
             const f = w.__biggleFps, now = performance.now(), fps = (f.n * 1000) / (now - f.at); f.n = 0; f.at = now;
             return { fps, memory: performance.memory ? performance.memory.usedJSHeapSize : null }; })()`,
        )
        .catch(() => null);
    }
    return null;
  });

  // Find in page: Chromium's own, for sites in their tabs. Resolves with how many matches there
  // are and which one is showing (from 0), or null when the site isn't open.
  ipcMain.handle('site-view:find', (event, id, text, { forward = true, first = true } = {}) => {
    const contents = get(event, id)?.view.webContents;
    if (!contents || typeof text !== 'string' || !text) return null;
    return new Promise((resolve) => {
      let requestId = 0;
      const timer = setTimeout(() => finish(null), 3000);
      function finish(result) {
        clearTimeout(timer);
        contents.off('found-in-page', onFound);
        resolve(result);
      }
      function onFound(_e, result) {
        if (result.requestId === requestId && result.finalUpdate) finish({ count: result.matches, index: result.activeMatchOrdinal - 1 });
      }
      contents.on('found-in-page', onFound);
      requestId = contents.findInPage(text, { forward, findNext: first });
    });
  });
  ipcMain.handle('site-view:find-stop', (event, id) => get(event, id)?.view.webContents.stopFindInPage('clearSelection'));

  /** How much memory and processor each site view uses (the performance overlay). */
  ipcMain.handle('site-view:metrics', (event, id) => {
    const contents = get(event, id)?.view.webContents;
    if (!contents) return null;
    const pid = contents.getOSProcessId();
    const metric = app.getAppMetrics().find((m) => m.pid === pid);
    return metric ? { cpu: metric.cpu.percentCPUUsage, memory: metric.memory.workingSetSize * 1024 } : null;
  });

  function closeEntry(key) {
    const entry = views.get(key);
    if (!entry) return;
    views.delete(key);
    if (!entry.owner.isDestroyed()) entry.owner.contentView.removeChildView(entry.view);
    entry.view.webContents.close();
  }
  ipcMain.handle('site-view:close', (event, id) => closeEntry(keyFor(event.sender, id)));

  ipcMain.handle('site-window:open', (event, id, url, title, opts = {}) => {
    const key = keyFor(event.sender, id);
    const existing = popped.get(key);
    if (existing) {
      if (existing.isMinimized()) existing.restore();
      existing.focus();
      return;
    }
    if (!/^https?:\/\//i.test(url)) throw new Error(t("That isn't a web address."));
    const win = new BrowserWindow({
      width: 1280,
      height: 760,
      minWidth: 400,
      minHeight: 300,
      title,
      autoHideMenuBar: true,
      webPreferences: { partition: opts.private ? PRIVATE_PARTITION : PARTITION, sandbox: true, contextIsolation: true },
    });
    popped.set(key, win);
    wire(win.webContents, null);
    win.on('closed', () => {
      popped.delete(key);
      // Let the tab know, so it can offer to open it again.
      if (!event.sender.isDestroyed()) event.sender.send('site-window:closed', id);
    });
    win.loadURL(url);
  });

  ipcMain.handle('site-window:close', (event, id) => popped.get(keyFor(event.sender, id))?.close());

  /** A browser window is closing (its page's id): its sites go with it. */
  return function closeFor(contentsId) {
    const prefix = `${contentsId}:`;
    for (const key of [...views.keys()]) if (key.startsWith(prefix)) closeEntry(key);
    for (const [key, win] of popped) if (key.startsWith(prefix)) win.destroy();
  };
}
