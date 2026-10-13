// The activity feed (biggle://feed): what your friends have been up to (new sites, site updates,
// guestbook notes, clubs, events, threads on the board and collections), and what's happened on
// sites you follow. Other modules call record() when something happens; only things everyone may
// see go in (no invite-only events, no unlisted collections).
//
//   GET /api/feed?before=<id>   newest first, a page at a time
import { requireUser } from './auth';
import { json } from './http';
import { blockedIds } from './people';

const PAGE = 30;
const HOUR = 3600_000;

export type ActivityKind =
  | 'site-new'
  | 'site-updated'
  | 'guestbook'
  | 'club-new'
  | 'club-joined'
  | 'event-new'
  | 'thread-new'
  | 'collection-new'
  | 'joined';

/** Something `userId` did, for their friends' feeds. */
export async function record(env: Env, userId: number, kind: ActivityKind, data: Record<string, unknown> = {}, site: string | null = null) {
  const now = Date.now();
  // A site updated again within the hour moves up instead of showing twice.
  if (kind === 'site-updated' && site) {
    const last = await env.DB.prepare("SELECT id, created_at FROM activity WHERE user_id = ? AND kind = 'site-updated' AND site = ? ORDER BY id DESC LIMIT 1")
      .bind(userId, site)
      .first<{ id: number; created_at: number }>();
    if (last && now - last.created_at < HOUR) await env.DB.prepare('DELETE FROM activity WHERE id = ?').bind(last.id).run();
  }
  await env.DB.prepare('INSERT INTO activity (user_id, kind, site, data, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(userId, kind, site, JSON.stringify(data), now)
    .run();
}

type Row = { id: number; kind: string; site: string | null; data: string; created_at: number; user_id: number; username: string; avatar_v: number | null; site_title: string | null; site_status: string | null };

export async function feed(req: Request, env: Env): Promise<Response> {
  const me = await requireUser(req, env);
  const before = Number(new URL(req.url).searchParams.get('before')) || Number.MAX_SAFE_INTEGER;
  const { results } = await env.DB.prepare(
    `SELECT a.id, a.kind, a.site, a.data, a.created_at, a.user_id, u.username, u.avatar_v, n.title AS site_title, n.status AS site_status
     FROM activity a JOIN users u ON u.id = a.user_id LEFT JOIN names n ON n.name = a.site
     WHERE a.id < ?2 AND (a.user_id = ?1 OR a.user_id IN (SELECT friend_id FROM friendships WHERE user_id = ?1 AND status = 'friends')
       OR (a.site IS NOT NULL AND a.site IN (SELECT site FROM follows WHERE user_id = ?1)))
     ORDER BY a.id DESC LIMIT ?3`,
  )
    .bind(me.id, before, PAGE + 1)
    .all<Row>();
  const blocked = await blockedIds(env, me.id);
  const items = results
    .slice(0, PAGE)
    // Gone: sites since deleted (or taken down), and people you've blocked.
    .filter((r) => !blocked.has(r.user_id) && (!r.site || r.site_status === 'live'))
    .map((r) => ({
      id: r.id,
      kind: r.kind,
      user: r.username,
      avatar: r.avatar_v,
      site: r.site,
      siteTitle: r.site_title,
      data: JSON.parse(r.data),
      at: r.created_at,
    }));
  return json({ items, more: results.length > PAGE, next: results.length > PAGE ? results[PAGE - 1].id : null });
}
