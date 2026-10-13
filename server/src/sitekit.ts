// What pages can use from the Bigglenet: comments, polls, likes, game leaderboards and
// achievements, a contact form, the shared drawing wall, and (for whoever runs the site) stats.
// Pages ask through the browser (page-runtime.js → frame.ts), which always says which site.
//
//   /api/sites/:key/comments?path=   GET, POST { path, body };  DELETE /api/comments/:id
//   /api/sites/:key/polls/:poll      GET, POST { choice, options }
//   /api/sites/:key/likes            GET, POST (like), DELETE (unlike)
//   /api/sites/:key/scores/:board    GET ?order=&limit=, POST { score, order }
//   /api/sites/:key/achievements     POST { key, title, description }
//   /api/sites/:key/contact          POST { body }
//   /api/sites/:key/walls/:wall      GET, POST { color, width, points }, DELETE (clear)
//   /api/sites/:key/stats            GET, for its owner, editors and admins
//   /api/online                      how many people are on the Bigglenet now
import { requireUser, type User } from './auth';
import { areFriends, directChat, postMessage } from './chat';
import { HttpError, json, readJson, siteAddress, str } from './http';
import { addNotification } from './notifications';
import { blockedBetween, blockedIds } from './people';
import { roomFor } from './rooms';
import { isEditor } from './sites';
import { today } from './visitors';

const NAME_RE = /^[a-z0-9_-]{1,40}$/i;
const MAX_COMMENT = 1000;
const MAX_CONTACT = 2000;
const MAX_STROKES = 4000;
const MAX_POINTS = 600;

type Site = { name: string; owner_id: number | null; status: string };

/** The site, if it exists and (unless you run it) is live. */
async function site(env: Env, key: string, me: User): Promise<Site> {
  const s = await env.DB.prepare('SELECT name, owner_id, status FROM names WHERE name = ?').bind(key.toLowerCase()).first<Site>();
  if (!s || (s.status !== 'live' && !(await runs(env, s, me)))) throw new HttpError(404, 'no_such_site', `${siteAddress(key)} doesn't exist.`);
  return s;
}

/** Its owner, an editor (or club member, see isEditor) or an admin. */
export async function runs(env: Env, s: Pick<Site, 'name' | 'owner_id'>, me: User): Promise<boolean> {
  if (s.owner_id === me.id || me.is_admin) return true;
  return isEditor(env, s.name, me.id);
}

function checkName(raw: string, what: string): string {
  if (!NAME_RE.test(raw)) throw new HttpError(400, 'bad_name', `${/^[aeiou]/.test(what) ? 'An' : 'A'} ${what} name is 1–40 letters, numbers, - or _.`);
  return raw.toLowerCase();
}

const limited = async (env: Env, key: string) => {
  if (!(await env.MESSAGE_LIMIT.limit({ key })).success) throw new HttpError(429, 'slow_down', 'Slow down a little, then try again.');
};

// --- Comments ---

