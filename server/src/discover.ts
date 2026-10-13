// Finding sites in Nox: every site with its visits, tags and labels (new, updated, trending), the
// site of the day, "This week on the Bigglenet", searching what pages say, and following sites.
// Webrings are in webrings.ts.
//
//   GET    /api/discover              every live site, with visits, tags and labels
//   GET    /api/discover/today        the site of the day
//   GET    /api/discover/week         this week: new sites, most visited, busiest guestbooks, threads
//   GET    /api/search?q=             pages that say something (site_pages, filled by indexSome)
//   GET    /api/follows               sites you follow, and which changed since you looked
//   POST   /api/follows               { site }
//   DELETE /api/follows/:site
//   PUT    /api/sites/:key/tags       { tags }: whoever runs the site
//   PUT    /api/admin/site-of-day     { site }: an admin picks today's
import { requireAdmin, requireUser } from './auth';
import { HttpError, json, readJson, SITE_KEY_RE, siteAddress, str } from './http';
import { isEditor } from './sites';
import { today } from './visitors';

export const TAGS = ['games', 'art', 'music', 'writing', 'tech', 'fun', 'personal', 'learning', 'news', 'tools', 'community', 'animals'] as const;
const MAX_TAGS = 3;
const DAY = 86400;

/** Lower case, no accents: what's searched (Turkish ı and İ become i too). */
export const fold = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ı/g, 'i');

type Row = {
  name: string;
  tld: string;
  title: string | null;
  created_at: number;
  updated_at: number;
  visits: number;
  week: number;
  before: number;
};

/** New this week, changed in the last three days, or visited much more than the week before. */
function labels(s: Row, now: number): string[] {
  const out: string[] = [];
  if (now - s.created_at < 7 * DAY) out.push('new');
  else if (now - s.updated_at < 3 * DAY) out.push('updated');
  if (s.week >= 3 && s.week >= 1.5 * Math.max(1, s.before)) out.push('trending');
  return out;
}

export async function discover(req: Request, env: Env): Promise<Response> {
  await requireUser(req, env);
  const day = today();
  const [sites, tags] = await env.DB.batch([
    env.DB.prepare(
      `SELECT n.name, n.tld, n.title, n.created_at, n.updated_at,
         COUNT(v.user_id) AS visits,
         COALESCE(SUM(v.day > ?1), 0) AS week,
         COALESCE(SUM(v.day > ?2 AND v.day <= ?1), 0) AS before
       FROM names n LEFT JOIN site_visits v ON v.site = n.name
       WHERE n.status = 'live' GROUP BY n.name`,
    ).bind(day - 7, day - 14),
    env.DB.prepare("SELECT t.site, t.tag FROM site_tags t JOIN names n ON n.name = t.site WHERE n.status = 'live'"),
  ]);
  const now = Math.floor(Date.now() / 1000);
  const byTag = new Map<string, string[]>();
  for (const t of tags.results as { site: string; tag: string }[]) byTag.set(t.site, [...(byTag.get(t.site) ?? []), t.tag]);
  return json({
    tags: TAGS,
    sites: (sites.results as Row[]).map((s) => ({
      name: s.name,
      tld: s.tld,
      title: s.title,
      created: s.created_at,
      updated: s.updated_at,
      visits: s.visits,
      week: s.week,
      tags: byTag.get(s.name) ?? [],
      labels: labels(s, now),
    })),
  });
}

// --- The site of the day ---

const hash = (n: number) => {
  let x = n * 2654435761;
  x ^= x >>> 16;
  return Math.abs(x);
};

