// Link previews: a biggle:// link sent in a chat shows the page's title, description and picture,
// from its <title>, <meta name="description"> and <meta property="og:image"> (set in the site
// editor's Link preview settings).
//
//   GET /api/link-preview?url=biggle://hello.biggle/about.bhtml
import { requireUser } from './auth';
import { blobBytes, CORS, HttpError, siteAddress, siteKey } from './http';

const MAX_READ = 200_000;

const attr = (tag: string, name: string) => {
  const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return m ? (m[2] ?? m[3] ?? m[4] ?? '').trim() : null;
};

const decode = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');

/** The bits of a page's <head> a preview needs. */
export function readHead(html: string) {
  const head = html.slice(0, 50_000);
  const metas = [...head.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  const meta = (...names: string[]) => {
    for (const tag of metas) {
      const key = (attr(tag, 'name') ?? attr(tag, 'property') ?? '').toLowerCase();
      if (names.includes(key)) return attr(tag, 'content');
    }
    return null;
  };
  const icon = [...head.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]).find((tag) => /\bicon\b/i.test(attr(tag, 'rel') ?? ''));
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1];
  return {
    title: title ? decode(title.replace(/\s+/g, ' ').trim()).slice(0, 120) : meta('og:title'),
    description: meta('description', 'og:description')?.slice(0, 300) ?? null,
    image: meta('og:image', 'image', 'twitter:image'),
    icon: icon ? attr(icon, 'href') : null,
  };
}

export async function linkPreview(req: Request, env: Env): Promise<Response> {
  await requireUser(req, env);
  const url = new URL(req.url).searchParams.get('url') ?? '';
  const m = /^biggle:\/\/([a-z0-9-]+)\.(biggle|b)(\/[^?#]*)?/i.exec(url);
  if (!m) throw new HttpError(400, 'bad_url', "That isn't a Bigglenet address.");
  const key = siteKey(m[1].toLowerCase(), m[2].toLowerCase());
  const site = await env.DB.prepare('SELECT name, url, title, status FROM names WHERE name = ?').bind(key).first<{ name: string; url: string | null; title: string | null; status: string }>();
  if (!site || site.status !== 'live') throw new HttpError(404, 'no_such_name', `${siteAddress(key)} doesn't exist.`);

  let info: ReturnType<typeof readHead> = { title: site.title, description: null, image: null, icon: null };
  let dir = '';
  if (!site.url) {
    // A site made on the Bigglenet: read the page from the database.
    let path = decodeURIComponent(m[3] ?? '/').replace(/^\/+/, '');
    if (path === '' || path.endsWith('/')) path += 'index.bhtml';
    const candidates = /\.[a-z0-9]+$/i.test(path) ? [path] : [`${path}.bhtml`, `${path}/index.bhtml`];
    for (const candidate of candidates) {
      const file = await env.DB.prepare('SELECT content, type FROM site_files WHERE site = ? AND path = ?').bind(site.name, candidate).first<{
        content: ArrayBuffer | number[];
        type: string;
      }>();
      if (file && /bhtml|html/.test(file.type)) {
        const page = readHead(new TextDecoder().decode(blobBytes(file.content).slice(0, MAX_READ)));
        info = { ...page, title: page.title || site.title };
        dir = candidate.includes('/') ? candidate.slice(0, candidate.lastIndexOf('/') + 1) : '';
        break;
      }
    }
  }
  // Pictures come through the gateway, so the browser can show them.
  const origin = new URL(req.url).origin;
  const absolute = (src: string | null) => {
    if (!src || /^(javascript|data):/i.test(src)) return null;
    try {
      const u = new URL(src, `${origin}/site/${site.name}/${dir}`);
      return u.origin === origin && u.pathname.startsWith(`/site/${site.name}/`) ? u.href : null;
    } catch {
      return null;
    }
  };
  return new Response(
    JSON.stringify({ site: siteAddress(site.name), title: info.title, description: info.description, image: absolute(info.image), icon: absolute(info.icon) }),
    { headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, max-age=300' } },
  );
}
