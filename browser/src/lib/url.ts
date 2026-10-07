import { PREVIEW_PREFIX, SITE_PREFIX } from './config';

export const NAME_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Built-in pages, addressed as `biggle://<page>/<path>?<query>` with no `.biggle`. */
export type InternalPage = 'start' | 'admin' | 'sites' | 'nox';
const INTERNAL_PAGES = new Set<string>(['start', 'admin', 'sites', 'nox']);
export const START = 'biggle://start';

const isInternal = (s: string): s is InternalPage => INTERNAL_PAGES.has(s);

export type SiteUrl = { kind: 'site'; name: string; path: string; search: string; hash: string; href: string };
export type InternalUrl = { kind: 'internal'; page: InternalPage; path: string; search: string; hash: string; href: string };
export type BiggleUrl = SiteUrl | InternalUrl;

// Parsed by hand: browsers disagree on how to parse hosts in non-http URLs.
const URL_RE = /^biggle:\/\/([^/?#]*)([^?#]*)(\?[^#]*)?(#.*)?$/i;

export function parse(input: string): BiggleUrl | null {
  const m = URL_RE.exec(input.trim());
  if (!m) return null;
  const host = m[1].toLowerCase();
  if (isInternal(host)) {
    const path = (m[2] ?? '').replace(/^\/+|\/+$/g, '');
    const search = m[3] && m[3] !== '?' ? m[3] : '';
    const hash = m[4] && m[4] !== '#' ? m[4] : '';
    return { kind: 'internal', page: host, path, search, hash, href: `biggle://${host}${path ? '/' + path : ''}${search}${hash}` };
  }
  if (!host.endsWith('.biggle')) return null;
  const name = host.slice(0, -'.biggle'.length);
  if (!NAME_RE.test(name)) return null;

  // Resolve "." and ".." and percent-encode, without letting "//x" or "\x" turn into a host.
  const rawPath = '/' + (m[2] ?? '').replace(/\\/g, '%5C').replace(/^\/+/, '');
  const path = new URL(rawPath, 'https://x').pathname;
  const search = m[3] && m[3] !== '?' ? m[3] : '';
  const hash = m[4] && m[4] !== '#' ? m[4] : '';
  return { kind: 'site', name, path, search, hash, href: `biggle://${name}.biggle${path}${search}${hash}` };
}

export function withHash(u: SiteUrl, hash: string): SiteUrl {
  return parse(`biggle://${u.name}.biggle${u.path}${u.search}${hash}`) as SiteUrl;
}

/** Where the gateway serves a site's files from. Previews use a signed base instead. */
export function siteBase(u: SiteUrl, previewBase?: string): string {
  return previewBase ?? `${SITE_PREFIX}${u.name}/`;
}

/** Where the gateway serves this page from. */
export function toGateway(u: SiteUrl, previewBase?: string): string {
  return `${siteBase(u, previewBase)}${u.path.slice(1)}${u.search}`;
}

/** The biggle:// address for a gateway URL. Mirrored in page-runtime.js. */
export function fromGateway(href: string, previewBase?: string, previewSite?: string): string | null {
  if (previewBase && previewSite && href.startsWith(previewBase)) {
    return `biggle://${previewSite}.biggle/${href.slice(previewBase.length)}`;
  }
  if (href.startsWith(PREVIEW_PREFIX)) return null;
  if (!href.startsWith(SITE_PREFIX)) return null;
  const rest = href.slice(SITE_PREFIX.length);
  const i = rest.search(/[/?#]/);
  const name = i === -1 ? rest : rest.slice(0, i);
  let tail = i === -1 ? '/' : rest.slice(i);
  if (!tail.startsWith('/')) tail = '/' + tail;
  return `biggle://${name}.biggle${tail}`;
}

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
  if (/^[a-z0-9-]+\.biggle(?:[/?#]|$)/i.test(t)) {
    const u = parse('biggle://' + t);
    return u && { kind: 'biggle', href: u.href };
  }
  const word = t.toLowerCase();
  if (NAME_RE.test(word)) {
    return { kind: 'biggle', href: isInternal(word) ? `biggle://${word}` : `biggle://${word}.biggle/` };
  }
  return null;
}
