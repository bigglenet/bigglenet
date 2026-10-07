// Biggle DNS (name → host) and the gateway that serves site files: either fetched from the
// site's own host, or (for sites made in the Biggle editor) straight from the database.
import { blobBytes, CORS, fail, json, NAME_RE, redirect } from './http';
import { checkPreviewToken } from './sites';

type Site = { name: string; url: string | null; title: string | null; status: string };

const USER_AGENT = 'Bigglenet/1 (+https://bigglenet.ethembeldagli.dev)';
const RESOLVE_TTL_MS = 30_000;

const resolveCache = new Map<string, { site: Site | null; at: number }>();

export function forget(name: string) {
  resolveCache.delete(name);
}

async function resolve(env: Env, name: string): Promise<Site | null> {
  name = name.toLowerCase();
  if (!NAME_RE.test(name)) return null;
  const hit = resolveCache.get(name);
  if (hit && Date.now() - hit.at < RESOLVE_TTL_MS) return hit.site;
  const site = await env.DB.prepare('SELECT name, url, title, status FROM names WHERE name = ?').bind(name).first<Site>();
  resolveCache.set(name, { site, at: Date.now() });
  return site;
}

/** Every name, for the browser's start page. */
export async function directory(_req: Request, env: Env): Promise<Response> {
  const { results } = await env.DB.prepare("SELECT name, title FROM names WHERE status = 'live' ORDER BY name").all<Site>();
  return json({ names: results });
}

export async function resolveName(_req: Request, env: Env, name: string): Promise<Response> {
  const site = await resolve(env, name);
  if (!site || site.status !== 'live') return fail(404, 'no_such_name', `${name}.biggle doesn't exist.`);
  return json({ name: site.name, url: site.url, title: site.title });
}

export async function gateway(req: Request, env: Env, name: string, rest: string, search: string): Promise<Response> {
  const site = await resolve(env, name);
  if (!site || site.status !== 'live') return fail(404, 'no_such_name', `${name}.biggle doesn't exist.`);

  // `/site/hello` → `/site/hello/`, so relative links in the page resolve inside the site.
  if (rest === '') return redirect(`/site/${site.name}/${search}`);

  let path = rest.slice(1);
  if (path === '' || path.endsWith('/')) path += 'index.bhtml';
  if (!site.url) return serveHosted(req, env, site.name, path);

  const base = new URL(site.url);
  const target = new URL(path + search, base);
  if (!inside(target, base)) return fail(400, 'bad_path', 'That path leaves the site.');

  const headers = new Headers({ 'User-Agent': USER_AGENT });
  for (const h of ['Accept', 'Range', 'If-None-Match', 'If-Modified-Since']) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }

  let res: Response;
  try {
    res = await fetch(target, { method: req.method, headers, redirect: 'manual' });
  } catch {
    return fail(502, 'host_unreachable', `${site.name}.biggle's host isn't responding.`);
  }

  if (res.status >= 300 && res.status < 400 && res.status !== 304) {
    const location = res.headers.get('Location');
    const dest = location ? new URL(location, target) : null;
    if (!dest || !inside(dest, base)) {
      return fail(502, 'bad_redirect', `${site.name}.biggle redirected outside the site.`);
    }
    return redirect(`/site/${site.name}/${dest.pathname.slice(base.pathname.length)}${dest.search}`, res.status);
  }

  const out = new Headers(CORS);
  const type = path.endsWith('.bhtml') ? 'text/bhtml; charset=utf-8' : res.headers.get('Content-Type');
  if (type) out.set('Content-Type', type);
  for (const h of ['ETag', 'Last-Modified', 'Cache-Control', 'Content-Range', 'Accept-Ranges']) {
    const v = res.headers.get(h);
    if (v) out.set(h, v);
  }
  // Site files are only ever data for the Biggle browser. If someone opens one directly,
  // it must not run as a page on this origin.
  out.set('Content-Security-Policy', 'sandbox');
  out.set('X-Content-Type-Options', 'nosniff');
  out.set('Referrer-Policy', 'no-referrer');
  out.set('Cross-Origin-Resource-Policy', 'cross-origin');
  return new Response(res.body, { status: res.status, headers: out });
}

function inside(url: URL, base: URL): boolean {
  return url.origin === base.origin && url.pathname.startsWith(base.pathname);
}

/** /preview/<token>/<path>: a site before it's approved, for its owner and admins. */
export async function preview(req: Request, env: Env, token: string, rest: string, search: string): Promise<Response> {
  const name = await checkPreviewToken(env, token);
  if (!name) return fail(403, 'preview_expired', 'This preview link has expired.');
  if (rest === '') return redirect(`/preview/${token}/${search}`);
  let path = rest.slice(1);
  if (path === '' || path.endsWith('/')) path += 'index.bhtml';
  return serveHosted(req, env, name, path);
}

async function serveHosted(req: Request, env: Env, site: string, rawPath: string): Promise<Response> {
  let path: string;
  try {
    path = decodeURIComponent(rawPath);
  } catch {
    return fail(400, 'bad_path', "That address isn't valid.");
  }
  const file = await env.DB.prepare('SELECT type, content, updated_at FROM site_files WHERE site = ? AND path = ?')
    .bind(site, path)
    .first<{ type: string; content: ArrayBuffer | number[]; updated_at: number }>();
  if (!file) {
    // "/blog" → "/blog/" when there's a blog/index.bhtml.
    if (!path.includes('.')) {
      const index = await env.DB.prepare('SELECT 1 FROM site_files WHERE site = ? AND path = ?').bind(site, `${path}/index.bhtml`).first();
      if (index) return redirect(new URL(req.url).pathname + '/');
    }
    return new Response('Not found', { status: 404, headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8', 'Content-Security-Policy': 'sandbox' } });
  }
  const body = blobBytes(file.content);
  const etag = `"${file.updated_at}-${body.length}"`;
  const headers = new Headers({
    ...CORS,
    'Content-Type': file.type,
    ETag: etag,
    'Cache-Control': 'public, max-age=0, must-revalidate',
    'Content-Security-Policy': 'sandbox',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'cross-origin',
  });
  if (req.headers.get('If-None-Match') === etag) return new Response(null, { status: 304, headers });
  return new Response(req.method === 'HEAD' ? null : body, { headers });
}
