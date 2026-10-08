// Bringing a website that already exists onto the Bigglenet, from its address or from its files
// (a folder or a .zip). Pages become .bhtml, links are pointed at the new copies, and files the
// site loads from elsewhere (fonts, libraries, pictures) are copied in too, because Biggle pages
// can only load things from Biggle sites. Trackers are left behind.
import { api, apiFetch, errorText } from './api';

/** The same limits the server keeps. */
export const LIMITS = { files: 60, file: 1_000_000, site: 5_000_000, pages: 25 };

/** File types a Biggle site can hold, by extension (the server has the same list). */
const TYPES: Record<string, string> = {
  bhtml: 'text/plain; charset=utf-8',
  css: 'text/css',
  js: 'text/javascript',
  json: 'application/json',
  txt: 'text/plain',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  ico: 'image/x-icon',
  woff2: 'font/woff2',
  woff: 'font/woff',
  ttf: 'font/ttf',
  otf: 'font/otf',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  webm: 'video/webm',
};

/** For files whose address doesn't say what they are. */
const EXT_FOR_TYPE: Record<string, string> = {
  'text/css': 'css',
  'text/javascript': 'js',
  'application/javascript': 'js',
  'application/x-javascript': 'js',
  'application/json': 'json',
  'text/plain': 'txt',
  'image/svg+xml': 'svg',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
  'font/woff2': 'woff2',
  'font/woff': 'woff',
  'application/font-woff': 'woff',
  'font/ttf': 'ttf',
  'font/otf': 'otf',
  'audio/mpeg': 'mp3',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

const PAGE_EXT = /^(html?|xhtml|php\d?|aspx?|jsp|shtml|cfm)$/;

const TRACKERS =
  /(^|\.)(googletagmanager\.com|google-analytics\.com|analytics\.google\.com|doubleclick\.net|googlesyndication\.com|googleadservices\.com|facebook\.net|hotjar\.com|clarity\.ms|segment\.(com|io)|plausible\.io|cloudflareinsights\.com|mixpanel\.com|amplitude\.com|matomo\.cloud|ads-twitter\.com|quantserve\.com|scorecardresearch\.com|tiktok\.com)$/i;

/** Picked files have no web address, so they get one here. */
const LOCAL = 'https://files.invalid';

export type ImportedFile = { path: string; data: Blob };
export type Skipped = { what: string; why: string };
export type Imported = { title: string; files: ImportedFile[]; skipped: Skipped[] };

type Got = { data: Blob; type: string; charset: string | null; url: URL };

/** Where a site's files come from: the web (through the Biggle server), or files someone picked. */
export type Source = { start: URL; get(url: URL): Promise<Got> };

// --- Sources ---

async function fetchWeb(url: URL): Promise<Got> {
  const res = await apiFetch('POST', '/api/import/fetch', JSON.stringify({ url: url.href }), 'application/json');
  const [type, ...params] = (res.headers.get('Content-Type') ?? '').split(';');
  const charset = params.map((p) => p.trim().match(/^charset=["']?([^"']+)/i)?.[1]).find(Boolean) ?? null;
  return { data: await res.blob(), type: type.trim().toLowerCase(), charset, url: new URL(res.headers.get('X-Final-Url') ?? url.href) };
}

/** A site on the web, from its address. */
export function webSource(address: string): Source {
  const text = address.trim();
  let start: URL;
  try {
    start = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    throw new Error("That doesn't look like a website address.");
  }
  if (!start.hostname.includes('.')) throw new Error("That doesn't look like a website address.");
  return { start, get: fetchWeb };
}

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

/** A site from files someone picked: a folder, a few files, or what was in a .zip. */
export function filesSource(picked: Map<string, Blob>): Source {
  const paths = [...picked.keys()]
    .map((p) => p.replace(/\\/g, '/').replace(/^\/+/, ''))
    .filter((p) => !/(^|\/)(__MACOSX|\.DS_Store$|\.git\/)/.test(p));
  const depth = (p: string) => p.split('/').length;
  const pages = paths.filter((p) => /\.html?$/i.test(p)).sort((a, b) => depth(a) - depth(b) || a.length - b.length);
  const index = pages.find((p) => /(^|\/)index\.html?$/i.test(p)) ?? (pages.length === 1 ? pages[0] : null);
  if (!index) throw new Error("Couldn't find the site's index.html. Pick the folder it's in.");

  // Only what's in the main page's folder comes along.
  const root = index.slice(0, index.lastIndexOf('/') + 1);
  const files = new Map<string, Blob>();
  for (const [p, data] of picked) {
    const path = p.replace(/\\/g, '/').replace(/^\/+/, '');
    if (path.startsWith(root) && paths.includes(path)) files.set(path.slice(root.length), data);
  }

  return {
    start: new URL(`${LOCAL}/${encodePath(index.slice(root.length))}`),
    async get(url) {
      if (url.origin !== LOCAL) return fetchWeb(url);
      const path = safeDecode(url.pathname.slice(1));
      const tries = path === '' || path.endsWith('/') ? [`${path}index.html`, `${path}index.htm`] : [path, `${path}.html`, `${path}/index.html`];
      for (const p of tries) {
        const data = files.get(p);
        if (!data) continue;
        const ext = extOf(p);
        return { data, type: /^html?$/.test(ext) ? 'text/html' : (TYPES[ext] ?? '').split(';')[0], charset: null, url: new URL(`${LOCAL}/${encodePath(p)}`) };
      }
      throw new Error("It isn't in the files you picked.");
    },
  };
}

/** The files from a folder picker (each knows its path) or a plain multi-file picker. */
export function pickedFiles(list: FileList | File[]): Map<string, Blob> {
  const out = new Map<string, Blob>();
  for (const f of Array.from(list)) out.set(f.webkitRelativePath || f.name, f);
  return out;
}

// --- Paths ---

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

const extOf = (path: string) => path.match(/\.([A-Za-z0-9]+)$/)?.[1].toLowerCase() ?? '';

/** A short stand-in for a query string, so ?v=1 and ?v=2 don't land on the same file. */
function shortHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36).slice(0, 6);
}

/** Make a path the server will accept: plain names, at most 4 folders deep, 120 characters. */
function safePath(path: string): string {
  const parts = path
    .split('/')
    .filter((p) => p && p !== '.' && p !== '..')
    .map((p) => {
      let s = p.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-{2,}/g, '-');
      if (!/^[A-Za-z0-9_-]/.test(s)) s = `_${s}`;
      return s.length > 60 ? s.slice(0, 40) + s.slice(-20) : s;
    });
  let file = parts.pop() ?? 'index.bhtml';
  let dirs = parts;
  if (dirs.length > 4) dirs = [...dirs.slice(0, 3), dirs.slice(3).join('-')];
  let out = [...dirs, file].join('/');
  while (out.length > 120 && dirs.length) {
    dirs = dirs.slice(1);
    out = [...dirs, file].join('/');
  }
  if (out.length > 120) {
    file = file.slice(-100);
    out = file;
  }
  return out;
}

/** The address of `to`, written relative to the file at `from`. */
function relative(from: string, to: string): string {
  const a = from.split('/').slice(0, -1);
  const b = to.split('/');
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  const up = a.length - i;
  const rel = '../'.repeat(up) + b.slice(i).map(encodeURIComponent).join('/');
  // Point at folders rather than their index pages: "about/" rather than "about/index.bhtml".
  return rel === 'index.bhtml' ? './' : rel.endsWith('/index.bhtml') ? rel.slice(0, -'index.bhtml'.length) : rel;
}

// --- Importing ---

function decodeText(got: Got, bytes: ArrayBuffer): string {
  let charset = got.charset;
  if (!charset && /html/.test(got.type)) {
    const head = new TextDecoder('latin1').decode(bytes.slice(0, 2048));
    charset = head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ?? null;
  }
  try {
    return new TextDecoder(charset ?? 'utf-8').decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

/** Run at most `n` at once, so a big page doesn't fire off a hundred requests together. */
function limiter(n: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active >= n) await new Promise<void>((r) => waiting.push(r));
    active++;
    try {
      return await fn();
    } finally {
      active--;
      waiting.shift()?.();
    }
  };
}

export async function importSite(source: Source, progress: (text: string) => void): Promise<Imported> {
  const files = new Map<string, Blob>();
  const skipped: Skipped[] = [];
  let total = 0;
  const limit = limiter(6);
  const get = (url: URL) => limit(() => source.get(url));

  const first = await source.get(source.start).catch((e) => {
    throw new Error(`Couldn't open ${source.start.href}: ${errorText(e)}`);
  });
  if (!/html/.test(first.type)) throw new Error("That address isn't a web page.");

  // Everything in the first page's folder, on the same site, comes along as part of the site.
  const root = new URL('./', first.url);
  const host = (u: URL) => u.host.replace(/^www\./, '');
  const inside = (u: URL) => host(u) === host(root) && u.pathname.startsWith(root.pathname);
  const pageKey = (u: URL) => `${host(u)}${u.pathname.replace(/\/index\.html?$/i, '/')}`;
  const what = (u: URL) => (u.origin === LOCAL ? safeDecode(u.pathname.slice(1)) : u.href);
  const skip = (u: URL, why: string) => skipped.push({ what: what(u), why });

  // Which address each path belongs to, so two different files never share one.
  const owners = new Map<string, string>();
  function claim(path: string, key: string): string {
    let candidate = path;
    for (let n = 2; owners.has(candidate) && owners.get(candidate) !== key; n++) {
      candidate = path.replace(/(\.[a-z0-9]+)$/, `-${n}$1`);
    }
    owners.set(candidate, key);
    return candidate;
  }

  // --- Pages ---
  const pagePaths = new Map<string, string>();
  const queue: URL[] = [];
  let pagesWaiting = 0;
  let tooManyPages = false;

  function pagePath(u: URL): string | null {
    const key = pageKey(u);
    const known = pagePaths.get(key);
    if (known) return known;
    if (pagePaths.size >= LIMITS.pages) {
      if (!tooManyPages) skipped.push({ what: 'More pages', why: `only the first ${LIMITS.pages} pages come along. Links to the rest go to the original site` });
      tooManyPages = true;
      return null;
    }
    let p = safeDecode(u.pathname.slice(root.pathname.length));
    if (p === '' || p.endsWith('/')) p += 'index.bhtml';
    else if (extOf(p)) p = p.replace(/\.[A-Za-z0-9]+$/, '.bhtml');
    else p += '/index.bhtml';
    const path = claim(safePath(p), key);
    pagePaths.set(key, path);
    queue.push(u);
    pagesWaiting++;
    return path;
  }
  // The first page is always the site's front page, wherever it was.
  owners.set('index.bhtml', pageKey(first.url));
  pagePaths.set(pageKey(first.url), 'index.bhtml');
  pagePaths.set(pageKey(source.start), 'index.bhtml');

  const isPageLink = (u: URL) => {
    const ext = extOf(u.pathname);
    return !ext || PAGE_EXT.test(ext);
  };

  function add(path: string, data: Blob, u: URL, page = false): boolean {
    if (data.size > LIMITS.file) return skip(u, "it's over 1 MB"), false;
    if (files.size + (page ? 0 : pagesWaiting) >= LIMITS.files) return skip(u, `a site can have up to ${LIMITS.files} files`), false;
    if (total + data.size > LIMITS.site) return skip(u, 'a site can use up to 5 MB'), false;
    files.set(path, data);
    total += data.size;
    progress(`Copied ${files.size} file${files.size === 1 ? '' : 's'}…`);
    return true;
  }

  // --- Everything else: styles, scripts, pictures, fonts ---
  const assets = new Map<string, Promise<string | null>>();
  const work: Promise<unknown>[] = [];

  function asset(u: URL): Promise<string | null> {
    const key = u.href.replace(/#.*$/, '');
    let found = assets.get(key);
    if (!found) {
      found = fetchAsset(u);
      assets.set(key, found);
    }
    return found;
  }

  async function fetchAsset(u: URL): Promise<string | null> {
    if (TRACKERS.test(u.hostname)) return null;
    let got: Got;
    try {
      got = await get(u);
    } catch (e) {
      skip(u, errorText(e).replace(/\.$/, ''));
      return null;
    }
    let ext = extOf(u.pathname);
    if (ext === 'mjs') ext = 'js';
    const typed = EXT_FOR_TYPE[got.type];
    if (!TYPES[ext] || ext === 'bhtml' || (typed && (typed === 'css' || typed === 'js') && ext !== typed)) ext = typed ?? '';
    if (!ext) {
      skip(u, "Biggle sites can't hold this kind of file");
      return null;
    }
    let base = inside(u) ? safeDecode(u.pathname.slice(root.pathname.length)) : `ext/${u.host}${safeDecode(u.pathname)}`;
    if (base === '' || base.endsWith('/')) base += 'index';
    base = base.replace(/\.[A-Za-z0-9]+$/, '');
    if (u.search) base += `-${shortHash(u.search)}`;
    const path = claim(safePath(`${base}.${ext}`), u.href.replace(/#.*$/, ''));

    if (ext === 'css') {
      // Stylesheets point at more files (fonts, pictures, other stylesheets): bring those too.
      work.push(
        (async () => {
          try {
            const css = await rewriteCss(decodeText(got, await got.data.arrayBuffer()), got.url, path);
            add(path, new Blob([css], { type: 'text/css' }), u);
          } catch (e) {
            skip(u, errorText(e).replace(/\.$/, ''));
          }
        })(),
      );
      return path;
    }
    return add(path, got.data, u) ? path : null;
  }

  const resolve = (raw: string | null, base: URL): URL | null => {
    const text = raw?.trim();
    if (!text || /^(data|blob|javascript|about|mailto|tel):/i.test(text) || text.startsWith('#')) return null;
    try {
      const u = new URL(text, base);
      return u.protocol === 'http:' || u.protocol === 'https:' || u.origin === LOCAL ? u : null;
    } catch {
      return null;
    }
  };

  /** Where a reference to `u` from the file at `from` should point now. */
  async function pointAt(u: URL, from: string): Promise<string> {
    const path = await asset(u);
    return path ? relative(from, path) + u.hash : u.href;
  }

  async function rewriteCss(css: string, base: URL, from: string): Promise<string> {
    const refs = new Map<string, string>();
    const urls = [...css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi), ...css.matchAll(/@import\s+(['"])([^'"]+)\1/gi)].map((m) => m[2]);
    await Promise.all(
      [...new Set(urls)].map(async (raw) => {
        const u = resolve(raw, base);
        if (u) refs.set(raw, await pointAt(u, from));
      }),
    );
    return css
      .replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (m, q, raw) => (refs.has(raw) ? `url(${q}${refs.get(raw)}${q})` : m))
      .replace(/@import\s+(['"])([^'"]+)\1/gi, (m, q, raw) => (refs.has(raw) ? `@import ${q}${refs.get(raw)}${q}` : m));
  }

  let title = '';

  async function rewritePage(html: string, pageUrl: URL, path: string): Promise<string> {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    if (path === 'index.bhtml' && !title) title = doc.title.trim();
    const baseTag = doc.querySelector('base[href]');
    const base = resolve(baseTag?.getAttribute('href') ?? null, pageUrl) ?? pageUrl;
    doc.querySelectorAll('base, meta[http-equiv="Content-Security-Policy" i], link[rel~="preconnect" i], link[rel~="dns-prefetch" i], link[rel~="manifest" i]').forEach((el) => el.remove());

    const tasks: Promise<unknown>[] = [];
    const set = (el: Element, attr: string, value: Promise<string>) => tasks.push(value.then((v) => el.setAttribute(attr, v)));

    for (const script of doc.querySelectorAll('script[src]')) {
      const u = resolve(script.getAttribute('src'), base);
      if (u && TRACKERS.test(u.hostname)) script.remove();
    }

    // Links to other pages of the site.
    for (const el of doc.querySelectorAll('a[href], area[href], form[action]')) {
      const attr = el.localName === 'form' ? 'action' : 'href';
      const u = resolve(el.getAttribute(attr), base);
      if (!u) continue;
      if (inside(u) && isPageLink(u)) {
        const target = pagePath(u);
        el.setAttribute(attr, target ? relative(path, target) + u.hash : u.href);
      } else if (inside(u)) {
        set(el, attr, pointAt(u, path));
      } else {
        // Other websites open in the normal browser.
        el.setAttribute(attr, u.href);
      }
    }

    // Files the page loads.
    const ATTRS: [string, string][] = [
      ['link[href]', 'href'],
      ['script[src]', 'src'],
      ['img[src]', 'src'],
      ['img[data-src]', 'data-src'],
      ['source[src]', 'src'],
      ['video[src]', 'src'],
      ['video[poster]', 'poster'],
      ['audio[src]', 'src'],
      ['track[src]', 'src'],
      ['input[src]', 'src'],
      ['image[href]', 'href'],
      ['use[href]', 'href'],
    ];
    for (const [selector, attr] of ATTRS) {
      for (const el of doc.querySelectorAll(selector)) {
        if (el.localName === 'link' && !/\b(stylesheet|icon|apple-touch-icon|mask-icon|preload|modulepreload|prefetch)\b/i.test(el.getAttribute('rel') ?? '')) {
          const u = resolve(el.getAttribute('href'), base);
          if (u) el.setAttribute('href', u.href);
          continue;
        }
        const u = resolve(el.getAttribute(attr), base);
        if (u) set(el, attr, pointAt(u, path));
      }
    }
    for (const el of doc.querySelectorAll('[srcset], [data-srcset]')) {
      for (const attr of ['srcset', 'data-srcset']) {
        const value = el.getAttribute(attr);
        if (!value) continue;
        const parts = value.split(',').map((p) => p.trim().split(/\s+/));
        set(
          el,
          attr,
          Promise.all(
            parts.map(async ([raw, ...size]) => {
              const u = resolve(raw ?? null, base);
              return [u ? await pointAt(u, path) : raw, ...size].join(' ');
            }),
          ).then((list) => list.join(', ')),
        );
      }
    }
    for (const el of doc.querySelectorAll('style')) {
      tasks.push(rewriteCss(el.textContent ?? '', base, path).then((css) => (el.textContent = css)));
    }
    for (const el of doc.querySelectorAll('[style]')) {
      set(el, 'style', rewriteCss(el.getAttribute('style') ?? '', base, path));
    }

    await Promise.all(tasks);
    return `<!bhtml 1>\n${doc.documentElement.outerHTML}\n`;
  }

  // Pages one at a time, front page first; each page's own files in parallel.
  queue.push(first.url);
  pagesWaiting++;
  while (queue.length) {
    const url = queue.shift()!;
    const path = pagePaths.get(pageKey(url))!;
    let got: Got;
    try {
      got = url === first.url ? first : await get(url);
    } catch (e) {
      pagesWaiting--;
      skip(url, errorText(e).replace(/\.$/, ''));
      continue;
    }
    if (!/html/.test(got.type)) {
      pagesWaiting--;
      skip(url, "it isn't a page");
      continue;
    }
    progress(`Copying ${path}…`);
    const html = await rewritePage(decodeText(got, await got.data.arrayBuffer()), got.url, path);
    pagesWaiting--;
    add(path, new Blob([html], { type: 'text/plain' }), url, true);
  }
  while (work.length) await Promise.all(work.splice(0));

  if (!files.has('index.bhtml')) throw new Error("The site's front page couldn't be copied.");
  return {
    title,
    files: [...files].map(([path, data]) => ({ path, data })),
    skipped,
  };
}

/** Make the new site and upload what was imported. */
export async function uploadSite(name: string, title: string, site: Imported, progress: (text: string) => void) {
  const index = site.files.find((f) => f.path === 'index.bhtml')!;
  await api('POST', '/api/sites', { name, title, files: { 'index.bhtml': await index.data.text() } });
  const rest = site.files.filter((f) => f !== index);
  const limit = limiter(4);
  let done = 1;
  progress(`Uploading ${done} of ${site.files.length}…`);
  await Promise.all(
    rest.map((f) =>
      limit(async () => {
        const type = TYPES[extOf(f.path)] ?? 'application/octet-stream';
        await apiFetch('PUT', `/api/sites/${encodeURIComponent(name)}/files/${encodePath(f.path)}`, f.data, type);
        progress(`Uploading ${++done} of ${site.files.length}…`);
      }),
    ),
  );
}
