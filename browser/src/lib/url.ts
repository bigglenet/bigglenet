import { SITE_PREFIX } from './config';

export const NAME_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Built-in pages, addressed as `biggle://<page>` with no `.biggle`. */
export type InternalPage = 'start' | 'admin' | 'nox';
const INTERNAL_PAGES = new Set<string>(['start', 'admin', 'nox']);
export const START = 'biggle://start';

const isInternal = (s: string): s is InternalPage => INTERNAL_PAGES.has(s);

export type SiteUrl = { kind: 'site'; name: string; path: string; search: string; hash: string; href: string };
export type InternalUrl = { kind: 'internal'; page: InternalPage; search: string; hash: string; href: string };
export type BiggleUrl = SiteUrl | InternalUrl;

// Parsed by hand: browsers disagree on how to parse hosts in non-http URLs.
const URL_RE = /^biggle:\/\/([^/?#]*)([^?#]*)(\?[^#]*)?(#.*)?$/i;

export function parse(input: string): BiggleUrl | null {
  const m = URL_RE.exec(input.trim());
  if (!m) return null;
  const host = m[1].toLowerCase();
  if (isInternal(host)) {
    const search = m[3] && m[3] !== '?' ? m[3] : '';
    const hash = m[4] && m[4] !== '#' ? m[4] : '';
    return { kind: 'internal', page: host, search, hash, href: `biggle://${host}${search}${hash}` };
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

/** Where the gateway serves this page from. */
export function toGateway(u: SiteUrl): string {
  return `${SITE_PREFIX}${u.name}${u.path}${u.search}`;
}

/** The biggle:// address for a gateway URL. Mirrored in page-runtime.js. */
export function fromGateway(href: string): string | null {
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
