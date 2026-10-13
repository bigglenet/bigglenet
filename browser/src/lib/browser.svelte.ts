import { account } from './account.svelte';
import { api } from './api';
import { bookmarks } from './bookmarks.svelte';
import { PREVIEW_PREFIX, SERVER, SITE_PREFIX } from './config';
import { find } from './find.svelte';
import { pageHistory } from './history.svelte';
import { load, type PageError } from './loader';
import { closeWindow, desktop, isApp, isMac } from './platform';
import { startSettings } from './startpage.svelte';
import { zoom } from './zoom.svelte';
import { saveLocal } from './storage';
import { follows } from './follows.svelte';
import { BUILT_IN_SITES, fromInput, looksLikeAddress, noxSearch, parse, siteHost, siteKey, START, withHash, type InternalPage } from './url';

export type View =
  | { type: 'internal'; page: InternalPage; path: string }
  | { type: 'page'; site: string; srcdoc: string }
  /**
   * A real website, loaded straight from its own host: in the tab, or (`window`) in a window of
   * its own, for games that need cross-origin isolation.
   */
  | { type: 'web'; site: string; url: string; window: boolean }
  | { type: 'error'; error: PageError }
  /** Put to sleep to save memory: it loads again when you come back to it. */
  | { type: 'asleep' };

export type Tab = {
  id: number;
  url: string;
  title: string;
  icon: string | null;
  history: string[];
  index: number;
  loading: boolean;
  view: View;
  loadId: number;
  /** Showing a site that's waiting for approval, through a signed preview link. */
  preview: { site: string; base: string } | null;
  /** Small, first in the tab bar, can't be closed by accident, and comes back every time. */
  pinned: boolean;
  groupId: number | null;
  /** Its sound is off. */
  muted: boolean;
  /** It's making a sound. */
  audible: boolean;
  /** Keeps no history, and its sites' data goes when it closes. */
  private: boolean;
  /** When it was last the tab on screen (for putting tabs to sleep). */
  lastActive: number;
  /** A small picture of it, for the preview when you hover over the tab (desktop app). */
  thumbnail: string | null;
  /** Reader mode: the page's text, simplified. */
  reader: { title: string; html: string } | null;
};

export type TabGroup = { id: number; name: string; color: GroupColor; collapsed: boolean };
export const GROUP_COLORS = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'] as const;
export type GroupColor = (typeof GROUP_COLORS)[number];

type Mode = 'push' | 'replace' | 'none';
type PageMessage = Record<string, unknown> & { type?: unknown };

let nextId = 1;
let nextGroup = 1;
const controllers = new Map<number, AbortController>();
// The open tabs, so a reload (a refresh from a menu, F5) brings them back. sessionStorage lasts
// as long as the window.
const SAVED_TABS = 'biggle:tabs';
// The tabs from last time, to bring back after quitting (Settings → On startup), and pinned tabs,
// which always come back.
const LAST_SESSION = 'biggle:last-session';
/** At most this many tabs are saved or restored, so a runaway session can't stall startup. */
const MAX_SAVED_TABS = 100;
const PINNED = 'biggle:pinned';
const STARTUP = 'biggle:startup';
const SLEEP_AFTER = 'biggle:sleep-after';
// Closed tabs ⌘⇧T (Ctrl+Shift+T) can bring back, newest last.
const MAX_CLOSED = 25;

/** A closed tab: where it was, and its back and forward list. */
export type ClosedTab = { url: string; title: string; history: string[]; index: number; at: number; closedAt: number };
type SavedTab = { url: string; title?: string; pinned?: boolean; group?: number | null };
type SavedSession = { tabs: SavedTab[]; groups: TabGroup[]; active: number; at: number };

// Pages already counted in this tab (reloads and going back don't count again).
const counted = new Set<string>();

function readJson<T>(storage: Storage, key: string): T | null {
  try {
    return JSON.parse(storage.getItem(key) ?? 'null') as T | null;
  } catch {
    return null;
  }
}
function writeJson(storage: Storage, key: string, value: unknown) {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {}
}

