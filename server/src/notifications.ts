// The notification centre (the bell in the browser): someone signed your guestbook, your site was
// approved, a friend accepted your request… Each is kept for a while and arrives live.
//
//   GET  /api/notifications?before=   newest first, a page at a time, and how many are unread
//   POST /api/notifications/read { ids? }   mark some read, or all of them
import { requireUser } from './auth';
import { json, readJson } from './http';
import { notify } from './live';

const PAGE = 30;
/** Each person keeps this many; older ones go. */
const KEEP = 300;

export type NotificationKind =
  | 'guestbook'
  | 'site-approved'
  | 'site-rejected'
  | 'friend-request'
  | 'friend-accepted'
  /** Someone signed up through your invite link (invites.ts). */
  | 'invite-joined'
  | 'comment'
  | 'contact'
  | 'site-updated'
  | 'event-invite'
  | 'event-soon'
  | 'club-invite'
  | 'forum-reply'
  | 'achievement'
  | 'co-owner'
  | 'report'
  | 'announcement';

type Row = { id: number; kind: string; data: string; read: number; created_at: number };

const shown = (r: Row) => ({ id: r.id, kind: r.kind, data: JSON.parse(r.data), read: !!r.read, at: r.created_at });

/** Tell someone about something, in their notification centre. */
export async function addNotification(env: Env, userId: number, kind: NotificationKind, data: Record<string, unknown>) {
  const at = Date.now();
  const row = await env.DB.prepare('INSERT INTO notifications (user_id, kind, data, created_at) VALUES (?, ?, ?, ?) RETURNING id')
    .bind(userId, kind, JSON.stringify(data), at)
    .first<{ id: number }>();
  await notify(env, userId, { type: 'notification', notification: { id: row!.id, kind, data, read: false, at } });
  // Now and then, let the oldest go.
  if (row!.id % 20 === 0) {
    await env.DB.prepare(
      `DELETE FROM notifications WHERE user_id = ?1 AND id <= (
         SELECT id FROM notifications WHERE user_id = ?1 ORDER BY id DESC LIMIT 1 OFFSET ?2)`,
    )
      .bind(userId, KEEP)
      .run();
  }
}

export async function list(req: Request, env: Env): Promise<Response> {
  const me = await requireUser(req, env);
  const before = Number(new URL(req.url).searchParams.get('before')) || Number.MAX_SAFE_INTEGER;
  const [rows, unread] = await env.DB.batch([
    env.DB.prepare('SELECT id, kind, data, read, created_at FROM notifications WHERE user_id = ? AND id < ? ORDER BY id DESC LIMIT ?').bind(
      me.id,
      before,
      PAGE + 1,
    ),
    env.DB.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0').bind(me.id),
  ]);
  const results = rows.results as Row[];
  return json({
    notifications: results.slice(0, PAGE).map(shown),
    more: results.length > PAGE,
    unread: (unread.results[0] as { n: number }).n,
  });
}

export async function markRead(req: Request, env: Env): Promise<Response> {
  const me = await requireUser(req, env);
  const body = await readJson(req);
  const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(Number.isInteger).slice(0, 100) : null;
  if (ids) {
    if (ids.length) {
      await env.DB.prepare(`UPDATE notifications SET read = 1 WHERE user_id = ? AND id IN (${ids.map(() => '?').join(',')})`)
        .bind(me.id, ...ids)
        .run();
    }
  } else {
    await env.DB.prepare('UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0').bind(me.id).run();
  }
  await notify(env, me.id, { type: 'notifications-read', ids });
  return json({});
}
