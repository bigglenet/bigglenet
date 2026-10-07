import { account } from './account.svelte';
import { api } from './api';
import { PREVIEW_PREFIX, SERVER, SITE_PREFIX } from './config';
import { answerCall } from './frame';
import { load, type PageError } from './loader';
import { fromInput, parse, START, withHash, type InternalPage } from './url';

export type View =
  | { type: 'internal'; page: InternalPage; path: string }
  | { type: 'page'; site: string; srcdoc: string }
  | { type: 'error'; error: PageError };

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
};

type Mode = 'push' | 'replace' | 'none';
type PageMessage = Record<string, unknown> & { type?: unknown };

let nextId = 1;
const controllers = new Map<number, AbortController>();

class Browser {
  tabs = $state<Tab[]>([]);
  activeId = $state(0);
  /** A normal-web link waiting for the user to confirm opening it. */
  external = $state<string | null>(null);
  /** Bumped to ask the address bar to take focus. */
  addressFocus = $state(0);
  /** The mobile tab switcher is showing. */
  switcher = $state(false);

  get active(): Tab | undefined {
    return this.tabs.find((t) => t.id === this.activeId);
  }

  newTab(href = START, opts: { activate?: boolean; after?: number } = {}): Tab {
    const id = nextId++;
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
    };
    const at = opts.after === undefined ? -1 : this.tabs.findIndex((t) => t.id === opts.after);
    if (at === -1) this.tabs.push(raw);
    else this.tabs.splice(at + 1, 0, raw);
    if (opts.activate !== false) this.activeId = id;
    const tab = this.tabs.find((t) => t.id === id)!;
    this.go(tab, href);
    return tab;
  }

  closeTab(id: number) {
    const i = this.tabs.findIndex((t) => t.id === id);
    if (i === -1) return;
    controllers.get(id)?.abort();
    controllers.delete(id);
    this.tabs.splice(i, 1);
    if (this.tabs.length === 0) this.newTab();
    else if (this.activeId === id) this.activeId = this.tabs[Math.min(i, this.tabs.length - 1)].id;
  }

  /** Handle whatever was typed into an address box. */
  open(tab: Tab, text: string) {
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
    controllers.get(tab.id)?.abort();

    if (u.kind === 'internal') {
      tab.loadId++;
      tab.loading = false;
      tab.preview = null;
      tab.view = { type: 'internal', page: u.page, path: u.path };
      tab.title = internalTitle(u.page, u.path);
      tab.icon = null;
      return;
    }
    // A preview only covers its own site. Following a link elsewhere leaves it.
    if (tab.preview && tab.preview.site !== u.name) tab.preview = null;

    const controller = new AbortController();
    controllers.set(tab.id, controller);
    const loadId = ++tab.loadId;
    tab.loading = true;
    tab.title = `${u.name}.biggle`;
    tab.icon = null;

    const user = account.user && { username: account.user.username };
    load(u, { signal: controller.signal, fresh, user, preview: tab.preview?.base }).then(async (result) => {
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
        tab.view = { type: 'page', site: u.name, srcdoc: result.srcdoc };
      } else {
        tab.view = { type: 'error', error: result.error };
        tab.loading = false;
      }
    });
  }

  /** Open a site that's waiting for approval, as its owner or an admin. */
  async openPreview(site: string, path = '/') {
    const base = await previewBase(site);
    const tab = this.newTab(START);
    tab.preview = { site, base };
    this.go(tab, `biggle://${site}.biggle${path}`, 'replace');
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

  /** Keyboard shortcuts, from the shell or forwarded by a page. Returns true if handled. */
  shortcut(key: string): boolean {
    const tab = this.active;
    const k = key.toLowerCase();
    if (k === 't') {
      this.newTab();
      this.focusAddress();
    } else if (k === 'w') {
      if (tab) this.closeTab(tab.id);
    } else if (k === 'l') {
      this.focusAddress();
    } else if (k === 'r') {
      if (tab) this.reload(tab);
    } else if (k === '[') {
      if (tab) this.back(tab);
    } else if (k === ']') {
      if (tab) this.forward(tab);
    } else if (/^[1-9]$/.test(k)) {
      const target = k === '9' ? this.tabs.at(-1) : this.tabs[Number(k) - 1];
      if (target) this.activeId = target.id;
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
        const fallback = u?.kind === 'site' ? `${u.name}.biggle` : 'Biggle';
        tab.title = typeof msg.title === 'string' && msg.title.trim() ? msg.title.trim().slice(0, 200) : fallback;
        const icon = msg.icon;
        const allowed = (i: string) => i.startsWith(SITE_PREFIX) || i.startsWith(PREVIEW_PREFIX) || i.startsWith('data:image/');
        tab.icon = typeof icon === 'string' && allowed(icon) ? icon : null;
        break;
      }
      case 'navigate': {
        const u = typeof msg.url === 'string' ? parse(msg.url) : null;
        // Pages can link to sites, the start page and the site editor, but not other built-in pages.
        const allowed = u?.kind === 'site' || (u?.kind === 'internal' && (u.page === 'sites' || u.page === 'start'));
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
        break;
      }
      case 'call': {
        if (tab.view.type === 'page') answerCall(tab.view.site, msg, reply);
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
  if (page === 'admin') return 'Admin';
  if (page === 'nox') return 'Nox';
  return path ? `Editing ${path}.biggle` : 'My sites';
}

async function previewBase(site: string): Promise<string> {
  const { base } = await api<{ base: string }>('POST', `/api/sites/${encodeURIComponent(site)}/preview`);
  return SERVER + base;
}

export const browser = new Browser();
