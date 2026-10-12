// Sites saved for offline: every page of a .biggle site, with its pictures, styles, scripts and
// fonts built into it, kept in this browser. When there's no connection, the loader (loader.ts)
// opens the saved copy instead.
import { api } from './api';
import { SITE_PREFIX } from './config';
import { t } from './i18n.svelte';

const CACHE = 'biggle-offline';
const KEY = 'biggle:offline';
/** Files bigger than this aren't built into pages. */
const MAX_INLINE = 3_000_000;

type Saved = Record<string, { at: number; pages: number }>;

function load(): Saved {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

const toDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

/** "images/a.png" seen from "blog/post.bhtml" ("../images/a.png") → its path in the site. */
function resolvePath(from: string, ref: string, site: string): string | null {
  if (/^(data|blob|biggle|mailto|javascript):/i.test(ref) || ref.startsWith('#')) return null;
  try {
    const base = new URL(`https://x/${from}`);
    const u = new URL(ref, base);
    if (u.origin === 'https://x') return decodeURIComponent(u.pathname.slice(1));
    const prefix = new URL(SITE_PREFIX + site + '/');
    if (u.href.startsWith(prefix.href)) return decodeURIComponent(u.href.slice(prefix.href.length).split(/[?#]/)[0]);
  } catch {}
  return null;
}

class Offline {
  saved = $state<Saved>(load());

  has(site: string): boolean {
    return !!this.saved[site];
  }

  /** Save a site. Returns how many pages were saved. */
  async save(site: string): Promise<number> {
    if (typeof caches === 'undefined') throw new Error(t('This browser can’t keep sites for offline.'));
    const { files } = await api<{ files: { path: string; type: string; size: number }[] }>('GET', `/api/sites/${encodeURIComponent(site)}/manifest`);
    const blobs = new Map<string, Blob>();
    for (const f of files) {
      const res = await fetch(`${SITE_PREFIX}${site}/${f.path.split('/').map(encodeURIComponent).join('/')}`, { credentials: 'omit' });
      if (res.ok) blobs.set(f.path, await res.blob());
    }
    const dataUrls = new Map<string, string>();
    const dataUrl = async (path: string) => {
      const blob = blobs.get(path);
      if (!blob || blob.size > MAX_INLINE) return null;
      if (!dataUrls.has(path)) dataUrls.set(path, await toDataUrl(blob));
      return dataUrls.get(path)!;
    };
    // url(...) in styles, built in too.
    const fixCss = async (css: string, from: string) => {
      let out = '';
      let last = 0;
      for (const m of css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) {
        const path = resolvePath(from, m[2], site);
        const data = path && (await dataUrl(path));
        out += css.slice(last, m.index) + (data ? `url("${data}")` : m[0]);
        last = m.index + m[0].length;
      }
      return out + css.slice(last);
    };

    const cache = await caches.open(CACHE);
    let pages = 0;
    for (const [path, blob] of blobs) {
      if (!path.endsWith('.bhtml')) continue;
      const text = await blob.text();
      const header = /^﻿?\s*<!bhtml\s+1\s*>/i.exec(text);
      if (!header) continue;
      const doc = new DOMParser().parseFromString(text.slice(header[0].length), 'text/html');
      for (const el of doc.querySelectorAll<HTMLElement>('[src]')) {
        const target = resolvePath(path, el.getAttribute('src')!, site);
        if (!target) continue;
        if (el.localName === 'script') {
          const code = blobs.get(target);
          if (code) {
            el.removeAttribute('src');
            el.textContent = await code.text();
          }
        } else {
          const data = await dataUrl(target);
          if (data) el.setAttribute('src', data);
        }
      }
      for (const link of doc.querySelectorAll('link[href]')) {
        const target = resolvePath(path, link.getAttribute('href')!, site);
        if (!target) continue;
        if (/\bstylesheet\b/i.test(link.getAttribute('rel') ?? '') && blobs.has(target)) {
          const style = doc.createElement('style');
          style.textContent = await fixCss(await blobs.get(target)!.text(), target);
          link.replaceWith(style);
        } else if (/\bicon\b/i.test(link.getAttribute('rel') ?? '')) {
          const data = await dataUrl(target);
          if (data) link.setAttribute('href', data);
        }
      }
      for (const style of doc.querySelectorAll('style')) style.textContent = await fixCss(style.textContent ?? '', path);
      const html = `<!bhtml 1>\n<!DOCTYPE html>${doc.documentElement.outerHTML}`;
      const response = () => new Response(html, { headers: { 'Content-Type': 'text/bhtml; charset=utf-8', 'X-Biggle-Offline': '1' } });
      const url = `${SITE_PREFIX}${site}/${path}`;
      await cache.put(url, response());
      // A folder's index is also the folder itself (/site/hello/ is index.bhtml).
      if (path === 'index.bhtml' || path.endsWith('/index.bhtml')) await cache.put(url.slice(0, -'index.bhtml'.length), response());
      pages++;
    }
    // Pictures and files opened on their own.
    for (const [path, blob] of blobs) {
      if (!path.endsWith('.bhtml')) await cache.put(`${SITE_PREFIX}${site}/${path}`, new Response(blob, { headers: { 'Content-Type': blob.type } }));
    }
    this.saved[site] = { at: Date.now(), pages };
    this.persist();
    return pages;
  }

  async remove(site: string) {
    if (typeof caches !== 'undefined') {
      const cache = await caches.open(CACHE);
      const prefix = `${SITE_PREFIX}${site}/`;
      for (const req of await cache.keys()) if (req.url.startsWith(prefix)) await cache.delete(req);
    }
    delete this.saved[site];
    this.persist();
  }

  private persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.saved));
    } catch {}
  }
}

export const offline = new Offline();

/** The saved copy of a page, when there's no connection. */
export async function offlineCopy(url: string): Promise<Response | null> {
  if (typeof caches === 'undefined') return null;
  try {
    const cache = await caches.open(CACHE);
    return (await cache.match(url)) ?? (await cache.match(url.split('?')[0])) ?? null;
  } catch {
    return null;
  }
}
