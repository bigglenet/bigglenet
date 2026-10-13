// Keeping the Bigglenet nice, and knowing how it's doing: reports, announcements, the admin
// dashboard and the status page.
//
//   POST   /api/reports                    { kind, target, reason }: flag something for admins
//   GET    /api/admin/reports?status=open  the queue
//   POST   /api/admin/reports/:id          { action: 'dismiss' | 'remove' }
//   GET    /api/announcement               the banner everyone sees, if there is one (no sign-in)
//   POST   /api/admin/announcements        { text, level, hours }
//   DELETE /api/admin/announcements        take it down
//   GET    /api/admin/dashboard            sign-ups, active people, busiest sites
//   GET    /api/status                     up or not, which version, how fast (no sign-in)
import pkg from '../../package.json';
import { requireAdmin, requireUser } from './auth';
import { HttpError, json, readJson, siteAddress, str } from './http';
import { forget } from './gateway';
import { addNotification } from './notifications';
import { today } from './visitors';

const KINDS = ['site', 'message', 'post', 'comment', 'note', 'user'] as const;
type Kind = (typeof KINDS)[number];
const MAX_REASON = 500;
const MAX_ADMINS_TOLD = 5;

/** What's being reported, in a line, and whether you may see it (you can only report what you can see). */
async function describe(env: Env, kind: Kind, target: string, me: number): Promise<string> {
  const id = Number(target);
  const row = async <T>(sql: string, ...args: unknown[]) => env.DB.prepare(sql).bind(...args).first<T>();
  const missing = () => new HttpError(404, 'not_found', 'That isn’t there any more.');
  if (kind === 'site') {
    const s = await row<{ name: string; title: string | null; status: string }>('SELECT name, title, status FROM names WHERE name = ?', target.toLowerCase());
    if (!s || s.status !== 'live') throw missing();
    return `${siteAddress(s.name)}${s.title ? ` (${s.title})` : ''}`;
  }
  if (kind === 'message') {
    const m = await row<{ body: string; sender: string | null }>(
      `SELECT m.body, u.username AS sender FROM chat_messages m LEFT JOIN users u ON u.id = m.sender_id
       JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = ? WHERE m.id = ? AND m.deleted = 0`,
      me,
      id,
    );
    if (!m) throw missing();
    return `${m.sender ?? 'someone'} in a chat: “${m.body.slice(0, 200)}”`;
  }
  if (kind === 'post') {
    const p = await row<{ body: string; author: string | null; title: string }>(
      'SELECT p.body, u.username AS author, t.title FROM board_posts p LEFT JOIN users u ON u.id = p.user_id JOIN board_threads t ON t.id = p.thread_id WHERE p.id = ? AND p.deleted = 0',
      id,
    );
    if (!p) throw missing();
    return `${p.author ?? 'someone'} on the board (“${p.title}”): “${p.body.slice(0, 200)}”`;
  }
  if (kind === 'comment') {
    const c = await row<{ body: string; author: string; site: string; path: string }>(
      'SELECT c.body, u.username AS author, c.site, c.path FROM page_comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?',
      id,
    );
    if (!c) throw missing();
    return `${c.author} on ${siteAddress(c.site)}${c.path}: “${c.body.slice(0, 200)}”`;
  }
  if (kind === 'note') {
    const g = await row<{ body: string; author: string; site: string }>('SELECT g.body, u.username AS author, g.site FROM guestbook g JOIN users u ON u.id = g.user_id WHERE g.id = ?', id);
    if (!g) throw missing();
    return `${g.author} in ${siteAddress(g.site)}’s guestbook: “${g.body.slice(0, 200)}”`;
  }
  const u = await row<{ username: string; bio: string | null }>('SELECT username, bio FROM users WHERE username = ?', target.toLowerCase());
  if (!u) throw missing();
  return `@${u.username}${u.bio ? `: “${u.bio.slice(0, 200)}”` : ''}`;
}

