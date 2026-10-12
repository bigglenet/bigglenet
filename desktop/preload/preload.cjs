// What the Biggle browser (the web app) can ask of the desktop app: window.bigglenet. Pages inside
// it (.biggle sites) can't see this; it's only on the browser's own page.
const { contextBridge, ipcRenderer } = require('electron');

// The first time after updating from the older app on macOS or Linux, bring over what it had
// saved (see main/migrate.js). This runs before the browser's own scripts.
try {
  const old = ipcRenderer.sendSync('migrate:take');
  if (old) {
    for (const [key, value] of Object.entries(old)) {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
    }
  }
} catch {}

/** Listen for a message from the app. Returns a function that stops listening. */
function on(channel, callback) {
  const handler = (_event, ...args) => callback(...args);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('bigglenet', {
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    onMaximizedChange: (callback) => on('window:maximized', callback),
    isFocused: () => ipcRenderer.invoke('window:is-focused'),
    focus: () => ipcRenderer.invoke('window:focus'),
    fullscreen: (on) => ipcRenderer.invoke('window:fullscreen', on),
    onFullscreenChange: (callback) => on('window:fullscreen', callback),
    /** A new browser window, with a tab at `open` (a biggle:// address). */
    newWindow: (open, opts) => ipcRenderer.invoke('window:new', open, opts),
    /** A picture of part of this window (CSS pixels), optionally scaled to `width`. */
    capture: (rect, width) => ipcRenderer.invoke('window:capture', rect, width),
  },
  links: {
    initial: () => ipcRenderer.invoke('links:initial'),
    onOpen: (callback) => on('links:open', callback),
  },
  // Sites straight from the internet, each over its tab. `id` is the tab's.
  sites: {
    show: (id, url, rect, opts) => ipcRenderer.invoke('site-view:show', id, url, rect, opts),
    hide: (id) => ipcRenderer.invoke('site-view:hide', id),
    close: (id) => ipcRenderer.invoke('site-view:close', id),
    onTitle: (callback) => on('site-view:title', callback),
    onAudio: (callback) => on('site-view:audio', callback),
    onHover: (callback) => on('site-view:hover', callback),
    onZoomRequest: (callback) => on('site-view:zoom-request', callback),
    onPermission: (callback) => on('site-view:permission', callback),
    onFocus: (callback) => on('site-view:focus', callback),
    answerPermission: (requestId, allow, remember) => ipcRenderer.invoke('site-permission:answer', requestId, allow, remember),
    permissions: () => ipcRenderer.invoke('site-permissions:list'),
    forgetPermissions: (origin) => ipcRenderer.invoke('site-permissions:forget', origin),
    clearData: (url) => ipcRenderer.invoke('site-data:clear', url),
    openWindow: (id, url, title, opts) => ipcRenderer.invoke('site-window:open', id, url, title, opts),
    closeWindow: (id) => ipcRenderer.invoke('site-window:close', id),
    onWindowClosed: (callback) => on('site-window:closed', callback),
    find: (id, text, options) => ipcRenderer.invoke('site-view:find', id, text, options),
    stopFind: (id) => ipcRenderer.invoke('site-view:find-stop', id),
    zoom: (id, factor) => ipcRenderer.invoke('site-view:zoom', id, factor),
    mute: (id, muted) => ipcRenderer.invoke('site-view:mute', id, muted),
    dark: (id, on) => ipcRenderer.invoke('site-view:dark', id, on),
    capture: (id, width) => ipcRenderer.invoke('site-view:capture', id, width),
    run: (id, action) => ipcRenderer.invoke('site-view:run', id, action),
    metrics: (id) => ipcRenderer.invoke('site-view:metrics', id),
  },
  downloads: {
    list: () => ipcRenderer.invoke('downloads:list'),
    start: (url) => ipcRenderer.invoke('downloads:start', url),
    open: (id) => ipcRenderer.invoke('downloads:open', id),
    show: (id) => ipcRenderer.invoke('downloads:show', id),
    cancel: (id) => ipcRenderer.invoke('downloads:cancel', id),
    pause: (id) => ipcRenderer.invoke('downloads:pause', id),
    resume: (id) => ipcRenderer.invoke('downloads:resume', id),
    forget: (id) => ipcRenderer.invoke('downloads:forget', id),
    onUpdate: (callback) => on('downloads:update', callback),
  },
  onShortcut: (callback) => on('shortcut', callback),
  info: () => ipcRenderer.invoke('app:info'),
  updates: {
    check: () => ipcRenderer.invoke('updates:check'),
    download: () => ipcRenderer.invoke('updates:download'),
    install: () => ipcRenderer.invoke('updates:install'),
    // "Check for Updates…" in the macOS app menu.
    onCheckRequested: (callback) => on('updates:check-requested', callback),
  },
  badge: (count, image) => ipcRenderer.invoke('app:badge', count, image),
  screen: {
    /** Pick a screen or window to share: called with the request's id and what there is. */
    onChoose: (callback) => on('screen:choose', callback),
    chosen: (id, sourceId) => ipcRenderer.invoke('screen:chosen', id, sourceId),
  },
});
