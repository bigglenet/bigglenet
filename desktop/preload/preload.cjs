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
  },
  links: {
    initial: () => ipcRenderer.invoke('links:initial'),
    onOpen: (callback) => on('links:open', callback),
  },
  sites: {
    show: (site, url, rect) => ipcRenderer.invoke('site-view:show', site, url, rect),
    hide: (site) => ipcRenderer.invoke('site-view:hide', site),
    close: (site) => ipcRenderer.invoke('site-view:close', site),
    onTitle: (callback) => on('site-view:title', callback),
    openWindow: (site, url, title) => ipcRenderer.invoke('site-window:open', site, url, title),
    closeWindow: (site) => ipcRenderer.invoke('site-window:close', site),
    onWindowClosed: (callback) => on('site-window:closed', callback),
  },
  onShortcut: (callback) => on('shortcut', callback),
  updates: {
    check: () => ipcRenderer.invoke('updates:check'),
    install: () => ipcRenderer.invoke('updates:install'),
  },
});
