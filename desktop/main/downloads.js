// Downloads: files from sites, .biggle pages and chats go straight to the Downloads folder, and
// the browser lists them (biggle://downloads) with their progress, "Open" and "Show in folder".
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, parse } from 'node:path';

const KEEP = 100;
const listFile = () => join(app.getPath('userData'), 'downloads.json');

/** Each download: { id, name, url, path, received, total, state, at }. state: progressing,
 * paused, completed, cancelled or interrupted. */
let list = [];
const items = new Map();
let nextId = Date.now();

function load() {
  try {
    list = JSON.parse(readFileSync(listFile(), 'utf8')).map((d) => (d.state === 'progressing' || d.state === 'paused' ? { ...d, state: 'interrupted' } : d));
  } catch {
    list = [];
  }
}

let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      writeFileSync(listFile(), JSON.stringify(list.slice(0, KEEP)));
    } catch {}
  }, 500);
}

function broadcast(download) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && win.webContents.getURL().match(/^(app:\/\/bigglenet|http:\/\/tauri\.localhost|http:\/\/localhost:5173)/)) {
      win.webContents.send('downloads:update', download);
    }
  }
}

/** A free name in the Downloads folder: photo.jpg, photo (1).jpg… */
function freePath(name) {
  const dir = app.getPath('downloads');
  const { name: base, ext } = parse(name.replace(/[\\/:*?"<>|]/g, '_') || 'download');
  let path = join(dir, base + ext);
  for (let i = 1; existsSync(path) || list.some((d) => d.path === path && d.state === 'progressing'); i++) path = join(dir, `${base} (${i})${ext}`);
  return path;
}

export function setupDownloads(sessions) {
  load();
  for (const s of sessions) {
    s.on('will-download', (_event, item) => {
      const id = ++nextId;
      const path = freePath(item.getFilename());
      item.setSavePath(path);
      const download = { id, name: parse(path).base, url: item.getURL(), path, received: 0, total: item.getTotalBytes(), state: 'progressing', at: Date.now() };
      list.unshift(download);
      items.set(id, item);
      broadcast(download);
      item.on('updated', (_e, state) => {
        download.state = item.isPaused() ? 'paused' : state;
        download.received = item.getReceivedBytes();
        download.total = item.getTotalBytes();
        broadcast(download);
      });
      item.once('done', (_e, state) => {
        download.state = state;
        download.received = item.getReceivedBytes();
        items.delete(id);
        broadcast(download);
        save();
      });
      save();
    });
  }

  ipcMain.handle('downloads:list', () => list);
  ipcMain.handle('downloads:start', (event, url) => {
    if (typeof url === 'string' && /^https?:/i.test(url)) event.sender.downloadURL(url);
  });
  ipcMain.handle('downloads:open', (_event, id) => {
    const d = list.find((x) => x.id === id);
    if (d && d.state === 'completed') return shell.openPath(d.path);
  });
  ipcMain.handle('downloads:show', (_event, id) => {
    const d = list.find((x) => x.id === id);
    if (d) shell.showItemInFolder(d.path);
  });
  ipcMain.handle('downloads:cancel', (_event, id) => items.get(id)?.cancel());
  ipcMain.handle('downloads:pause', (_event, id) => items.get(id)?.pause());
  ipcMain.handle('downloads:resume', (_event, id) => items.get(id)?.resume());
  ipcMain.handle('downloads:forget', (_event, id) => {
    list = id === undefined ? list.filter((d) => d.state === 'progressing' || d.state === 'paused') : list.filter((d) => d.id !== id);
    save();
    return list;
  });
}
