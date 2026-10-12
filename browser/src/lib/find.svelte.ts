// Find in page (⌘F / Ctrl+F): the find bar's state, and how each kind of page is searched.
// .biggle pages search themselves (page-runtime.js), sites in the desktop app's site views use
// Chromium's own find, and the browser's own pages are searched here.
import { createFinder, type FindDirection, type FindResult } from './find-core.js';

export type { FindDirection, FindResult };

/** Searches one tab's page. null: this page can't be searched. */
export type Finder = {
  find(text: string, dir: FindDirection): Promise<FindResult | null>;
  clear(): void;
};

const finders = new Map<number, Finder>();
const ownPages = new Map<number, ReturnType<typeof createFinder>>();

/** A tab's page says how to search it. Returns a function to call when the page goes. */
export function provideFinder(tabId: number, finder: Finder): () => void {
  finders.set(tabId, finder);
  return () => {
    if (finders.get(tabId) === finder) finders.delete(tabId);
  };
}

/** The browser's own pages (Settings, Nox…): the text in the tab's part of this document. */
function ownPage(tabId: number): Finder {
  let finder = ownPages.get(tabId);
  if (!finder) {
    finder = createFinder(() => document.querySelector(`[data-tab="${tabId}"]`));
    ownPages.set(tabId, finder);
  }
  const f = finder;
  return { find: async (text, dir) => f.find(text, dir), clear: () => f.clear() };
}

const finderFor = (tabId: number) => finders.get(tabId) ?? ownPage(tabId);

class Find {
  open = $state(false);
  text = $state('');
  /** How many matches, and which one is showing (from 0). null: not searched, or can't search here. */
  result = $state<FindResult | null>(null);
  unsupported = $state(false);
  /** Bumped to put the keyboard in the find box. */
  focus = $state(0);
  private tabId: number | null = null;
  private run = 0;

  show(tabId: number) {
    if (this.open && this.tabId !== tabId) this.close();
    this.open = true;
    this.tabId = tabId;
    this.focus++;
    if (this.text) this.search('first');
  }

  close() {
    if (this.tabId !== null) finderFor(this.tabId).clear();
    this.open = false;
    this.result = null;
    this.unsupported = false;
    this.tabId = null;
  }

  async search(dir: FindDirection) {
    if (!this.open || this.tabId === null) return;
    const run = ++this.run;
    const finder = finderFor(this.tabId);
    if (!this.text) {
      finder.clear();
      this.result = null;
      return;
    }
    const result = await finder.find(this.text, dir).catch(() => null);
    if (run !== this.run) return;
    this.unsupported = result === null;
    this.result = result;
  }

  next() {
    this.search('next');
  }

  prev() {
    this.search('prev');
  }

  /** The tab's page changed: what was found there is gone. */
  pageChanged(tabId: number) {
    if (this.tabId !== tabId) return;
    this.result = null;
    this.unsupported = false;
  }
}

export const find = new Find();