class Browser {
  tabs = $state<Tab[]>([]);
  groups = $state<TabGroup[]>([]);
  activeId = $state(0);
  /** A normal-web link waiting for the user to confirm opening it. */
  external = $state<string | null>(null);
  /** Bumped to ask the address bar to take focus. */
  addressFocus = $state(0);
  /** The mobile tab switcher is showing. */
  switcher = $state(false);
  /** Recently closed tabs, newest last. */
  closed = $state<ClosedTab[]>([]);
  /** Two tabs side by side: the active one is one of them. */
  split = $state<{ left: number; right: number; ratio: number } | null>(null);
  /** Game mode: nothing but the page, full screen, no notifications. */
  gameMode = $state(false);
  /** Where the link under the mouse goes (shown at the bottom). */
  hoverUrl = $state('');
  /** This whole window is private (opened as a private window). */
  privateWindow = $state(false);
  /** A short note at the bottom: "Pinned tabs stay open…" */
  toast = $state('');
  /** What happens when Bigglenet starts: a new tab, or the tabs from last time. */
  startup = $state<'newtab' | 'restore'>(localStorage.getItem(STARTUP) === 'restore' ? 'restore' : 'newtab');
  /** Minutes in the background before a tab sleeps; 0 never. */
  sleepAfter = $state(Number(localStorage.getItem(SLEEP_AFTER) ?? 30) || 0);

  get active(): Tab | undefined {
    return this.tabs.find((t) => t.id === this.activeId);
  }

  /** The tab on screen, or one of two side by side. */
  isVisible(id: number): boolean {
    return id === this.activeId || (!!this.split && (this.split.left === id || this.split.right === id) && this.inSplit(this.activeId));
  }

  inSplit(id: number): boolean {
    return !!this.split && (this.split.left === id || this.split.right === id);
  }

  groupOf(tab: Tab): TabGroup | undefined {
    return tab.groupId === null ? undefined : this.groups.find((g) => g.id === tab.groupId);
  }

  /** Open a tab: at `href`, or at whatever new tabs open (the start page unless changed). */
  newTab(href = startSettings.newTabAddress, opts: { activate?: boolean; after?: number; private?: boolean; pinned?: boolean; groupId?: number | null } = {}): Tab {
    const id = nextId++;
    const after = opts.after === undefined ? undefined : this.tabs.find((t) => t.id === opts.after);
    const raw: Tab = {
      id,
      url: href,
      title: 'New tab',
      icon: null,
      history: [],
      index: -1,
      loading: false,
      view: { type: 'internal', page: 'start', path: '' },
      loadId: 0,
      preview: null,
      pinned: !!opts.pinned,
      // A tab opened from a grouped tab joins its group.
      groupId: opts.groupId !== undefined ? opts.groupId : (after?.groupId ?? null),
      muted: false,
      audible: false,
      private: opts.private ?? (after?.private || this.privateWindow),
      lastActive: Date.now(),
      thumbnail: null,
      reader: null,
    };
    const at = after ? this.tabs.indexOf(after) : -1;
    if (raw.pinned) this.tabs.splice(this.tabs.filter((t) => t.pinned).length, 0, raw);
    else if (at === -1) this.tabs.push(raw);
    else this.tabs.splice(Math.max(at + 1, this.tabs.filter((t) => t.pinned).length), 0, raw);
    if (opts.activate !== false) this.activate(id);
    const tab = this.tabs.find((t) => t.id === id)!;
    this.go(tab, href);
    return tab;
  }

