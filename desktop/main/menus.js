// Menus: the menu bar on macOS, and the right-click menu in text fields.
import { app, clipboard, Menu, shell } from 'electron';
import { t } from './language.js';

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
          { label: t('Check for Updates…'), click: checkForUpdates },
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
        label: t('File'),
        submenu: [
          command(t('New Tab'), 't', 'Cmd+T'),
          { label: t('New Window'), accelerator: 'Cmd+N', click: () => newWindow(null) },
          command(t('New Private Tab'), 'shift+n', 'Shift+Cmd+N'),
          { type: 'separator' },
          command(t('Print…'), 'p', 'Cmd+P'),
          command(t('Take a Screenshot'), 'shift+s', 'Shift+Cmd+S'),
          { type: 'separator' },
          command(t('Close Tab'), 'w', 'Cmd+W'),
        ],
      },
      { role: 'editMenu' },
      {
        label: t('View'),
        submenu: [
          command(t('Find…'), 'f', 'Cmd+F'),
          command(t('Find Next'), 'g', 'Cmd+G'),
          command(t('Find Previous'), 'shift+g', 'Shift+Cmd+G'),
          { type: 'separator' },
          command(t('Actual Size'), '0', 'Cmd+0'),
          command(t('Zoom In'), '=', 'Cmd+Plus'),
          command(t('Zoom Out'), '-', 'Cmd+-'),
          { type: 'separator' },
          command(t('Command Palette…'), 'k', 'Cmd+K'),
          command(t('Search Tabs…'), 'shift+a', 'Shift+Cmd+A'),
          command(t('Reader Mode'), 'shift+r', 'Shift+Cmd+R'),
          command(t('Game Mode'), 'shift+f', 'Shift+Cmd+F'),
          command(t('Downloads'), 'shift+j', 'Shift+Cmd+J'),
          { type: 'separator' },
          { role: 'togglefullscreen' },
        ],
      },
      {
        label: t('History'),
        submenu: [command(t('Show All History'), 'y', 'Cmd+Y'), command(t('Reopen Closed Tab'), 'shift+t', 'Shift+Cmd+T')],
      },
      {
        label: t('Bookmarks'),
        submenu: [
          command(t('Bookmark This Page…'), 'd', 'Cmd+D'),
          command(t('Show All Bookmarks'), 'bookmarks'),
          command(t('Show or Hide the Bookmarks Bar'), 'shift+b', 'Shift+Cmd+B'),
        ],
      },
      { label: t('Window'), submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }] },
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
        { label: t('Open Link in Your Browser'), click: () => shell.openExternal(params.linkURL) },
        { label: t('Copy Link Address'), click: () => clipboard.writeText(params.linkURL) },
        { label: t('Download Linked File'), click: () => contents.downloadURL(params.linkURL) },
      );
    }
    if (site && params.mediaType === 'image' && /^(https?|data):/i.test(params.srcURL)) {
      if (items.length) items.push({ type: 'separator' });
      items.push(
        { label: t('Copy Image'), click: () => contents.copyImageAt(params.x, params.y) },
        { label: t('Copy Image Address'), click: () => clipboard.writeText(params.srcURL) },
        { label: t('Save Image'), click: () => contents.downloadURL(params.srcURL) },
      );
    }
    if (items.length) Menu.buildFromTemplate(items).popup();
  });
}
