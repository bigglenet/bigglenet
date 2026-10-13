// Keeping Bigglenet running in the background (Settings → Notifications), so messages, calls and
// event reminders still show up after the window is closed. Closing the last window then hides it
// instead of quitting; an icon in the menu bar (macOS) or the system tray (Windows, Linux) opens
// it again or quits. Off unless switched on.
import { app, ipcMain, Menu, nativeImage, Tray } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const file = () => join(app.getPath('userData'), 'background.json');

let on = false;
let quitting = false;
let tray = null;

function load() {
  try {
    on = JSON.parse(readFileSync(file(), 'utf8')).on === true;
  } catch {
    on = false;
  }
}

/** `getWindows`: the browser windows; `show`: bring one back (or make one). */
export function setupBackground(getWindows, show) {
  load();
  app.on('before-quit', () => (quitting = true));
  // The Dock icon (macOS) brings back a hidden window.
  app.on('activate', () => show());

  ipcMain.handle('background:get', () => on);
  ipcMain.handle('background:set', (_event, value) => {
    on = value === true;
    try {
      writeFileSync(file(), JSON.stringify({ on }));
    } catch {}
    updateTray(show);
    return on;
  });
  app.whenReady().then(() => updateTray(show));

  /** Call for each new window: closing the last one hides it while running in the background. */
  return function watch(win) {
    win.on('close', (event) => {
      if (!on || quitting) return;
      const open = getWindows().filter((w) => !w.isDestroyed() && w.isVisible());
      if (open.length === 1 && open[0] === win) {
        event.preventDefault();
        win.hide();
      }
    });
  };
}

function updateTray(show) {
  if (!on) {
    tray?.destroy();
    tray = null;
    return;
  }
  if (tray) return;
  const isMac = process.platform === 'darwin';
  let image = nativeImage.createFromPath(join(here, '../build/icon.png')).resize({ width: isMac ? 18 : 16, height: isMac ? 18 : 16 });
  if (image.isEmpty()) image = nativeImage.createEmpty();
  tray = new Tray(image);
  tray.setToolTip('Bigglenet');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Bigglenet', click: () => show() },
      { type: 'separator' },
      {
        label: 'Quit Bigglenet',
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
  if (!isMac) tray.on('click', () => show());
}
