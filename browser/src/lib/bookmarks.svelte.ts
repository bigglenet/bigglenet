// Bookmarks, kept in this browser: ⌘D (Ctrl+D) or the star in the address bar adds one, the
// bookmarks bar under the address bar shows them, and biggle://bookmarks lists them all.
import { START } from './url';

export type Bookmark = { id: string; url: string; title: string; icon: string | null };

const KEY = 'biggle:bookmarks';

type Saved = { list: Bookmark[]; bar: boolean };

function load(): Saved {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Saved> | null;
    const list = Array.isArray(saved?.list)
      ? saved.list.filter((b): b is Bookmark => !!b && typeof b.url === 'string' && typeof b.title === 'string' && typeof b.id === 'string')
      : [];
    return { list, bar: saved?.bar !== false };
  } catch {
    return { list: [], bar: true };
  }
}

/** Two addresses are the same page, whatever part of it they point at. */
const page = (url: string) => url.replace(/#.*$/, '');

class Bookmarks {
  #saved = load();
  list = $state(this.#saved.list);
  /** Show the bookmarks bar (when there are bookmarks). */
  bar = $state(this.#saved.bar);
  /** Bumped to ask the address bar's star to open (⌘D). */
  ask = $state(0);

  /** Pages that can be bookmarked: anything but the new tab page. */
  canBookmark(url: string): boolean {
    return url.startsWith('biggle://') && page(url) !== START;
  }

  find(url: string): Bookmark | undefined {
    const p = page(url);
    return this.list.find((b) => page(b.url) === p);
  }

  add(url: string, title: string, icon: string | null): Bookmark {
    const existing = this.find(url);
    if (existing) return existing;
    const bookmark: Bookmark = { id: Math.random().toString(36).slice(2, 10), url, title: title.trim() || url, icon };
    this.list.push(bookmark);
    this.save();
    return this.list[this.list.length - 1];
  }

  remove(id: string) {
    this.list = this.list.filter((b) => b.id !== id);
    this.save();
  }

  update(id: string, change: { title?: string; url?: string }) {
    const b = this.list.find((x) => x.id === id);
    if (!b) return;
    if (change.title !== undefined) b.title = change.title.trim() || b.url;
    if (change.url !== undefined && change.url.trim()) b.url = change.url.trim();
    this.save();
  }

  /** Move a bookmark one place earlier (-1) or later (1). */
  move(id: string, by: -1 | 1) {
    const i = this.list.findIndex((b) => b.id === id);
    const j = i + by;
    if (i === -1 || j < 0 || j >= this.list.length) return;
    const list = [...this.list];
    [list[i], list[j]] = [list[j], list[i]];
    this.list = list;
    this.save();
  }

  showBar(on: boolean) {
    this.bar = on;
    this.save();
  }

  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ list: this.list, bar: this.bar } satisfies Saved));
    } catch {}
  }
}

export const bookmarks = new Bookmarks();
