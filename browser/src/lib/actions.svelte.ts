// Things you can do to the page in a tab, from the toolbar's page menu, the command palette or a
// keyboard shortcut: reader mode, picture-in-picture, printing, game mode, saving for offline.
import { browser, type Tab } from './browser.svelte';
import { t } from './i18n.svelte';
import { notices } from './notify.svelte';
import { offline } from './offline.svelte';
import { controlFor } from './pagecontrol';
import { desktop } from './platform';
import { parse, siteKey } from './url';

/** Reader mode on or off. */
export async function toggleReader(tab: Tab) {
  if (tab.reader) {
    tab.reader = null;
    return;
  }
  const control = controlFor(tab.id);
  if (!control?.reader) return browser.say(t('Reader mode doesn’t work on this page.'));
  const text = await control.reader();
  if (!text) return browser.say(t('There isn’t enough to read on this page for reader mode.'));
  tab.reader = text;
}

/** Picture-in-picture for the page's biggest video. */
export async function pictureInPicture(tab: Tab) {
  const control = controlFor(tab.id);
  const ok = control?.pip ? await control.pip() : false;
  if (!ok) browser.say(t('No video to pop out here. Some videos have their own picture-in-picture button.'));
}

export function printPage(tab: Tab) {
  if (tab.view.type === 'internal' || tab.view.type === 'error') return print();
  const control = controlFor(tab.id);
  if (control?.print) control.print();
  else browser.say(t('This page can’t be printed from here.'));
}

/** Game mode: nothing but the page, full screen, and no notifications until you're done. */
export function setGameMode(on: boolean) {
  if (browser.gameMode === on) return;
  browser.gameMode = on;
  notices.quiet = on;
  if (desktop) desktop.window.fullscreen(on).catch(() => {});
  else if (on) document.documentElement.requestFullscreen?.().catch(() => {});
  else if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  if (on) browser.say(t('Game mode. {key} to leave.', { key: navigator.platform.includes('Mac') ? '⇧⌘F' : 'Ctrl+Shift+F' }));
}

/** Save a .biggle site so it opens without a connection. */
export async function saveForOffline(tab: Tab) {
  const u = parse(tab.url);
  if (u?.kind !== 'site') return browser.say(t('Only Bigglenet sites can be saved for offline.'));
  const site = siteKey(u);
  browser.say(t('Saving {site} for offline…', { site: u.name }));
  try {
    const pages = await offline.save(site);
    browser.say(t('Saved {n} pages. They open even without a connection.', { n: pages }));
  } catch (e) {
    browser.say(e instanceof Error ? e.message : t('Couldn’t save it for offline.'));
  }
}
