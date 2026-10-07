// Biggle DNS (name → host) and the gateway that fetches site files from their host.
import { CORS, fail, json, NAME_RE, redirect } from './http';

type Site = { name: string; url: string; title: string | null };

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
  const site = await env.DB.prepare('SELECT name, url, title FROM names WHERE name = ?').bind(name).first<Site>();
  resolveCache.set(name, { site, at: Date.now() });
  return site;
}

/** Every name, for the browser's start page. */
export async function directory(_req: Request, env: Env): Promise<Response> {
  const { results } = await env.DB.prepare('SELECT name, title FROM names ORDER BY name').all<Site>();
  return json({ names: results });
}

export async function resolveName(_req: Request, env: Env, name: string): Promise<Response> {
  const site = await resolve(env, name);
  if (!site) return fail(404, 'no_such_name', `${name}.biggle doesn't exist.`);
  return json(site);
}

export async function gateway(req: Request, env: Env, name: string, rest: string, search: string): Promise<Response> {
  const site = await resolve(env, name);
  if (!site) return fail(404, 'no_such_name', `${name}.biggle doesn't exist.`);

  // `/site/hello` → `/site/hello/`, so relative links in the page resolve inside the site.
  if (rest === '') return redirect(`/site/${site.name}/${search}`);

  const base = new URL(site.url);
  let path = rest.slice(1);
  if (path === '' || path.endsWith('/')) path += 'index.bhtml';
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