export async function siteOfTheDay(req: Request, env: Env): Promise<Response> {
  await requireUser(req, env);
  const day = today();
  let pick = (await env.DB.prepare('SELECT site FROM site_of_day WHERE day = ?').bind(day).first<{ site: string }>())?.site;
  if (!pick) {
    // A site with something in it that hasn't been picked lately. Busier sites come up more.
    const { results } = await env.DB.prepare(
      `SELECT n.name, (SELECT COUNT(*) FROM site_visits v WHERE v.site = n.name AND v.day > ?1) AS week FROM names n
       WHERE n.status = 'live' AND n.name NOT IN (SELECT site FROM site_of_day WHERE day > ?2)
         AND (n.url IS NOT NULL OR EXISTS (SELECT 1 FROM site_files f WHERE f.site = n.name))
       ORDER BY n.name`,
    )
      .bind(day - 30, day - 45)
      .all<{ name: string; week: number }>();
    if (!results.length) return json({ site: null });
    const tickets = results.flatMap((r) => Array(1 + Math.min(4, Math.floor(Math.sqrt(r.week)))).fill(r.name) as string[]);
    pick = tickets[hash(day) % tickets.length];
    await env.DB.prepare('INSERT OR IGNORE INTO site_of_day (day, site) VALUES (?, ?)').bind(day, pick).run();
    pick = (await env.DB.prepare('SELECT site FROM site_of_day WHERE day = ?').bind(day).first<{ site: string }>())?.site ?? pick;
  }
  const row = await env.DB.prepare(
    `SELECT n.name, n.tld, n.title, p.description, substr(p.text, 1, 300) AS text FROM names n
     LEFT JOIN site_pages p ON p.site = n.name AND p.path = 'index.bhtml' WHERE n.name = ?`,
  )
    .bind(pick)
    .first<{ name: string; tld: string; title: string | null; description: string | null; text: string | null }>();
  if (!row) return json({ site: null });
  const about = row.description || (row.text ? row.text.replace(/\s+/g, ' ').trim().slice(0, 160) : null);
  return json({ site: { name: row.name, tld: row.tld, title: row.title, about } });
}

export async function pickSiteOfTheDay(req: Request, env: Env): Promise<Response> {
  await requireAdmin(req, env);
  const site = str((await readJson(req)).site).trim().toLowerCase().replace(/\.biggle$/, '');
  const row = await env.DB.prepare('SELECT status FROM names WHERE name = ?').bind(site).first<{ status: string }>();
  if (!row || row.status !== 'live') throw new HttpError(404, 'no_such_site', `${siteAddress(site)} doesn't exist.`);
  await env.DB.prepare('INSERT INTO site_of_day (day, site) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET site = excluded.site').bind(today(), site).run();
  return json({});
}

// --- This week on the Bigglenet ---

export async function thisWeek(req: Request, env: Env): Promise<Response> {
  await requireUser(req, env);
  const day = today();
  const since = Math.floor(Date.now() / 1000) - 7 * DAY;
  const [fresh, visited, guestbooks, threads] = await env.DB.batch([
    env.DB.prepare("SELECT name, tld, title, created_at FROM names WHERE status = 'live' AND created_at > ? ORDER BY created_at DESC LIMIT 12").bind(since),
    env.DB.prepare(
      `SELECT n.name, n.tld, n.title, COUNT(*) AS visits FROM site_visits v JOIN names n ON n.name = v.site
       WHERE v.day > ? AND n.status = 'live' GROUP BY n.name ORDER BY visits DESC LIMIT 10`,
    ).bind(day - 7),
    env.DB.prepare(
      `SELECT n.name, n.tld, n.title, COUNT(*) AS notes FROM guestbook g JOIN names n ON n.name = g.site
       WHERE g.created_at > ? AND n.status = 'live' GROUP BY n.name ORDER BY notes DESC LIMIT 6`,
    ).bind(since),
    env.DB.prepare(
      `SELECT t.id, t.title, t.board, (SELECT COUNT(*) FROM board_posts p WHERE p.thread_id = t.id AND p.created_at > ?1) AS posts
       FROM board_threads t WHERE t.last_at > ?1 ORDER BY posts DESC, t.last_at DESC LIMIT 6`,
    ).bind(since),
  ]);
  return json({ new: fresh.results, visited: visited.results, guestbooks: guestbooks.results, threads: threads.results });
}

// --- Search: what pages say ---

const MAX_TERMS = 5;
const PER_SITE = 3;

