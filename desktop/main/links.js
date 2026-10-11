// biggle:// links from other apps, and keeping to one copy of Bigglenet: opening a link while it's
// running hands the link to the window that's already open.
import { app, ipcMain } from 'electron';
import { execFile } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const SCHEME = 'biggle';
const isLink = (text) => typeof text === 'string' && /^biggle:/i.test(text);

/** Returns false if another copy is already running (this one should quit). */
export function setupLinks(getMain) {
  if (!app.requestSingleInstanceLock()) return false;

  // Links that arrive before the browser is ready to hear about them.
  const waiting = process.argv.filter(isLink);
  let listening = false;

  const open = (url) => {
    const main = getMain();
    if (listening && main) main.webContents.send('links:open', url);
    else waiting.push(url);
  };
  const focus = () => {
    const main = getMain();
    if (!main) return;
    if (main.isMinimized()) main.restore();
    main.focus();
  };

  // macOS hands links over with this event, even before the app is ready.
  app.on('open-url', (event, url) => {
    event.preventDefault();
    if (isLink(url)) open(url);
    focus();
  });
  // Windows and Linux start a second copy with the link; it ends up here.
  app.on('second-instance', (_event, argv) => {
    argv.filter(isLink).forEach(open);
    focus();
  });

  ipcMain.handle('links:initial', () => {
    listening = true;
    return waiting.splice(0);
  });

  if (app.isPackaged) register();
  return true;
}

/** Make biggle:// links open Bigglenet. macOS reads it from the app's Info.plist. */
function register() {
  if (process.platform === 'win32') {
    app.setAsDefaultProtocolClient(SCHEME);
  } else if (process.platform === 'linux') {
    // An AppImage isn't installed anywhere the system looks, so say where it is.
    const exec = process.env.APPIMAGE || process.execPath;
    const dir = join(process.env.XDG_DATA_HOME || join(homedir(), '.local/share'), 'applications');
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, 'bigglenet-handler.desktop'),
        `[Desktop Entry]\nType=Application\nName=Bigglenet\nExec="${exec}" %u\nTerminal=false\nNoDisplay=true\nMimeType=x-scheme-handler/${SCHEME};\n`,
      );
      execFile('xdg-mime', ['default', 'bigglenet-handler.desktop', `x-scheme-handler/${SCHEME}`], () => {});
      execFile('update-desktop-database', [dir], () => {});
    } catch {}
  }
}