export async function report(req: Request, env: Env): Promise<Response> {
  const me = await requireUser(req, env);
  if (!(await env.MESSAGE_LIMIT.limit({ key: `report:${me.id}` })).success) throw new HttpError(429, 'slow_down', 'Slow down a little, then try again.');
  const input = await readJson(req);
  const kind = str(input.kind) as Kind;
  if (!KINDS.includes(kind)) throw new HttpError(400, 'bad_kind', 'You can report a site, a message, a post, a comment, a note or a person.');
  const target = str(input.target).trim().slice(0, 100);
  const summary = await describe(env, kind, target, me.id);
  const already = await env.DB.prepare("SELECT 1 FROM reports WHERE user_id = ? AND kind = ? AND target = ? AND status = 'open'").bind(me.id, kind, target).first();
  if (already) return json({ already: true });
  await env.DB.prepare('INSERT INTO reports (user_id, kind, target, summary, reason) VALUES (?, ?, ?, ?, ?)')
    .bind(me.id, kind, target, summary, str(input.reason).trim().slice(0, MAX_REASON) || null)
    .run();
  const { results: admins } = await env.DB.prepare('SELECT id FROM users WHERE is_admin = 1 LIMIT ?').bind(MAX_ADMINS_TOLD).all<{ id: number }>();
  for (const a of admins) await addNotification(env, a.id, 'report', { summary: summary.slice(0, 140) });
  return json({}, 201);
}

export async function reports(req: Request, env: Env): Promise<Response> {
  await requireAdmin(req, env);
  const status = new URL(req.url).searchParams.get('status') === 'handled' ? 'handled' : 'open';
  const { results } = await env.DB.prepare(
    `SELECT r.*, u.username AS reporter, h.username AS handler FROM reports r
     LEFT JOIN users u ON u.id = r.user_id LEFT JOIN users h ON h.id = r.handled_by
     WHERE ${status === 'open' ? "r.status = 'open'" : "r.status != 'open'"} ORDER BY r.id DESC LIMIT 100`,
  ).all();
  return json({ reports: results });
}

/** Dismiss a report, or take down what it's about. */
export async function handleReport(req: Request, env: Env, raw: string): Promise<Response> {
  const me = await requireAdmin(req, env);
  const r = await env.DB.prepare('SELECT * FROM reports WHERE id = ?').bind(Number(raw)).first<{ id: number; kind: Kind; target: string }>();
  if (!r) throw new HttpError(404, 'not_found', 'That report doesn’t exist.');
  const action = str((await readJson(req)).action);
  if (action !== 'dismiss' && action !== 'remove') throw new HttpError(400, 'bad_action', 'Dismiss it or take it down.');
  if (action === 'remove') {
    const id = Number(r.target);
    if (r.kind === 'site') {
      await env.DB.prepare("UPDATE names SET status = 'rejected', review_note = 'Taken down after a report.' WHERE name = ?").bind(r.target).run();
      forget(r.target);
    } else if (r.kind === 'message') {
      await env.DB.prepare("UPDATE chat_messages SET deleted = 1, body = '', attachment = NULL, unlock_at = NULL WHERE id = ?").bind(id).run();
    } else if (r.kind === 'post') {
      await env.DB.prepare("UPDATE board_posts SET deleted = 1, body = '' WHERE id = ?").bind(id).run();
    } else if (r.kind === 'comment') {
      await env.DB.prepare('DELETE FROM page_comments WHERE id = ?').bind(id).run();
    } else if (r.kind === 'note') {
      await env.DB.prepare('DELETE FROM guestbook WHERE id = ?').bind(id).run();
    } else {
      throw new HttpError(400, 'cant_remove', 'People can’t be taken down. Dismiss the report, or talk to them.');
    }
  }
  // Every open report about the same thing is handled with it.
  await env.DB.prepare("UPDATE reports SET status = ?, handled_by = ?, handled_at = unixepoch() WHERE kind = ? AND target = ? AND status = 'open'")
    .bind(action === 'remove' ? 'removed' : 'dismissed', me.id, r.kind, r.target)
    .run();
  return json({});
}

