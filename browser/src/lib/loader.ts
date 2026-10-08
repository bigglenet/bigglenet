import runtime from './page-runtime.js?raw';
import { PREVIEW_PREFIX, SERVER, SITE_PREFIX } from './config';
import { readLocal } from './storage';
import { fromGateway, parse, siteBase, toGateway, withHash, type SiteUrl } from './url';

export type BiggleUser = { username: string };

export type ErrorCode =
  | 'bad_address'
  | 'server_unreachable'
  | 'no_such_name'
  | 'host_unreachable'
  | 'bad_redirect'
  | 'not_found'
  | 'http'
  | 'not_bhtml'
  | 'bhtml_version'
  | 'unsupported'
  | 'preview_expired';

export type PageError = { code: ErrorCode; status?: number; detail?: string };

export type LoadResult =
  | { type: 'page'; href: string; srcdoc: string }
  | { type: 'error'; href: string; error: PageError }
  | { type: 'aborted' };

const SERVER_ERRORS = new Set<string>(['no_such_name', 'host_unreachable', 'bad_redirect', 'preview_expired']);
const HEADER_RE = /^﻿?\s*<!bhtml\s+(\d+)\s*>/i;

export async function load(
  u: SiteUrl,
  opts: { signal: AbortSignal; fresh?: boolean; user: BiggleUser | null; preview?: string },
): Promise<LoadResult> {
  const base = opts.preview;
  let res: Response;
  try {
    res = await fetch(toGateway(u, base), {
      signal: opts.signal,
      cache: opts.fresh ? 'no-cache' : 'default',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  } catch {
    if (opts.signal.aborted) return { type: 'aborted' };
    return { type: 'error', href: u.href, error: { code: 'server_unreachable' } };
  }

  // The gateway may have redirected (e.g. "/blog" → "/blog/"), so the page's address can change.
  const redirected = parse(fromGateway(res.url, base, u.name) ?? '');
  const final = redirected?.kind === 'site' ? withHash(redirected, u.hash) : u;
  const fail = (error: PageError): LoadResult => ({ type: 'error', href: final.href, error });

  try {
    const biggleError = res.headers.get('X-Biggle-Error');
    if (biggleError) {
      const body = await res.json().catch(() => ({}));
      const code = SERVER_ERRORS.has(biggleError) ? (biggleError as ErrorCode) : 'http';
      return fail({ code, status: res.status, detail: body.message });
    }
    if (res.status === 404) return fail({ code: 'not_found', status: 404 });
    if (!res.ok) return fail({ code: 'http', status: res.status });

    const type = (res.headers.get('Content-Type') ?? '').split(';')[0].trim().toLowerCase();
    if (type.startsWith('image/')) {
      return { type: 'page', href: final.href, srcdoc: imageViewer(final, base) };
    }
    const textual = !type || type.startsWith('text/') || type === 'application/octet-stream' || /json|xml/.test(type);
    if (!textual) return fail({ code: 'unsupported', detail: type });

    const text = await res.text();
    const header = HEADER_RE.exec(text);
    if (header) {
      if (header[1] !== '1') return fail({ code: 'bhtml_version', detail: header[1] });
      return { type: 'page', href: final.href, srcdoc: page(final, text.slice(header[0].length), opts.user, base) };
    }
    if (type === 'text/plain' || type === 'application/json' || final.path.endsWith('.txt')) {
      return { type: 'page', href: final.href, srcdoc: textViewer(final, text, base) };
    }
    return fail({ code: 'not_bhtml', detail: /<html|<!doctype html/i.test(text.slice(0, 1000)) ? 'html' : undefined });
  } catch {
    if (opts.signal.aborted) return { type: 'aborted' };
    return fail({ code: 'server_unreachable' });
  }
}

// Pages may only load things from Biggle sites. No third parties means no ads or trackers.
const SITES = `${SITE_PREFIX} ${PREVIEW_PREFIX}`;
const CSP = [
  `default-src 'none'`,
  `script-src 'unsafe-inline' 'unsafe-eval' ${SITES}`,
  `style-src 'unsafe-inline' ${SITES}`,
  `img-src ${SITES} data: blob:`,
  `font-src ${SITES} data:`,
  `media-src ${SITES} data: blob:`,
  `connect-src ${SITES}`,
  `worker-src ${SITES} blob:`,
  `base-uri ${SITES}`,
  `form-action 'none'`,
].join('; ');

const BASE_CSS =
  'biggle-signed-in,biggle-signed-out{display:contents}' +
  'biggle-signed-in[hidden],biggle-signed-out[hidden]{display:none!important}';

const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const html = (s: string) => attr(s).replace(/>/g, '&gt;');

function head(u: SiteUrl, base?: string): string {
  return `<!DOCTYPE html><meta http-equiv="Content-Security-Policy" content="${attr(CSP)}"><base href="${attr(toGateway(u, base))}">`;
}

function page(u: SiteUrl, body: string, user: BiggleUser | null, base?: string): string {
  const init = { url: u.href, site: u.name, base: siteBase(u, base), server: SERVER, search: u.search, hash: u.hash, user, local: readLocal(u.name) };
  const initJson = JSON.stringify(init).replace(/</g, '\\u003c');
  return `${head(u, base)}<style>${BASE_CSS}</style><script>window.__BIGGLE_INIT__=${initJson};${runtime}</script>${body}`;
}

/** A page from BHTML text that's already in hand, such as the site editor's live preview. */
export function renderPage(u: SiteUrl, text: string, user: BiggleUser | null, base?: string): string | null {
  const header = HEADER_RE.exec(text);
  return header ? page(u, text.slice(header[0].length), user, base) : null;
}

const fileName = (u: SiteUrl) => decodeURIComponent(u.path.split('/').pop() || u.name);

function imageViewer(u: SiteUrl, base?: string): string {
  return `${head(u, base)}<title>${html(fileName(u))}</title>
<style>html,body{margin:0;height:100%;background:#111}body{display:grid;place-items:center}img{max-width:100%;max-height:100%}</style>
<img src="${attr(toGateway(u, base))}" alt="">`;
}

function textViewer(u: SiteUrl, text: string, base?: string): string {
  return `${head(u, base)}<title>${html(fileName(u))}</title>
<style>:root{color-scheme:light dark}body{margin:0;padding:16px}pre{margin:0;font:13px/1.5 ui-monospace,Menlo,monospace;white-space:pre-wrap;word-break:break-word}</style>
<pre>${html(text)}</pre>`;
}
