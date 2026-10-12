// Keyboard shortcuts go by name: the key, with "shift+" in front when Shift is held ("t",
// "shift+t", "=", "0"). Pages (page-runtime.js) and the desktop app's site views
// (desktop/main/sites.js) forward the shortcuts pressed in them by the same names.

export function shortcutName(e: { key: string; shiftKey: boolean }): string {
  let key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  // + is Shift+= on most keyboards, and - and _ share a key: zooming doesn't care about Shift.
  if (key === '+') key = '=';
  if (key === '_') key = '-';
  if (key === '=' || key === '-') return key;
  return e.shiftKey ? `shift+${key}` : key;
}
