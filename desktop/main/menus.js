// Menus: the menu bar on macOS, and the right-click menu in text fields.
import { app, Menu } from 'electron';

/**
 * macOS needs a menu bar for ⌘C, ⌘V, ⌘Q and the like. It leaves out Reload (⌘R) and Close (⌘W):
 * the Biggle browser uses those for its tabs. Windows and Linux get none, as before: the
 * browser's own shortcuts work there without one.
 */
export function setupMenu(getMain) {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }
  // The Biggle browser does the checking and shows what it found (Settings → Updates).
  const checkForUpdates = () => {
    const main = getMain();
    main?.webContents.send('updates:check-requested');
    main?.focus();
  };
  // Menu items for the browser's own shortcuts. The browser handles the keys itself (also while a
  // site has the keyboard, see sites.js), so the menu only shows them.
  const command = (label, name, accelerator) => ({
    label,
    accelerator,
    registerAccelerator: false,
    click: () => {
      const main = getMain();
      main?.webContents.focus();
      main?.webContents.send('shortcut', name);
    },
  });
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: app.name,
        submenu: [
          { role: 'about' },
          { label: 'Check for Updates…', click: checkForUpdates },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      { role: 'editMenu' },
      {
        label: 'View',
        submenu: [
          command('Find…', 'f', 'Cmd+F'),
          command('Find Next', 'g', 'Cmd+G'),
          command('Find Previous', 'shift+g', 'Shift+Cmd+G'),
          { type: 'separator' },
          command('Actual Size', '0', 'Cmd+0'),
          command('Zoom In', '=', 'Cmd+Plus'),
          command('Zoom Out', '-', 'Cmd+-'),
          { type: 'separator' },
          { role: 'togglefullscreen' },
        ],
      },
      {
        label: 'History',
        submenu: [command('Show All History', 'y', 'Cmd+Y'), command('Reopen Closed Tab', 'shift+t', 'Shift+Cmd+T')],
      },
      {
        label: 'Bookmarks',
        submenu: [
          command('Bookmark This Page…', 'd', 'Cmd+D'),
          command('Show All Bookmarks', 'bookmarks'),
          command('Show or Hide the Bookmarks Bar', 'shift+b', 'Shift+Cmd+B'),
        ],
      },
      { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }] },
    ]),
  );
  app.setAboutPanelOptions({ applicationName: 'Bigglenet', copyright: 'Copyright (c) 2026 bigglenet' });
}

/** Cut, copy and paste on right-click in text fields, and Copy on selected text. */
export function attachContextMenu(contents) {
  contents.on('context-menu', (_event, params) => {
    const items = params.isEditable
      ? [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }]
      : params.selectionText.trim()
        ? [{ role: 'copy' }]
        : [];
    if (items.length) Menu.buildFromTemplate(items).popup();
  });
}