// --- Announcements ---

export async function announcement(_req: Request, env: Env): Promise<Response> {
  const a = await env.DB.prepare('SELECT id, text, level, created_at FROM announcements WHERE ends_at IS NULL OR ends_at > unixepoch() ORDER BY id DESC LIMIT 1').first<{
    id: number;
    text: string;
    level: string;
    created_at: number;
  }>();
  return json({ announcement: a ? { id: a.id, text: a.text, level: a.level, at: a.created_at } : null });
}

export async function announce(req: Request, env: Env): Promise<Response> {
  const me = await requireAdmin(req, env);
  const input = await readJson(req);
  const text = str(input.text).replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!text) throw new HttpError(400, 'empty', 'Write the announcement first.');
  const hours = Math.min(24 * 30, Math.max(0, Number(input.hours) || 0));
  await env.DB.batch([
    env.DB.prepare('UPDATE announcements SET ends_at = unixepoch() WHERE ends_at IS NULL OR ends_at > unixepoch()'),
    env.DB.prepare('INSERT INTO announcements (text, level, by_id, ends_at) VALUES (?, ?, ?, ?)').bind(
      text,
      input.level === 'warning' ? 'warning' : 'info',
      me.id,
      hours ? Math.floor(Date.now() / 1000) + hours * 3600 : null,
    ),
  ]);
  return json({}, 201);
}

export async function endAnnouncement(req: Request, env: Env): Promise<Response> {
  await requireAdmin(req, env);
  await env.DB.prepare('UPDATE announcements SET ends_at = unixepoch() WHERE ends_at IS NULL OR ends_at > unixepoch()').run();
  return json({});
}

// --- The admin dashboard ---

export async function dashboard(req: Request, env: Env): Promise<Response> {
  await requireAdmin(req, env);
  const now = Math.floor(Date.now() / 1000);
  const day = today();
  const [signups, totals, busiest] = await env.DB.batch([
    env.DB.prepare('SELECT created_at / 86400 AS day, COUNT(*) AS n FROM users WHERE created_at > ? GROUP BY day ORDER BY day').bind(now - 30 * 86400),
    env.DB.prepare(
      `SELECT (SELECT COUNT(*) FROM users) AS users,
         (SELECT COUNT(*) FROM users WHERE online = 1) AS online,
         (SELECT COUNT(DISTINCT user_id) FROM sessions WHERE last_seen > ?1 - 86400) AS today,
         (SELECT COUNT(DISTINCT user_id) FROM sessions WHERE last_seen > ?1 - 7 * 86400) AS week,
         (SELECT COUNT(*) FROM names WHERE status = 'live') AS sites,
         (SELECT COUNT(*) FROM names WHERE status = 'pending') AS pending,
         (SELECT COUNT(*) FROM chat_messages WHERE created_at > (?1 - 86400) * 1000) AS messages,
         (SELECT COUNT(*) FROM board_threads) AS threads,
         (SELECT COUNT(*) FROM clubs) AS clubs,
         (SELECT COUNT(*) FROM reports WHERE status = 'open') AS reports`,
    ).bind(now),
    env.DB.prepare(
      `SELECT n.name, n.tld, n.title, COUNT(*) AS visits FROM site_visits v JOIN names n ON n.name = v.site
       WHERE v.day > ? GROUP BY n.name ORDER BY visits DESC LIMIT 10`,
    ).bind(day - 7),
  ]);
  return json({ today: day, signups: signups.results, totals: totals.results[0], busiest: busiest.results });
}

// --- The status page ---

export async function status(_req: Request, env: Env): Promise<Response> {
  const started = Date.now();
  let db = true;
  try {
    await env.DB.prepare('SELECT 1').first();
  } catch {
    db = false;
  }
  return json({ ok: db, version: pkg.version, time: Date.now(), database: db ? Date.now() - started : null });
}
