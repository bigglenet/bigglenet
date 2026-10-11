// Bigglenet before 0.4 was a Tauri app using the system's web engine. When it updates to this
// version, this brings over what it kept in the browser's storage (the sign-in, the new tab
// page's settings, what each site saved), once, so nothing looks different afterwards.
//
//   Windows: the old app used Edge's engine (Chromium) at http://tauri.localhost. Its storage
//     folder is copied as it is, and this app is served from that same address (main.js).
//   macOS, Linux: the old app used WebKit, whose storage is a small SQLite database. Its
//     entries are read here and written into this app's storage by the preload script.
import { app, ipcMain } from 'electron';
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const OLD_ID = 'dev.ethembeldagli.bigglenet';

/** Every file under `dir` (a few levels down) for which `match` says yes. */
function find(dir, match, depth = 6) {
  if (depth < 0 || !existsSync(dir)) return [];
  const found = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    let stat;
    try {
      stat = statSync(path);
    } catch {
      continue;
    }
    if (stat.isDirectory()) found.push(...find(path, match, depth - 1));
    else if (match(path, name)) found.push(path);
  }
  return found;
}

/** Where the old app's WebKit kept its data. */
const webkitRoot = () =>
  process.platform === 'darwin'
    ? join(homedir(), 'Library/WebKit', OLD_ID, 'WebsiteData')
    : join(process.env.XDG_DATA_HOME || join(homedir(), '.local/share'), OLD_ID);

/** The old app's WebKit storage databases (for its tauri://localhost pages). */
function webkitDatabases(root) {
  return find(root, (path, name) => {
    // Older WebKitGTK: one file per site, named after it.
    if (/^tauri_localhost_\d+\.localstorage$/.test(name)) return true;
    if (name !== 'localstorage.sqlite3') return false;
    // Newer WebKit: a folder per site, with an "origin" file saying which site.
    const origin = join(dirname(dirname(path)), 'origin');
    if (!existsSync(origin)) return false;
    const text = readFileSync(origin).toString('latin1');
    return text.includes('tauri') && text.includes('localhost');
  });
}

export function readWebkitStorage(root = webkitRoot()) {
  const entries = {};
  for (const file of webkitDatabases(root)) {
    const db = new DatabaseSync(file, { readOnly: true });
    try {
      for (const row of db.prepare('SELECT key, value FROM ItemTable').all()) {
        // WebKit keeps the values as UTF-16.
        entries[row.key] = Buffer.from(row.value).toString('utf16le');
      }
    } finally {
      db.close();
    }
  }
  return entries;
}

/** Entries read from the old app, waiting for the preload script to store them. */
const pendingFile = () => join(app.getPath('userData'), 'old-app-storage.json');

/** Runs before the app's window opens (and, on Windows, before storage is first opened). */
export function migrateOldData() {
  if (!app.isPackaged) return;
  const marker = join(app.getPath('userData'), 'old-app-checked');
  if (existsSync(marker)) return;
  try {
    if (process.platform === 'win32') {
      const from = join(process.env.LOCALAPPDATA || '', OLD_ID, 'EBWebView', 'Default', 'Local Storage');
      const to = join(app.getPath('userData'), 'Local Storage');
      if (existsSync(from) && !existsSync(to)) cpSync(from, to, { recursive: true });
    } else {
      const entries = readWebkitStorage();
      if (Object.keys(entries).length) writeFileSync(pendingFile(), JSON.stringify(entries));
    }
  } catch (e) {
    console.error('Bringing over the old app’s data failed:', e);
  }
  writeFileSync(marker, new Date().toISOString());
}

export function setupMigration() {
  // The preload script asks once, when the app first loads.
  ipcMain.on('migrate:take', (event) => {
    const file = pendingFile();
    if (!existsSync(file)) return void (event.returnValue = null);
    try {
      event.returnValue = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      event.returnValue = null;
    }
    rmSync(file, { force: true });
  });
}