  activate(id: number) {
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab) return;
    const before = this.active;
    if (before) before.lastActive = Date.now();
    this.activeId = id;
    this.hoverUrl = '';
    tab.lastActive = Date.now();
    // Choosing a tab in a closed group opens the group.
    const group = this.groupOf(tab);
    if (group?.collapsed) group.collapsed = false;
    if (tab.view.type === 'asleep') this.wake(tab);
  }

  // --- Saving and restoring tabs ---

  /** Reopen the tabs from before a reload. Returns whether there were any. */
  restoreTabs(): boolean {
    const saved = readJson<{ urls?: unknown; active?: unknown; tabs?: SavedTab[]; groups?: TabGroup[] }>(sessionStorage, SAVED_TABS);
    if (!saved) return false;
    const tabs: SavedTab[] = Array.isArray(saved.tabs)
      ? saved.tabs.filter((t) => typeof t?.url === 'string')
      : Array.isArray(saved.urls)
        ? saved.urls.filter((u): u is string => typeof u === 'string').map((url) => ({ url }))
        : [];
    if (!tabs.length) return false;
    this.restore({ tabs, groups: saved.groups ?? [], active: typeof saved.active === 'number' ? saved.active : 0, at: Date.now() });
    return true;
  }

  private restore(session: SavedSession) {
    // Group ids are made fresh, so they never clash with ones made here.
    const ids = new Map<number, number>();
    for (const g of session.groups ?? []) {
      const id = nextGroup++;
      ids.set(g.id, id);
      this.groups.push({ ...g, id, collapsed: !!g.collapsed });
    }
    const active = session.tabs[session.active] && session.active < MAX_SAVED_TABS ? session.active : 0;
    session.tabs.slice(0, MAX_SAVED_TABS).forEach((t, i) => {
      const tab = this.newTab(t.url, { activate: i === active, pinned: !!t.pinned, groupId: t.group ? (ids.get(t.group) ?? null) : null });
      // Background tabs wait until they're looked at.
      if (i !== active && t.title) {
        this.sleep(tab);
        tab.title = t.title;
      }
    });
  }

  /** At startup: the tabs from last time (if that's the setting) or the pinned ones. */
  restoreOnStartup(): boolean {
    const last = readJson<SavedSession>(localStorage, LAST_SESSION);
    if (this.startup === 'restore' && last?.tabs?.length) {
      this.restore(last);
      return true;
    }
    const pinned = readJson<SavedTab[]>(localStorage, PINNED) ?? [];
    pinned.filter((t) => typeof t?.url === 'string').forEach((t) => {
      const tab = this.newTab(t.url, { activate: false, pinned: true, groupId: null });
      if (t.title) {
        this.sleep(tab);
        tab.title = t.title;
      }
    });
    return false;
  }

  /** The tabs from last time, when they're not restored at startup ("Restore 5 tabs"). */
  get lastSession(): SavedSession | null {
    const last = readJson<SavedSession>(localStorage, LAST_SESSION);
    return last?.tabs?.some((t) => !t.pinned) ? last : null;
  }

  restoreLastSession() {
    const last = this.lastSession;
    if (!last) return;
    localStorage.removeItem(LAST_SESSION);
    this.restore({ ...last, tabs: last.tabs.filter((t) => !t.pinned) });
  }

  saveTabs() {
    // Private tabs are never saved.
    const tabs = this.tabs.filter((t) => !t.private);
    const saved: SavedTab[] = tabs.slice(0, MAX_SAVED_TABS).map((t) => ({ url: t.url, title: t.title, pinned: t.pinned, group: t.groupId }));
    const active = Math.max(0, tabs.findIndex((t) => t.id === this.activeId));
    const groups = this.groups.filter((g) => tabs.some((t) => t.groupId === g.id)).map((g) => ({ ...g }));
    writeJson(sessionStorage, SAVED_TABS, { tabs: saved, groups, active });
    if (this.privateWindow) return;
    writeJson(localStorage, PINNED, saved.filter((t) => t.pinned).map(({ url, title }) => ({ url, title })));
    if (saved.some((t) => !t.pinned && t.url !== START)) writeJson(localStorage, LAST_SESSION, { tabs: saved, groups, active, at: Date.now() } satisfies SavedSession);
  }

  setStartup(value: 'newtab' | 'restore') {
    this.startup = value;
    localStorage.setItem(STARTUP, value);
  }

  setSleepAfter(minutes: number) {
    this.sleepAfter = minutes;
    localStorage.setItem(SLEEP_AFTER, String(minutes));
  }

  // --- Closing ---

  /** Close a tab. Pinned tabs only close when `force`d (from their menu), not with ⌘W. */
  closeTab(id: number, opts: { force?: boolean } = {}) {
    const i = this.tabs.findIndex((t) => t.id === id);
    if (i === -1) return;
    const tab = this.tabs[i];
    if (tab.pinned && !opts.force) {
      this.say('Pinned tabs stay open. Unpin it to close it.');
      return;
    }
    if (!tab.private && tab.history.some((url) => url !== START)) {
      const closed = { url: tab.url, title: tab.title, history: [...tab.history], index: tab.index, at: i, closedAt: Date.now() };
      this.closed = [...this.closed, closed].slice(-MAX_CLOSED);
    }
    if (find.open && this.activeId === id) find.close();
    controllers.get(id)?.abort();
    controllers.delete(id);
    this.tabs.splice(i, 1);
    if (this.inSplit(id)) this.split = null;
    // A group with no tabs left goes too.
    if (tab.groupId !== null && !this.tabs.some((t) => t.groupId === tab.groupId)) this.groups = this.groups.filter((g) => g.id !== tab.groupId);
    // Closing the last tab closes the desktop app, like other browsers. A phone app can't close
    // itself, so there it opens a fresh tab instead.
    if (this.tabs.length === 0) {
      if (isApp) closeWindow().catch(() => this.newTab());
      else this.newTab();
    } else if (this.activeId === id) {
      const visible = this.tabs.filter((t) => !this.groupOf(t)?.collapsed);
      this.activate((visible[Math.min(i, visible.length - 1)] ?? this.tabs[Math.min(i, this.tabs.length - 1)]).id);
    }
  }

  closeOthers(id: number) {
    for (const t of [...this.tabs]) if (t.id !== id && !t.pinned) this.closeTab(t.id);
  }

  closeToTheRight(id: number) {
    const i = this.tabs.findIndex((t) => t.id === id);
    for (const t of this.tabs.slice(i + 1)) if (!t.pinned) this.closeTab(t.id);
  }

  /** Bring back a closed tab (the last one, unless another is given), with its back and forward list. */
  reopenClosed(closed = this.closed.at(-1)) {
    if (!closed) return;
    this.closed = this.closed.filter((c) => c !== closed);
    const after = this.tabs[Math.min(closed.at, this.tabs.length) - 1]?.id;
    const tab = this.newTab(closed.url, { after, groupId: null });
    if (after === undefined && this.tabs.length > 1) {
      // It was the first tab: put it back first (after any pinned ones).
      const at = this.tabs.findIndex((t) => t.id === tab.id);
      const [moved] = this.tabs.splice(at, 1);
      this.tabs.splice(this.tabs.filter((t) => t.pinned).length, 0, moved);
    }
    const reopened = this.tabs.find((t) => t.id === tab.id)!;
    reopened.history = closed.history;
    reopened.index = Math.min(closed.index, closed.history.length - 1);
  }

  // --- Arranging tabs ---

  /** Move a tab to a place in the tab bar. Pinned tabs stay with pinned tabs. */
  moveTab(id: number, to: number) {
    const from = this.tabs.findIndex((t) => t.id === id);
    if (from === -1) return;
    const [tab] = this.tabs.splice(from, 1);
    const pinnedCount = this.tabs.filter((t) => t.pinned).length;
    const at = tab.pinned ? Math.min(to, pinnedCount) : Math.max(pinnedCount, Math.min(to, this.tabs.length));
    this.tabs.splice(at, 0, tab);
    if (!tab.pinned) {
      // Dropped inside a group joins it; dropped outside its own leaves it.
      const left = this.tabs[at - 1];
      const right = this.tabs[at + 1];
      if (left?.groupId !== null && left?.groupId === right?.groupId) tab.groupId = left!.groupId;
      else if (tab.groupId !== null && left?.groupId !== tab.groupId && right?.groupId !== tab.groupId) tab.groupId = null;
    }
  }

  pin(tab: Tab, pinned: boolean) {
    tab.pinned = pinned;
    if (pinned) tab.groupId = null;
    this.moveTab(tab.id, pinned ? this.tabs.filter((t) => t.pinned && t.id !== tab.id).length : this.tabs.filter((t) => t.pinned).length);
  }

  duplicate(tab: Tab) {
    const copy = this.newTab(tab.url, { after: tab.id, private: tab.private });
    copy.history = [...tab.history];
    copy.index = tab.index;
  }

  mute(tab: Tab, muted = !tab.muted) {
    tab.muted = muted;
  }

  /** A new group with these tabs. Returns it so it can be named. */
  group(ids: number[], name = ''): TabGroup {
    const used = new Set(this.groups.map((g) => g.color));
    const color = GROUP_COLORS.find((c) => !used.has(c)) ?? GROUP_COLORS[this.groups.length % GROUP_COLORS.length];
    const group: TabGroup = { id: nextGroup++, name, color, collapsed: false };
    this.groups.push(group);
    this.addToGroup(ids, group.id);
    return this.groups.at(-1)!;
  }

  addToGroup(ids: number[], groupId: number) {
    for (const id of ids) {
      const tab = this.tabs.find((t) => t.id === id);
      if (!tab || tab.pinned) continue;
      tab.groupId = groupId;
      // Keep a group's tabs together, after its last one.
      const last = this.tabs.findLastIndex((t) => t.groupId === groupId && t.id !== id);
      if (last !== -1) this.moveTab(id, this.tabs.findIndex((t) => t.id === id) < last ? last : last + 1);
    }
  }

  ungroup(tab: Tab) {
    const g = tab.groupId;
    tab.groupId = null;
    if (g !== null && !this.tabs.some((t) => t.groupId === g)) this.groups = this.groups.filter((x) => x.id !== g);
  }

  removeGroup(groupId: number, closeTabs: boolean) {
    for (const t of [...this.tabs]) {
      if (t.groupId !== groupId) continue;
      if (closeTabs) this.closeTab(t.id, { force: true });
      else t.groupId = null;
    }
    this.groups = this.groups.filter((g) => g.id !== groupId);
  }

  /** Move a tab into a new window (desktop app), or a new browser window (web). */
  async moveToNewWindow(tab: Tab, at?: { x: number; y: number }) {
    if (desktop) {
      await desktop.window.newWindow(tab.url, { ...at, private: tab.private });
    } else {
      window.open(`${location.origin}/?open=${encodeURIComponent(tab.url)}`, '_blank');
    }
    this.closeTab(tab.id, { force: true });
  }

  /** Show two tabs side by side. */
  splitWith(left: number, right: number) {
    if (left === right) return;
    this.split = { left, right, ratio: 0.5 };
    this.activate(left);
    const r = this.tabs.find((t) => t.id === right);
    if (r?.view.type === 'asleep') this.wake(r);
  }

  // --- Sleeping tabs ---

  /** Let a tab go to sleep: its page is let go of, to save memory, until it's looked at again. */
  sleep(tab: Tab) {
    if (tab.id === this.activeId || this.inSplit(tab.id)) return;
    controllers.get(tab.id)?.abort();
    tab.loadId++;
    tab.loading = false;
    tab.reader = null;
    tab.view = { type: 'asleep' };
  }

  wake(tab: Tab) {
    if (tab.view.type === 'asleep') this.go(tab, tab.url, 'none');
  }

  /** Called every minute: tabs in the background for long enough go to sleep. */
  sleepIdle() {
    if (!this.sleepAfter) return;
    const before = Date.now() - this.sleepAfter * 60_000;
    for (const t of this.tabs) {
      if (t.view.type !== 'asleep' && !t.audible && t.lastActive < before && !this.isVisible(t.id)) this.sleep(t);
    }
  }

  say(text: string) {
    this.toast = text;
    setTimeout(() => this.toast === text && (this.toast = ''), 3500);
  }

  // --- Going places ---

  /** Handle whatever was typed into an address box: open an address, or search with Nox. */
  open(tab: Tab, text: string) {
    if (!text.trim()) return;
    if (!looksLikeAddress(text)) return this.go(tab, noxSearch(text));
    const target = fromInput(text);
    if (target?.kind === 'external') this.external = target.href;
    else if (target) this.go(tab, target.href);
    else this.showError(tab, text, { code: 'bad_address' });
  }

  go(tab: Tab, href: string, mode: Mode = 'push', fresh = false, retried = false) {
    const u = parse(href);
    if (!u) return this.showError(tab, href, { code: 'bad_address' });

    if (mode === 'push') {
      tab.history.splice(tab.index + 1, Infinity, u.href);
      tab.index = tab.history.length - 1;
    } else if (mode === 'replace') {
      tab.history[tab.index] = u.href;
    }
    tab.url = u.href;
    tab.reader = null;
    tab.audible = false;
    controllers.get(tab.id)?.abort();
    find.pageChanged(tab.id);

    // chat.biggle and board.biggle are built in.
    if (u.kind === 'internal' || (u.tld === 'biggle' && Object.hasOwn(BUILT_IN_SITES, u.name))) {
      const page = u.kind === 'internal' ? u.page : BUILT_IN_SITES[u.name];
      const path = u.kind === 'internal' ? u.path : u.path.replace(/^\/+|\/+$/g, '');
      tab.loadId++;
      tab.loading = false;
      tab.preview = null;
      tab.view = { type: 'internal', page, path };
      tab.title = internalTitle(page, path);
      tab.icon = null;
      return;
    }
    // A preview only covers its own site. Following a link elsewhere leaves it.
    if (tab.preview && tab.preview.site !== siteKey(u)) tab.preview = null;

    const controller = new AbortController();
    controllers.set(tab.id, controller);
    const loadId = ++tab.loadId;
    tab.loading = true;
    tab.title = siteHost(u.name, u.tld);
    tab.icon = null;

    const user = account.user && { username: account.user.username };
    load(u, { signal: controller.signal, fresh, user, preview: tab.preview?.base, private: tab.private }).then(async (result) => {
      if (result.type === 'aborted' || tab.loadId !== loadId) return;
      // Preview links last an hour. Get a fresh one and try again.
      if (result.type === 'error' && result.error.code === 'preview_expired' && tab.preview && !retried) {
        try {
          tab.preview.base = await previewBase(tab.preview.site);
          return this.go(tab, u.href, 'none', fresh, true);
        } catch {}
      }
      if (result.href !== tab.url) {
        tab.url = result.href;
        tab.history[tab.index] = result.href;
      }
      if (result.type === 'page') {
        tab.view = { type: 'page', site: siteKey(u), srcdoc: result.srcdoc };
        this.visited(tab, siteKey(u), mode);
      } else if (result.type === 'web') {
        tab.view = { type: 'web', site: siteKey(u), url: result.url, window: result.window };
        if (result.title) tab.title = result.title;
        this.visited(tab, siteKey(u), mode);
      } else {
        tab.view = { type: 'error', error: result.error };
        tab.loading = false;
      }
    });
  }

  /**
   * A site's page opened: keep it in history, and count the visit for the site's stats: which page,
   * and which site's link led here (not for previews or private tabs).
   */
  private visited(tab: Tab, site: string, mode: Mode) {
    if (tab.preview || tab.private) return;
    if (mode !== 'none') pageHistory.add(tab.url, tab.title);
    if (mode === 'none' && counted.has(`${tab.id}:${tab.url}`)) return;
    counted.add(`${tab.id}:${tab.url}`);
    const u = parse(tab.url);
    const before = tab.index > 0 ? parse(tab.history[tab.index - 1]) : null;
    const from = before?.kind === 'site' && siteKey(before) !== site ? siteKey(before) : null;
    api('POST', `/api/sites/${encodeURIComponent(site)}/visit`, { path: u?.kind === 'site' ? u.path : '/', from }).catch(() => {});
    follows.seen(site);
  }

  /** A page's title arrived. */
  titled(tab: Tab, title: string) {
    tab.title = title;
    if (!tab.preview && !tab.private) pageHistory.retitle(tab.url, title);
  }

  /** Open a site that's waiting for approval, as its owner or an admin. `site` is its key. */
  async openPreview(site: string, path = '/', tld?: string) {
    const base = await previewBase(site);
    const tab = this.newTab(START);
    tab.preview = { site, base };
    this.go(tab, `biggle://${siteHost(site, tld)}${path}`, 'replace');
  }

  /** A biggle:// link from another app: reuse an empty new tab, or open one. */
  openFromOutside(href: string) {
    const tab = this.active;
    if (tab && tab.view.type === 'internal' && tab.view.page === 'start' && tab.history.length <= 1) {
      this.go(tab, href);
    } else {
      this.newTab(href);
    }
  }

  back(tab: Tab) {
    if (tab.index <= 0) return;
    tab.index--;
    this.go(tab, tab.history[tab.index], 'none');
  }

  forward(tab: Tab) {
    if (tab.index >= tab.history.length - 1) return;
    tab.index++;
    this.go(tab, tab.history[tab.index], 'none');
  }

  reload(tab: Tab) {
    this.go(tab, tab.url, 'none', true);
  }

  stop(tab: Tab) {
    controllers.get(tab.id)?.abort();
    tab.loadId++;
    tab.loading = false;
  }

  frameLoaded(tab: Tab) {
    tab.loading = false;
  }

  focusAddress() {
    this.addressFocus++;
  }

  /** Named actions: from keyboard shortcuts (see keys.ts), the Mac's menu bar and the command palette. */
  commands: Record<string, () => void> = {};

  /**
   * Keyboard shortcuts (⌘ or Ctrl and a key, by name: see keys.ts), from the browser, forwarded by
   * a page, or picked from the Mac's menu bar. Returns true if handled.
   */
  shortcut(key: string): boolean {
    const tab = this.active;
    if (key === 't') {
      this.newTab();
      this.focusAddress();
    } else if (key === 'shift+t') {
      this.reopenClosed();
    } else if (key === 'shift+n') {
      this.newTab(undefined, { private: true });
      this.focusAddress();
    } else if (key === 'w') {
      if (tab) this.closeTab(tab.id);
    } else if (key === 'l') {
      this.focusAddress();
    } else if (key === 'r') {
      if (tab) this.reload(tab);
    } else if (key === '[') {
      if (tab) this.back(tab);
    } else if (key === ']') {
      if (tab) this.forward(tab);
    } else if (/^[1-9]$/.test(key)) {
      const target = key === '9' ? this.tabs.at(-1) : this.tabs[Number(key) - 1];
      if (target) this.activate(target.id);
    } else if (key === 'd') {
      if (tab && bookmarks.canBookmark(tab.url)) bookmarks.ask++;
    } else if (key === 'shift+b') {
      bookmarks.showBar(!bookmarks.bar);
    } else if (key === 'bookmarks') {
      this.newTab('biggle://bookmarks', { after: tab?.id });
    } else if (key === (isMac ? 'y' : 'h')) {
      this.newTab('biggle://history', { after: tab?.id });
    } else if (key === (isMac ? 'shift+j' : 'j')) {
      this.newTab('biggle://downloads', { after: tab?.id });
    } else if (key === 'f') {
      if (tab) find.show(tab.id);
    } else if (key === 'g') {
      if (find.open) find.next();
      else if (tab) find.show(tab.id);
    } else if (key === 'shift+g') {
      if (find.open) find.prev();
    } else if (key === '=' || key === '-' || key === '0') {
      if (!tab || tab.url === START) return true;
      if (key === '0') zoom.reset(tab.url);
      else zoom.step(tab.url, key === '=' ? 1 : -1);
    } else if (this.commands[key]) {
      // Things other parts of the browser handle: the command palette (k, shift+a), printing (p),
      // screenshots (shift+s), reader mode (shift+r), game mode (shift+f)…
      this.commands[key]();
    } else {
      return false;
    }
    return true;
  }

  /** A message from a page's runtime. Pages are untrusted, so check everything. */
  onPageMessage(tab: Tab, msg: PageMessage, reply: (msg: Record<string, unknown>) => void) {
    switch (msg.type) {
      case 'meta': {
        const u = parse(tab.url);
        const fallback = u?.kind === 'site' ? siteHost(u.name, u.tld) : 'Biggle';
        this.titled(tab, typeof msg.title === 'string' && msg.title.trim() ? msg.title.trim().slice(0, 200) : fallback);
        const icon = msg.icon;
        const allowed = (i: string) => i.startsWith(SITE_PREFIX) || i.startsWith(PREVIEW_PREFIX) || i.startsWith('data:image/');
        tab.icon = typeof icon === 'string' && allowed(icon) ? icon : null;
        break;
      }
      case 'navigate': {
        const u = typeof msg.url === 'string' ? parse(msg.url) : null;
        // Pages can link to sites, the start page, Nox and the site editor, but not other built-in pages.
        const allowed = u?.kind === 'site' || (u?.kind === 'internal' && ['sites', 'start', 'nox'].includes(u.page));
        if (!u || !allowed) break;
        if (msg.newTab) this.newTab(u.href, { activate: !msg.background, after: tab.id });
        else this.go(tab, u.href);
        break;
      }
      case 'external': {
        if (typeof msg.url === 'string' && /^(https?|mailto|tel):/i.test(msg.url)) this.external = msg.url;
        break;
      }
      case 'hash': {
        const u = parse(tab.url);
        if (u?.kind !== 'site' || typeof msg.hash !== 'string') break;
        tab.url = withHash(u, msg.hash).href;
        tab.history[tab.index] = tab.url;
        break;
      }
      case 'key': {
        if (typeof msg.key === 'string') this.shortcut(msg.key);
        break;
      }
      case 'nav': {
        if (msg.dir === 'back') this.back(tab);
        else if (msg.dir === 'forward') this.forward(tab);
        else if (msg.dir === 'reload') this.reload(tab);
        break;
      }

      case 'local': {
        if (tab.view.type === 'page') saveLocal(tab.view.site, msg.entries, tab.private);
        break;
      }
      case 'audio': {
        tab.audible = msg.audible === true;
        break;
      }
      case 'hover': {
        if (tab.id === this.activeId) this.hoverUrl = typeof msg.url === 'string' ? msg.url.slice(0, 500) : '';
        break;
      }
      case 'zoom': {
        if (msg.by === 1 || msg.by === -1) zoom.step(tab.url, msg.by);
        break;
      }
    }
  }

  private showError(tab: Tab, href: string, error: PageError) {
    controllers.get(tab.id)?.abort();
    tab.loadId++;
    tab.url = href;
    tab.loading = false;
    tab.title = "Can't open";
    tab.icon = null;
    tab.view = { type: 'error', error };
  }
}