const pagePath = (raw: unknown) => {
  const p = str(raw).split(/[?#]/)[0] || '/';
  return (p.startsWith('/') ? p : `/${p}`).slice(0, 200);
};

export async function comments(req: Request, env: Env, key: string): Promise<Response> {
  const me = await requireUser(req, env);
  const s = await site(env, key, me);
  const url = new URL(req.url);
  const path = pagePath(url.searchParams.get('path'));
  const before = Number(url.searchParams.get('before')) || Number.MAX_SAFE_INTEGER;
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.user_id, c.body, c.created_at, u.username AS author FROM page_comments c JOIN users u ON u.id = c.user_id
     WHERE c.site = ? AND c.path = ? AND c.id < ? ORDER BY c.id DESC LIMIT 31`,
  )
    .bind(s.name, path, before)
    .all<{ id: number; user_id: number; body: string; created_at: number; author: string }>();
  const blocked = await blockedIds(env, me.id);
  const canModerate = await runs(env, s, me);
  const total = await env.DB.prepare('SELECT COUNT(*) AS n FROM page_comments WHERE site = ? AND path = ?').bind(s.name, path).first<{ n: number }>();
  return json({
    comments: results
      .slice(0, 30)
      .filter((c) => !blocked.has(c.user_id))
      .map((c) => ({ id: c.id, author: c.author, body: c.body, at: c.created_at, canDelete: c.user_id === me.id || canModerate })),
    more: results.length > 30,
    total: total?.n ?? 0,
  });
}

export async function comment(req: Request, env: Env, key: string): Promise<Response> {
  const me = await requireUser(req, env);
  const s = await site(env, key, me);
  await limited(env, `comment:${me.id}`);
  const input = await readJson(req);
  const body = str(input.body).trim();
  const path = pagePath(input.path);
  if (!body) throw new HttpError(400, 'empty', 'Write something first.');
  if (body.length > MAX_COMMENT) throw new HttpError(400, 'too_long', `Keep it under ${MAX_COMMENT} characters.`);
  if (s.owner_id && (await blockedBetween(env, s.owner_id, me.id))) throw new HttpError(403, 'blocked', 'You can’t comment here.');
  const row = await env.DB.prepare('INSERT INTO page_comments (site, path, user_id, body) VALUES (?, ?, ?, ?) RETURNING id, created_at')
    .bind(s.name, path, me.id, body)
    .first<{ id: number; created_at: number }>();
  if (s.owner_id && s.owner_id !== me.id) await addNotification(env, s.owner_id, 'comment', { site: s.name, path, author: me.username, body: body.slice(0, 140) });
  return json({ comment: { id: row!.id, author: me.username, body, at: row!.created_at, canDelete: true } }, 201);
}

export async function uncomment(req: Request, env: Env, id: string): Promise<Response> {
  const me = await requireUser(req, env);
  const c = await env.DB.prepare('SELECT c.user_id, n.name, n.owner_id FROM page_comments c JOIN names n ON n.name = c.site WHERE c.id = ?')
    .bind(Number(id))
    .first<{ user_id: number; name: string; owner_id: number | null }>();
  if (!c) throw new HttpError(404, 'gone', 'That comment is gone.');
  if (c.user_id !== me.id && !(await runs(env, { name: c.name, owner_id: c.owner_id }, me))) throw new HttpError(403, 'not_yours', 'Only its writer and the site’s owner can take that down.');
  await env.DB.prepare('DELETE FROM page_comments WHERE id = ?').bind(Number(id)).run();
  return json({});
}

// --- Polls ---

async function pollResults(env: Env, s: string, poll: string, me: User) {
  const { results } = await env.DB.prepare('SELECT choice, COUNT(*) AS n FROM poll_votes WHERE site = ? AND poll = ? GROUP BY choice').bind(s, poll).all<{ choice: number; n: number }>();
  const mine = await env.DB.prepare('SELECT choice FROM poll_votes WHERE site = ? AND poll = ? AND user_id = ?').bind(s, poll, me.id).first<{ choice: number }>();
  return { counts: Object.fromEntries(results.map((r) => [r.choice, r.n])), mine: mine?.choice ?? null };
}

export async function poll(req: Request, env: Env, key: string, raw: string): Promise<Response> {
  const me = await requireUser(req, env);
  const s = await site(env, key, me);
  return json(await pollResults(env, s.name, checkName(raw, 'poll'), me));
}

export async function vote(req: Request, env: Env, key: string, raw: string): Promise<Response> {
  const me = await requireUser(req, env);
  const s = await site(env, key, me);
  const name = checkName(raw, 'poll');
  const input = await readJson(req);
  const options = Math.min(12, Math.max(2, Math.floor(Number(input.options)) || 0));
  const choice = Math.floor(Number(input.choice));
  if (!Number.isInteger(choice) || choice < 0 || choice >= options) throw new HttpError(400, 'bad_choice', 'Pick one of the answers.');
  await env.DB.prepare(
    `INSERT INTO poll_votes (site, poll, user_id, choice) VALUES (?, ?, ?, ?)
     ON CONFLICT(site, poll, user_id) DO UPDATE SET choice = excluded.choice`,
  )
    .bind(s.name, name, me.id, choice)
    .run();
  return json(await pollResults(env, s.name, name, me));
}

// --- Likes ---

async function likeState(env: Env, s: string, me: User) {
  const [count, mine] = await env.DB.batch([
    env.DB.prepare('SELECT COUNT(*) AS n FROM site_likes WHERE site = ?').bind(s),
    env.DB.prepare('SELECT 1 AS yes FROM site_likes WHERE site = ? AND user_id = ?').bind(s, me.id),
  ]);
  return { count: (count.results[0] as { n: number }).n, liked: mine.results.length > 0 };
}

export async function likes(req: Request, env: Env, key: string): Promise<Response> {
  const me = await requireUser(req, env);
  const s = await site(env, key, me);
  if (req.method === 'POST') await env.DB.prepare('INSERT OR IGNORE INTO site_likes (site, user_id) VALUES (?, ?)').bind(s.name, me.id).run();
  else if (req.method === 'DELETE') await env.DB.prepare('DELETE FROM site_likes WHERE site = ? AND user_id = ?').bind(s.name, me.id).run();
  return json(await likeState(env, s.name, me));
}

// --- Leaderboards and achievements ---

export async function scores(req: Request, env: Env, key: string, raw: string): Promise<Response> {
  const me = await requireUser(req, env);
  const s = await site(env, key, me);
  const board = checkName(raw, 'leaderboard');
  const url = new URL(req.url);
  const low = url.searchParams.get('order') === 'asc';
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 10));
  const { results } = await env.DB.prepare(
    `SELECT u.username, s.score, s.created_at FROM scores s JOIN users u ON u.id = s.user_id
     WHERE s.site = ? AND s.board = ? ORDER BY s.score ${low ? 'ASC' : 'DESC'}, s.created_at ASC LIMIT ?`,
  )
    .bind(s.name, board, limit)
    .all<{ username: string; score: number; created_at: number }>();
  const mine = await env.DB.prepare('SELECT score FROM scores WHERE site = ? AND board = ? AND user_id = ?').bind(s.name, board, me.id).first<{ score: number }>();
  let rank = null;
  if (mine) {
    const better = await env.DB.prepare(`SELECT COUNT(*) AS n FROM scores WHERE site = ? AND board = ? AND score ${low ? '<' : '>'} ?`)
      .bind(s.name, board, mine.score)
      .first<{ n: number }>();
    rank = (better?.n ?? 0) + 1;
  }
  return json({ top: results.map((r) => ({ username: r.username, score: r.score, at: r.created_at })), mine: mine?.score ?? null, rank });
}

export async function submitScore(req: Request, env: Env, key: string, raw: string): Promise<Response> {
  const me = await requireUser(req, env);
  const s = await site(env, key, me);
  const board = checkName(raw, 'leaderboard');
  await limited(env, `score:${me.id}`);
  const input = await readJson(req);
  const score = Number(input.score);
  if (!Number.isFinite(score) || Math.abs(score) > 1e15) throw new HttpError(400, 'bad_score', 'A score is a number.');
  const low = input.order === 'asc';
  // Keep each person's best.
  await env.DB.prepare(
    `INSERT INTO scores (site, board, user_id, score, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(site, board, user_id) DO UPDATE SET score = excluded.score, created_at = excluded.created_at
     WHERE excluded.score ${low ? '<' : '>'} scores.score`,
  )
    .bind(s.name, board, me.id, score, Math.floor(Date.now() / 1000))
    .run();
  return scores(new Request(`${new URL(req.url).origin}/x?order=${low ? 'asc' : 'desc'}`, { headers: req.headers }), env, key, raw);
}

export async function achieve(req: Request, env: Env, key: string): Promise<Response> {
  const me = await requireUser(req, env);
  const s = await site(env, key, me);
  await limited(env, `achieve:${me.id}`);
  const input = await readJson(req);
  const id = checkName(str(input.key), 'achievement');
  const title = str(input.title).replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!title) throw new HttpError(400, 'no_title', 'Give the achievement a title.');
  const description = str(input.description).replace(/\s+/g, ' ').trim().slice(0, 200) || null;
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM achievements WHERE site = ? AND user_id = ?').bind(s.name, me.id).first<{ n: number }>();
  if ((count?.n ?? 0) >= 100) throw new HttpError(400, 'too_many', 'That’s the most achievements one site can give.');
  const row = await env.DB.prepare('INSERT OR IGNORE INTO achievements (site, user_id, key, title, description, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING key')
    .bind(s.name, me.id, id, title, description, Math.floor(Date.now() / 1000))
    .first();
  return json({ new: !!row, title });
}

// --- Contact form ---

/** A message to whoever made the site: in your chat with them if you're friends, otherwise their notifications. */
export async function contact(req: Request, env: Env, key: string): Promise<Response> {
  const me = await requireUser(req, env);
  const s = await site(env, key, me);
  if (!s.owner_id) throw new HttpError(400, 'no_owner', 'Nobody looks after this site.');
  if (s.owner_id === me.id) throw new HttpError(400, 'self', 'This is your own site.');
  await limited(env, `contact:${me.id}`);
  const body = str((await readJson(req)).body).trim();
  if (!body) throw new HttpError(400, 'empty', 'Write something first.');
  if (body.length > MAX_CONTACT) throw new HttpError(400, 'too_long', `Keep it under ${MAX_CONTACT} characters.`);
  if (await blockedBetween(env, s.owner_id, me.id)) throw new HttpError(403, 'blocked', 'You can’t message this site’s owner.');
  if (await areFriends(env, me.id, s.owner_id)) {
    const chatId = await directChat(env, me.id, s.owner_id);
    await postMessage(env, chatId, me, `📨 ${siteAddress(s.name)}: ${body}`);
    return json({ sent: 'chat' });
  }
  await addNotification(env, s.owner_id, 'contact', { site: s.name, from: me.username, body: body.slice(0, 500) });
  return json({ sent: 'notification' });
}

// --- The drawing wall ---

export async function wall(req: Request, env: Env, key: string, raw: string): Promise<Response> {
  const me = await requireUser(req, env);
  const s = await site(env, key, me);
  const name = checkName(raw, 'wall');
  if (req.method === 'DELETE') {
    if (!(await runs(env, s, me))) throw new HttpError(403, 'not_yours', 'Only the site’s owner can clear the wall.');
    await env.DB.prepare('DELETE FROM wall_strokes WHERE site = ? AND wall = ?').bind(s.name, name).run();
    await roomFor(env, s.name, `wall:${name}`).broadcast({ type: 'message', from: me.username, data: { wall: 'clear' } });
    return json({});
  }
  if (req.method === 'POST') {
    await limited(env, `wall:${me.id}`);
    const input = await readJson(req);
    const color = /^#[0-9a-f]{6}$/i.test(str(input.color)) ? str(input.color) : '#222222';
    const width = Math.min(40, Math.max(1, Number(input.width) || 4));
    const points = Array.isArray(input.points) ? input.points.slice(0, MAX_POINTS) : [];
    const clean = points
      .filter((p): p is [number, number] => Array.isArray(p) && p.length === 2 && p.every((n) => Number.isFinite(n)))
      .map(([x, y]) => [Math.round(Math.min(1000, Math.max(0, x)) * 10) / 10, Math.round(Math.min(1000, Math.max(0, y)) * 10) / 10]);
    if (!clean.length) throw new HttpError(400, 'empty', 'Draw something first.');
    const row = await env.DB.prepare('INSERT INTO wall_strokes (site, wall, user_id, color, width, points) VALUES (?, ?, ?, ?, ?, ?) RETURNING id')
      .bind(s.name, name, me.id, color, width, JSON.stringify(clean))
      .first<{ id: number }>();
    // Keep walls from growing forever: the oldest strokes go.
    if (row!.id % 50 === 0) {
      await env.DB.prepare(
        'DELETE FROM wall_strokes WHERE site = ?1 AND wall = ?2 AND id <= (SELECT id FROM wall_strokes WHERE site = ?1 AND wall = ?2 ORDER BY id DESC LIMIT 1 OFFSET ?3)',
      )
        .bind(s.name, name, MAX_STROKES)
        .run();
    }
    const stroke = { id: row!.id, color, width, points: clean, by: me.username };
    await roomFor(env, s.name, `wall:${name}`).broadcast({ type: 'message', from: me.username, data: { wall: 'stroke', stroke } });
    return json({ stroke }, 201);
  }
  const { results } = await env.DB.prepare(
    'SELECT w.id, w.color, w.width, w.points, u.username AS by FROM wall_strokes w LEFT JOIN users u ON u.id = w.user_id WHERE w.site = ? AND w.wall = ? ORDER BY w.id LIMIT ?',
  )
    .bind(s.name, name, MAX_STROKES)
    .all<{ id: number; color: string; width: number; points: string; by: string | null }>();
  return json({ strokes: results.map((r) => ({ ...r, points: JSON.parse(r.points) })), canClear: await runs(env, s, me) });
}

// --- Stats ---

/** Called with each visit (visitors.ts): which page, and which site sent them. */
export async function countView(env: Env, key: string, path: string, from: string | null) {
  const day = today();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO page_views (site, path, day, views) VALUES (?, ?, ?, 1) ON CONFLICT(site, path, day) DO UPDATE SET views = views + 1').bind(
      key,
      pagePath(path),
      day,
    ),
    ...(from && from !== key
      ? [
          env.DB.prepare(
            'INSERT INTO site_referrals (site, from_site, day, visits) VALUES (?, ?, ?, 1) ON CONFLICT(site, from_site, day) DO UPDATE SET visits = visits + 1',
          ).bind(key, from, day),
        ]
      : []),
  ]);
}

export async function stats(req: Request, env: Env, key: string): Promise<Response> {
  const me = await requireUser(req, env);
  const s = await site(env, key, me);
  if (!(await runs(env, s, me))) throw new HttpError(403, 'not_yours', 'Only the people who run a site see its stats.');
  const since = today() - 30;
  const [days, pages, from, totals] = await env.DB.batch([
    env.DB.prepare('SELECT day, COUNT(*) AS visits FROM site_visits WHERE site = ? AND day > ? GROUP BY day ORDER BY day').bind(s.name, since),
    env.DB.prepare('SELECT path, SUM(views) AS views FROM page_views WHERE site = ? AND day > ? GROUP BY path ORDER BY views DESC LIMIT 20').bind(s.name, since),
    env.DB.prepare('SELECT from_site AS site, SUM(visits) AS visits FROM site_referrals WHERE site = ? AND day > ? GROUP BY from_site ORDER BY visits DESC LIMIT 20').bind(s.name, since),
    env.DB.prepare(
      `SELECT (SELECT COUNT(*) FROM site_visits WHERE site = ?1) AS visits, (SELECT COUNT(DISTINCT user_id) FROM site_visits WHERE site = ?1) AS visitors,
         (SELECT COUNT(*) FROM site_likes WHERE site = ?1) AS likes, (SELECT COUNT(*) FROM guestbook WHERE site = ?1) AS notes,
         (SELECT COUNT(*) FROM page_comments WHERE site = ?1) AS comments`,
    ).bind(s.name),
  ]);
  return json({ today: today(), days: days.results, pages: pages.results, from: from.results, totals: totals.results[0] });
}

export async function online(req: Request, env: Env): Promise<Response> {
  await requireUser(req, env);
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM users WHERE online = 1').first<{ n: number }>();
  return json({ online: row?.n ?? 0 });
}
