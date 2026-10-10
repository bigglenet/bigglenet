import { PREVIEW_PREFIX, SITE_PREFIX } from './config';

export const NAME_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Built-in pages, addressed as `biggle://<page>/<path>?<query>` with no `.biggle`. Chat is built
 * in too, but lives at biggle://chat.biggle.
 */
export type InternalPage = 'start' | 'admin' | 'sites' | 'nox' | 'requests' | 'settings' | 'chat';
/** The address each built-in page answers to. The new tab page is biggle://newtab (or biggle://start). */
const INTERNAL_HOSTS: Record<string, InternalPage> = {
  newtab: 'start',
  start: 'start',
  admin: 'admin',
  sites: 'sites',
  nox: 'nox',
  requests: 'requests',
  settings: 'settings',
};
export const START = 'biggle://newtab';

const isInternal = (s: string) => Object.hasOwn(INTERNAL_HOSTS, s);

/**
 * A site's address ends in .biggle, or .b for sites made by admins and people they trust.
 * hello.biggle and hello.b are different sites.
 */
export type Tld = 'biggle' | 'b';
const SITE_HOST_RE = /^(.+)\.(biggle|b)$/;
const TYPED_SITE_RE = /^[a-z0-9-]+\.(?:biggle|b)(?:[/?#]|$)/i;

export type SiteUrl = { kind: 'site'; name: string; tld: Tld; path: string; search: string; hash: string; href: string };
export type InternalUrl = { kind: 'internal'; page: InternalPage; path: string; search: string; hash: string; href: string };
export type BiggleUrl = SiteUrl | InternalUrl;

// Parsed by hand: browsers disagree on how to parse hosts in non-http URLs.
const URL_RE = /^biggle:\/\/([^/?#]*)([^?#]*)(\?[^#]*)?(#.*)?$/i;

export function parse(input: string): BiggleUrl | null {
  const m = URL_RE.exec(input.trim());
  if (!m) return null;
  const host = m[1].toLowerCase();
  if (isInternal(host)) {
    const page = INTERNAL_HOSTS[host];
    const shown = page === 'start' ? 'newtab' : host;
    const path = (m[2] ?? '').replace(/^\/+|\/+$/g, '');
    const search = m[3] && m[3] !== '?' ? m[3] : '';
    const hash = m[4] && m[4] !== '#' ? m[4] : '';
    return { kind: 'internal', page, path, search, hash, href: `biggle://${shown}${path ? '/' + path : ''}${search}${hash}` };
  }
  const site = SITE_HOST_RE.exec(host);
  if (!site) return null;
  let [, name, tld] = site as unknown as [string, string, Tld];
  // "hello.b.biggle" is hello.b, for pages that add .biggle to a site's key (random.biggle does).
  if (tld === 'biggle' && name.endsWith('.b')) [name, tld] = [name.slice(0, -2), 'b'];
  if (!NAME_RE.test(name)) return null;

  // Resolve "." and ".." and percent-encode, without letting "//x" or "\x" turn into a host.
  const rawPath = '/' + (m[2] ?? '').replace(/\\/g, '%5C').replace(/^\/+/, '');
  const path = new URL(rawPath, 'https://x').pathname;
  const search = m[3] && m[3] !== '?' ? m[3] : '';
  const hash = m[4] && m[4] !== '#' ? m[4] : '';
  return { kind: 'site', name, tld, path, search, hash, href: `biggle://${name}.${tld}${path}${search}${hash}` };
}

/**
 * A site's key, as the server knows it and in its /site/<key>/ files: "hello" for hello.biggle,
 * "hello.b" for hello.b.
 */
export const siteKey = (u: { name: string; tld: Tld }) => (u.tld === 'b' ? `${u.name}.b` : u.name);

/** "hello.biggle" or "hello.b", from a site's key (or a name and its ending). */
export const siteHost = (key: string, tld?: Tld | string) => (key.endsWith('.b') ? key : `${key}.${tld === 'b' ? 'b' : 'biggle'}`);

/** A site's front page. */
export const siteHome = (key: string, tld?: Tld | string) => `biggle://${siteHost(key, tld)}/`;

export function withHash(u: SiteUrl, hash: string): SiteUrl {
  return parse(`biggle://${u.name}.${u.tld}${u.path}${u.search}${hash}`) as SiteUrl;
}



/** Where the gateway serves a site's files from. Previews use a signed base instead. */
export function siteBase(u: SiteUrl, previewBase?: string): string {
  return previewBase ?? `${SITE_PREFIX}${siteKey(u)}/`;
}

/** Where the gateway serves this page from. */
export function toGateway(u: SiteUrl, previewBase?: string): string {
  return `${siteBase(u, previewBase)}${u.path.slice(1)}${u.search}`;
}

/** The biggle:// address for a gateway URL. `previewSite` is a site key. Mirrored in page-runtime.js. */
export function fromGateway(href: string, previewBase?: string, previewSite?: string): string | null {
  if (previewBase && previewSite && href.startsWith(previewBase)) {
    return `biggle://${siteHost(previewSite)}/${href.slice(previewBase.length)}`;
  }
  if (href.startsWith(PREVIEW_PREFIX)) return null;
  if (!href.startsWith(SITE_PREFIX)) return null;
  const rest = href.slice(SITE_PREFIX.length);
  const i = rest.search(/[/?#]/);
  const key = i === -1 ? rest : rest.slice(0, i);
  let tail = i === -1 ? '/' : rest.slice(i);
  if (!tail.startsWith('/')) tail = '/' + tail;
  return `biggle://${siteHost(key)}${tail}`;
}

/** Whether typed text is an address to open, rather than something to search for with Nox. */
export function looksLikeAddress(text: string): boolean {
  const t = text.trim();
  return /^(biggle:|https?:\/\/)/i.test(t) || TYPED_SITE_RE.test(t) || isInternal(t.toLowerCase());
}

/** The Nox search page for some text. */
export const noxSearch = (text: string) => `biggle://nox?q=${encodeURIComponent(text.trim())}`;

export type InputTarget = { kind: 'biggle'; href: string } | { kind: 'external'; href: string } | null;

/** What the user typed into an address box. */
export function fromInput(text: string): InputTarget {
  const t = text.trim();
  if (!t) return null;
  if (/^biggle:/i.test(t)) {
    const u = parse(t);
    return u && { kind: 'biggle', href: u.href };
  }
  if (/^https?:\/\/\S+$/i.test(t)) return { kind: 'external', href: t };
  if (TYPED_SITE_RE.test(t)) {
    const u = parse('biggle://' + t);
    return u && { kind: 'biggle', href: u.href };
  }
  const word = t.toLowerCase();
  if (NAME_RE.test(word)) {
    return { kind: 'biggle', href: isInternal(word) ? `biggle://${word}` : `biggle://${word}.biggle/` };
  }
  return null;
}