function internalTitle(page: InternalPage, path: string): string {
  if (page === 'start') return 'New tab';
  if (page === 'admin') return path === 'pages' ? 'All sites' : 'Admin';
  if (page === 'nox') return 'Nox';
  if (page === 'requests') return 'Feature requests';
  if (page === 'chat') return 'Chat';
  if (page === 'board') return path.startsWith('thread/') ? 'Board' : path ? 'Board' : 'The board';
  if (page === 'feed') return 'Feed';
  if (page === 'clubs') return path ? 'Club' : 'Clubs';
  if (page === 'events') return path === 'new' ? 'New event' : path ? 'Event' : 'Events';
  if (page === 'collections') return path ? 'Collection' : 'Collections';
  if (page === 'invite') return 'Invite';
  if (page === 'status') return 'Status';
  if (page === 'settings') return 'Settings';
  if (page === 'bookmarks') return 'Bookmarks';
  if (page === 'history') return 'History';
  if (page === 'downloads') return 'Downloads';
  if (page === 'profile') return path || 'Profile';
  return path ? `Editing ${path}` : 'My sites';
}

async function previewBase(site: string): Promise<string> {
  const { base } = await api<{ base: string }>('POST', `/api/sites/${encodeURIComponent(site)}/preview`);
  return SERVER + base;
}

export const browser = new Browser();