export async function search(req: Request, env: Env): Promise<Response> {
  await requireUser(req, env);
  const q = fold(new URL(req.url).searchParams.get('q') ?? '');
  const terms = [...new Set(q.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 2))].slice(0, MAX_TERMS);
  if (!terms.length) return json({ results: [] });
  const { results } = await env.DB.prepare(
    `SELECT p.site, p.path, p.title, p.description, p.text, p.folded, n.tld, n.title AS site_title FROM site_pages p JOIN names n ON n.name = p.site
     WHERE n.status = 'live' AND ${terms.map((_, i) => `instr(p.folded, ?${i + 1}) > 0`).join(' AND ')} LIMIT 300`,
  )
    .bind(...terms)
    .all<{ site: string; path: string; title: string | null; description: string | null; text: string; folded: string; tld: string; site_title: string | null }>();
  const count = (hay: string, needle: string) => hay.split(needle).length - 1;
  const scored = results.map((r) => {
    const title = fold(`${r.title ?? ''} ${r.site_title ?? ''} ${r.site}`);
    const score = terms.reduce((n, t) => n + 6 * count(title, t) + Math.min(10, count(r.folded, t)), 0) + (r.path === 'index.bhtml' ? 2 : 0);
    return { r, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const perSite = new Map<string, number>();
  const out = [];
  for (const { r } of scored) {
    const n = perSite.get(r.site) ?? 0;
    if (n >= PER_SITE) continue;
    perSite.set(r.site, n + 1);
    out.push({ site: r.site, tld: r.tld, path: r.path, title: r.title || r.site_title, snippet: snippet(r.description, r.text, terms) });
    if (out.length >= 30) break;
  }
  return json({ results: out });
}

/** A line around the first place the page says what was searched for. */
function snippet(description: string | null, text: string, terms: string[]): string {
  const folded = fold(text);
  const at = Math.min(...terms.map((t) => folded.indexOf(t)).filter((i) => i >= 0));
  if (!Number.isFinite(at)) return (description ?? text).slice(0, 180);
  const start = Math.max(0, at - 70);
  return (start > 0 ? '…' : '') + text.slice(start, start + 180).replace(/\s+/g, ' ').trim() + (start + 180 < text.length ? '…' : '');
}

// --- Indexing: the cron reads changed sites' pages a few at a time ---

const PAGE_RE = /\.(bhtml|html?|txt|md)$/i;
const MAX_PAGES = 30;
const MAX_TEXT = 20_000;
const INDEX_BATCH = 8;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', copy: '©' };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITIES[e.toLowerCase()] ?? m),
  );

/** A page's title, description and words, without its markup, scripts or styles. */
export function pageText(path: string, source: string): { title: string | null; description: string | null; text: string } {
  if (!/\.(bhtml|html?)$/i.test(path)) return { title: null, description: null, text: source.slice(0, MAX_TEXT) };
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(source)?.[1] ?? /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(source)?.[1] ?? null;
  const description = /<meta\b[^>]*\bname\s*=\s*["']?description["']?[^>]*\bcontent\s*=\s*"([^"]*)"/i.exec(source)?.[1] ?? null;
  const text = decode(
    source
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|template|svg)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<head\b[\s\S]*?<\/head>/i, ' ')
      .replace(/<(br|p|div|li|h[1-6]|tr|section|article|header|footer)\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
    .slice(0, MAX_TEXT);
  const clean = (s: string | null) => (s ? decode(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim().slice(0, 200) || null : null);
  return { title: clean(title), description: clean(description), text };
}

/** The cron: read the pages of sites that changed since they were last read. */
export async function indexSome(env: Env) {
  const { results } = await env.DB.prepare(
    `SELECT name FROM names WHERE status = 'live' AND url IS NULL AND (indexed_at IS NULL OR indexed_at < updated_at)
     ORDER BY updated_at DESC LIMIT ?`,
  )
    .bind(INDEX_BATCH)
    .all<{ name: string }>();
  for (const { name } of results) {
    const { results: files } = await env.DB.prepare('SELECT path, content FROM site_files WHERE site = ? ORDER BY path').bind(name).all<{ path: string; content: ArrayBuffer | number[] }>();
    const pages = files.filter((f) => PAGE_RE.test(f.path)).slice(0, MAX_PAGES);
    const decoder = new TextDecoder();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM site_pages WHERE site = ?').bind(name),
      ...pages.map((f) => {
        const bytes = f.content instanceof ArrayBuffer ? new Uint8Array(f.content) : Uint8Array.from(f.content);
        const p = pageText(f.path, decoder.decode(bytes));
        return env.DB.prepare('INSERT INTO site_pages (site, path, title, description, text, folded) VALUES (?, ?, ?, ?, ?, ?)').bind(
          name,
          f.path,
          p.title,
          p.description,
          p.text,
          fold([p.title, p.description, p.text].filter(Boolean).join('\n')),
        );
      }),
      env.DB.prepare('UPDATE names SET indexed_at = unixepoch() WHERE name = ?').bind(name),
    ]);
  }
}

// --- Following sites ---

const siteParam = (raw: unknown) => str(raw).trim().toLowerCase().replace(/^biggle:\/\//, '').replace(/[/?#].*$/, '').replace(/\.biggle$/, '');

export async function follows(req: Request, env: Env): Promise<Response> {
  const me = await requireUser(req, env);
  const { results } = await env.DB.prepare(
    `SELECT f.site, f.seen_at, n.tld, n.title, n.updated_at FROM follows f JOIN names n ON n.name = f.site
     WHERE f.user_id = ? AND n.status = 'live' ORDER BY n.updated_at DESC`,
  )
    .bind(me.id)
    .all<{ site: string; seen_at: number; tld: string; title: string | null; updated_at: number }>();
  return json({ follows: results.map((f) => ({ site: f.site, tld: f.tld, title: f.title, updated: f.updated_at, changed: f.updated_at > f.seen_at })) });
}

export async function follow(req: Request, env: Env): Promise<Response> {
  const me = await requireUser(req, env);
  const site = siteParam((await readJson(req)).site);
  if (!SITE_KEY_RE.test(site)) throw new HttpError(400, 'bad_site', 'That isn’t a site address.');
  const row = await env.DB.prepare('SELECT status FROM names WHERE name = ?').bind(site).first<{ status: string }>();
  if (!row || row.status !== 'live') throw new HttpError(404, 'no_such_site', `${siteAddress(site)} doesn't exist.`);
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM follows WHERE user_id = ?').bind(me.id).first<{ n: number }>();
  if ((count?.n ?? 0) >= 500) throw new HttpError(400, 'too_many', 'You can follow up to 500 sites.');
  await env.DB.prepare('INSERT OR IGNORE INTO follows (user_id, site) VALUES (?, ?)').bind(me.id, site).run();
  return json({});
}

export async function unfollow(req: Request, env: Env, raw: string): Promise<Response> {
  const me = await requireUser(req, env);
  await env.DB.prepare('DELETE FROM follows WHERE user_id = ? AND site = ?').bind(me.id, siteParam(raw)).run();
  return json({});
}

// --- Tags ---

export async function setTags(req: Request, env: Env, key: string): Promise<Response> {
  const me = await requireUser(req, env);
  const site = await env.DB.prepare('SELECT name, owner_id FROM names WHERE name = ?').bind(key.toLowerCase()).first<{ name: string; owner_id: number | null }>();
  if (!site) throw new HttpError(404, 'no_such_site', `${siteAddress(key)} doesn't exist.`);
  if (site.owner_id !== me.id && !me.is_admin && !(await isEditor(env, site.name, me.id))) throw new HttpError(403, 'not_yours', "That isn't your site.");
  const input = await readJson(req);
  const tags = [...new Set((Array.isArray(input.tags) ? input.tags : []).map((t) => str(t).toLowerCase()))].filter((t) => (TAGS as readonly string[]).includes(t)).slice(0, MAX_TAGS);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM site_tags WHERE site = ?').bind(site.name),
    ...tags.map((t) => env.DB.prepare('INSERT INTO site_tags (site, tag) VALUES (?, ?)').bind(site.name, t)),
  ]);
  return json({ tags });
}
