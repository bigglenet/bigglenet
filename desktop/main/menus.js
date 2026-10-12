// Menus: the menu bar on macOS, and the right-click menu in text fields.
import { app, clipboard, Menu, shell } from 'electron';

/**
 * macOS needs a menu bar for ⌘C, ⌘V, ⌘Q and the like. It leaves out Reload (⌘R) and Close (⌘W):
 * the Biggle browser uses those for its tabs. Windows and Linux get none, as before: the
 * browser's own shortcuts work there without one.
 */
export function setupMenu(getMain, newWindow) {
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
      {
        label: 'File',
        submenu: [
          command('New Tab', 't', 'Cmd+T'),
          { label: 'New Window', accelerator: 'Cmd+N', click: () => newWindow(null) },
          command('New Private Tab', 'shift+n', 'Shift+Cmd+N'),
          { type: 'separator' },
          command('Print…', 'p', 'Cmd+P'),
          command('Take a Screenshot', 'shift+s', 'Shift+Cmd+S'),
          { type: 'separator' },
          command('Close Tab', 'w', 'Cmd+W'),
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
          command('Command Palette…', 'k', 'Cmd+K'),
          command('Search Tabs…', 'shift+a', 'Shift+Cmd+A'),
          command('Reader Mode', 'shift+r', 'Shift+Cmd+R'),
          command('Game Mode', 'shift+f', 'Shift+Cmd+F'),
          command('Downloads', 'shift+j', 'Shift+Cmd+J'),
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

/**
 * Right-click: cut, copy and paste in text fields, Copy on selected text. In sites straight from
 * the internet (`site`), also links and pictures: copy, download, or open in your web browser.
 */
export function attachContextMenu(contents, { site = false } = {}) {
  contents.on('context-menu', (_event, params) => {
    const items = [];
    if (params.isEditable) {
      items.push({ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' });
    } else if (params.selectionText.trim()) {
      items.push({ role: 'copy' });
    }
    if (site && /^https?:/i.test(params.linkURL)) {
      if (items.length) items.push({ type: 'separator' });
      items.push(
        { label: 'Open Link in Your Browser', click: () => shell.openExternal(params.linkURL) },
        { label: 'Copy Link Address', click: () => clipboard.writeText(params.linkURL) },
        { label: 'Download Linked File', click: () => contents.downloadURL(params.linkURL) },
      );
    }
    if (site && params.mediaType === 'image' && /^(https?|data):/i.test(params.srcURL)) {
      if (items.length) items.push({ type: 'separator' });
      items.push(
        { label: 'Copy Image', click: () => contents.copyImageAt(params.x, params.y) },
        { label: 'Copy Image Address', click: () => clipboard.writeText(params.srcURL) },
        { label: 'Save Image', click: () => contents.downloadURL(params.srcURL) },
      );
    }
    if (items.length) Menu.buildFromTemplate(items).popup();
  });
}
