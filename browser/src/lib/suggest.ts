// Address bar suggestions as you type: switch to an open tab, a bookmark, somewhere you've been,
// a site on the Bigglenet, or a Nox search.
import type { IconName } from '../components/Icon.svelte';
import type { Bookmark } from './bookmarks.svelte';
import type { Tab } from './browser.svelte';
import type { Visit } from './history.svelte';
import { t } from './i18n.svelte';
import { fromInput, looksLikeAddress, noxSearch, siteHome, siteHost } from './url';

export type Suggestion = { id: string; label: string; detail: string; icon: IconName; href?: string; tabId?: number; kind: string };

const strip = (url: string) => url.replace(/^biggle:\/\//, '').replace(/\/$/, '');

/** How well text matches: lower is better, -1 not at all. Every word has to be there. */
function score(hay: string, words: string[]): number {
  const h = hay.toLowerCase();
  let s = 0;
  for (const w of words) {
    const i = h.indexOf(w);
    if (i === -1) return -1;
    s += i === 0 ? 0 : /[\s/.\-]/.test(h[i - 1]) ? 1 : 4;
  }
  return s;
}

export function suggest(
  text: string,
  from: { tabs: Tab[]; activeId: number; bookmarks: Bookmark[]; visits: Visit[]; sites: { name: string; tld?: string; title?: string | null }[] },
): Suggestion[] {
  const typed = text.trim();
  if (!typed) return [];
  const words = typed.toLowerCase().split(/\s+/);
  const out: Suggestion[] = [];
  const seen = new Set<string>();
  const add = (s: Suggestion, key = s.href ?? s.id) => {
    if (seen.has(key)) return;
    seen.add(key);
    out.push(s);
  };

  // What Enter does: go there, or search.
  const target = looksLikeAddress(typed) ? fromInput(typed) : null;
  if (target?.kind === 'biggle') add({ id: 'go', label: strip(target.href), detail: t('Go to this address'), icon: 'globe', href: target.href, kind: 'go' });
  else if (!target) add({ id: 'search', label: typed, detail: t('Search Nox'), icon: 'search', href: noxSearch(typed), kind: 'search' });

  const ranked: { s: Suggestion; score: number }[] = [];
  for (const tab of from.tabs) {
    if (tab.id === from.activeId) continue;
    const sc = score(`${tab.title} ${strip(tab.url)}`, words);
    if (sc >= 0) ranked.push({ s: { id: `tab${tab.id}`, label: tab.title, detail: t('Switch to this tab'), icon: 'tabs', tabId: tab.id, kind: 'tab' }, score: sc - 2 });
  }
  for (const b of from.bookmarks) {
    const sc = score(`${b.title} ${strip(b.url)}`, words);
    if (sc >= 0) ranked.push({ s: { id: `b${b.id}`, label: b.title, detail: strip(b.url), icon: 'star', href: b.url, kind: 'bookmark' }, score: sc - 1 });
  }
  // History: places you go often first.
  const counts = new Map<string, { visit: Visit; n: number }>();
  for (const v of from.visits) {
    const c = counts.get(v.url);
    if (c) c.n++;
    else counts.set(v.url, { visit: v, n: 1 });
  }
  for (const { visit, n } of counts.values()) {
    const sc = score(`${visit.title} ${strip(visit.url)}`, words);
    if (sc >= 0) ranked.push({ s: { id: `h${visit.url}`, label: visit.title, detail: strip(visit.url), icon: 'clock', href: visit.url, kind: 'history' }, score: sc - Math.min(3, Math.log2(n + 1)) });
  }
  for (const site of from.sites) {
    const host = siteHost(site.name, site.tld);
    const sc = score(`${host} ${site.title ?? ''}`, words);
    if (sc >= 0) ranked.push({ s: { id: `s${host}`, label: host, detail: site.title ?? '', icon: 'globe', href: siteHome(site.name, site.tld), kind: 'site' }, score: sc + 0.5 });
  }
  ranked.sort((a, b) => a.score - b.score);
  for (const r of ranked) {
    if (out.length >= 8) break;
    add(r.s, r.s.href ? r.s.href.replace(/\/$/, '') : r.s.id);
  }
  return out;
}
