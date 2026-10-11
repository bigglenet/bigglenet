// Menus: the menu bar on macOS, and the right-click menu in text fields.
import { app, Menu } from 'electron';

/**
 * macOS needs a menu bar for ⌘C, ⌘V, ⌘Q and the like. It leaves out Reload (⌘R) and Close (⌘W):
 * the Biggle browser uses those for its tabs. Windows and Linux get none, as before.
 */
export function setupMenu() {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: 'appMenu' },
      { role: 'editMenu' },
      { label: 'View', submenu: [{ role: 'togglefullscreen' }] },
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
