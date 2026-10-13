// Who comes by a site: visit counts (one per person per day) and the site's guestbook.
// Pages show them with <biggle-visits> and <biggle-guestbook>; owners see the counts in My sites.
import { requireUser, type User } from './auth';
import { HttpError, json, readJson, SITE_KEY_RE, siteAddress, str } from './http';
import { addNotification } from './notifications';
import { blockedBetween, blockedIds } from './people';
import { countView } from './sitekit';

const GUESTBOOK_PAGE = 30;
const MAX_NOTE = 500;

/** Days since 1970 (UTC), the unit visits are counted in. */
export const today = () => Math.floor(Date.now() / 86_400_000);

type Site = { name: string; owner_id: number | null; status: string };

async function findSite(env: Env, key: string): Promise<Site> {
  const site = await env.DB.prepare('SELECT name, owner_id, status FROM names WHERE name = ?').bind(key.toLowerCase()).first<Site>();
  if (!site) throw new HttpError(404, 'no_such_site', `${siteAddress(key)} doesn't exist.`);
  return site;
}

const runs = (site: Site, user: User) => site.owner_id === user.id || !!user.is_admin;

/**
 * The browser opened one of the site's pages ({ path, from }: which page, and the site whose link
 * led here). A visit counts once per person per day; page views count every time.
 */
export async function visit(req: Request, env: Env, key: string): Promise<Response> {
  const user = await requireUser(req, env);
  const site = await findSite(env, key);
  const input = await readJson(req);
  // Sites waiting for approval are only seen by their owner and admins.
  if (site.status === 'live') {
    await env.DB.prepare('INSERT OR IGNORE INTO site_visits (site, day, user_id) VALUES (?, ?, ?)').bind(site.name, today(), user.id).run();
    const from = typeof input.from === 'string' && SITE_KEY_RE.test(input.from) ? input.from : null;
    await countView(env, site.name, str(input.path), from);
  }
  return json({});
}

export type VisitCounts = { visits: number; visitors: number; today: number; week: number };

export async function counts(env: Env, key: string): Promise<VisitCounts> {
  const day = today();
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS visits, COUNT(DISTINCT user_id) AS visitors,
       COALESCE(SUM(day = ?), 0) AS today, COALESCE(SUM(day > ?), 0) AS week
     FROM site_visits WHERE site = ?`,
  )
    .bind(day, day - 7, key)
    .first<VisitCounts>();
  return row ?? { visits: 0, visitors: 0, today: 0, week: 0 };
}

/** How many visits a site has had: in all, from how many people, today and in the last 7 days. */
export async function visits(req: Request, env: Env, key: string): Promise<Response> {
  await requireUser(req, env);
  const site = await findSite(env, key);
  return json(await counts(env, site.name));
}

// --- Guestbooks ---

type Note = { id: number; author: string; user_id: number; body: string; created_at: number };

const shown = (n: Note, site: Site, me: User) => ({
  id: n.id,
  author: n.author,
  body: n.body,
  at: n.created_at,
  /** The person who wrote it, the site's owner and admins can take it down. */
  canDelete: n.user_id === me.id || runs(site, me),
});

/** A site's guestbook, newest first, a page at a time (`?before=<id>` for older notes). */
export async function guestbook(req: Request, env: Env, key: string): Promise<Response> {
  const me = await requireUser(req, env);
  const site = await findSite(env, key);
  const before = Number(new URL(req.url).searchParams.get('before')) || Number.MAX_SAFE_INTEGER;
  const { results } = await env.DB.prepare(
    `SELECT g.id, g.user_id, g.body, g.created_at, u.username AS author
     FROM guestbook g JOIN users u ON u.id = g.user_id
     WHERE g.site = ? AND g.id < ? ORDER BY g.id DESC LIMIT ?`,
  )
    .bind(site.name, before, GUESTBOOK_PAGE + 1)
    .all<Note>();
  const total = await env.DB.prepare('SELECT COUNT(*) AS n FROM guestbook WHERE site = ?').bind(site.name).first<{ n: number }>();
  const blocked = await blockedIds(env, me.id);
  return json({
    notes: results
      .slice(0, GUESTBOOK_PAGE)
      .filter((n) => !blocked.has(n.user_id))
      .map((n) => shown(n, site, me)),
    more: results.length > GUESTBOOK_PAGE,
    total: total?.n ?? 0,
  });
}

export async function sign(req: Request, env: Env, key: string): Promise<Response> {
  const me = await requireUser(req, env);
  const site = await findSite(env, key);
  if (site.status !== 'live' && !runs(site, me)) throw new HttpError(404, 'no_such_site', `${siteAddress(key)} doesn't exist.`);
  if (!(await env.MESSAGE_LIMIT.limit({ key: `guestbook:${me.id}` })).success) {
    throw new HttpError(429, 'slow_down', 'Slow down a little, then try again.');
  }
  const body = str((await readJson(req)).body).trim();
  if (!body) throw new HttpError(400, 'empty', 'Write something first.');
  if (body.length > MAX_NOTE) throw new HttpError(400, 'too_long', `Keep it under ${MAX_NOTE} characters.`);
  if (site.owner_id && (await blockedBetween(env, site.owner_id, me.id))) {
    throw new HttpError(403, 'blocked', 'You can’t sign this guestbook.');
  }
  const row = await env.DB.prepare('INSERT INTO guestbook (site, user_id, body) VALUES (?, ?, ?) RETURNING id, created_at')
    .bind(site.name, me.id, body)
    .first<{ id: number; created_at: number }>();
  const note: Note = { id: row!.id, user_id: me.id, author: me.username, body, created_at: row!.created_at };
  if (site.owner_id && site.owner_id !== me.id) {
    await addNotification(env, site.owner_id, 'guestbook', { site: site.name, author: me.username, body: body.slice(0, 140) });
  }
  return json({ note: shown(note, site, me) }, 201);
}

export async function unsign(req: Request, env: Env, id: string): Promise<Response> {
  const me = await requireUser(req, env);
  const note = await env.DB.prepare('SELECT site, user_id FROM guestbook WHERE id = ?').bind(Number(id)).first<{ site: string; user_id: number }>();
  if (!note) throw new HttpError(404, 'no_such_note', 'That note is gone.');
  if (note.user_id !== me.id && !runs(await findSite(env, note.site), me)) {
    throw new HttpError(403, 'not_yours', 'Only the person who wrote it and the site’s owner can take that down.');
  }
  await env.DB.prepare('DELETE FROM guestbook WHERE id = ?').bind(Number(id)).run();
  return json({});
}
