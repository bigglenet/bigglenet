// Your Biggle ID's own things: syncing bookmarks and settings between your devices, downloading
// everything you've made, and deleting your account.
//
//   GET    /api/sync             everything synced, per key with when it changed
//   PUT    /api/sync/:key        { data, updatedAt }: newest wins; other devices hear about it
//   GET    /api/me/export        everything about you, as JSON
//   DELETE /api/me               { confirm, password }: your account, sites and messages, gone
import { requireUser, verifyPassword } from './auth';
import { deleteFiles } from './files';
import { forget } from './gateway';
import { HttpError, json, readJson, str } from './http';
import { notify } from './live';

const SYNC_KEYS = ['bookmarks', 'start', 'settings', 'sites'] as const;
const MAX_SYNC = 256 * 1024;

export async function getSync(req: Request, env: Env): Promise<Response> {
  const me = await requireUser(req, env);
  const { results } = await env.DB.prepare('SELECT key, data, updated_at FROM user_sync WHERE user_id = ?').bind(me.id).all<{ key: string; data: string; updated_at: number }>();
  return json({ items: Object.fromEntries(results.map((r) => [r.key, { data: JSON.parse(r.data), updatedAt: r.updated_at }])) });
}

export async function putSync(req: Request, env: Env, key: string): Promise<Response> {
  const me = await requireUser(req, env);
  if (!(SYNC_KEYS as readonly string[]).includes(key)) throw new HttpError(400, 'bad_key', 'That can’t be synced.');
  const input = await readJson(req);
  const data = JSON.stringify(input.data ?? null);
  if (data.length > MAX_SYNC) throw new HttpError(413, 'too_large', 'That’s too much to sync.');
  const updatedAt = Math.min(Date.now(), Math.floor(Number(input.updatedAt)) || Date.now());
  // Newest wins: an older change (a device that was offline) doesn't overwrite a newer one.
  const row = await env.DB.prepare(
    `INSERT INTO user_sync (user_id, key, data, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
     WHERE excluded.updated_at > user_sync.updated_at RETURNING updated_at`,
  )
    .bind(me.id, key, data, updatedAt)
    .first();
  if (row) await notify(env, me.id, { type: 'sync', key });
  return json({ saved: !!row });
}

// --- Download your data ---

const TEXT_RE = /\.(bhtml|html?|css|js|json|txt|md|svg)$/i;

export async function exportData(req: Request, env: Env): Promise<Response> {
  const me = await requireUser(req, env);
  const [user, friends, blocks, sites, files, messages, notes, comments, posts, collections, clubs, events, achievements, sync] = await env.DB.batch([
    env.DB.prepare('SELECT username, email, bio, created_at, status_text, status_emoji FROM users WHERE id = ?').bind(me.id),
    env.DB.prepare("SELECT u.username, f.nickname, f.status FROM friendships f JOIN users u ON u.id = f.friend_id WHERE f.user_id = ?").bind(me.id),
    env.DB.prepare('SELECT u.username FROM blocks b JOIN users u ON u.id = b.blocked_id WHERE b.user_id = ?').bind(me.id),
    env.DB.prepare('SELECT name, tld, title, status, created_at, updated_at FROM names WHERE owner_id = ?').bind(me.id),
    env.DB.prepare('SELECT f.site, f.path, f.type, f.size, f.content FROM site_files f JOIN names n ON n.name = f.site WHERE n.owner_id = ?').bind(me.id),
    env.DB.prepare('SELECT chat_id, body, created_at, attachment FROM chat_messages WHERE sender_id = ? AND deleted = 0 ORDER BY id').bind(me.id),
    env.DB.prepare('SELECT site, body, created_at FROM guestbook WHERE user_id = ? ORDER BY id').bind(me.id),
    env.DB.prepare('SELECT site, path, body, created_at FROM page_comments WHERE user_id = ? ORDER BY id').bind(me.id),
    env.DB.prepare('SELECT p.thread_id, t.title, p.body, p.created_at FROM board_posts p JOIN board_threads t ON t.id = p.thread_id WHERE p.user_id = ? AND p.deleted = 0 ORDER BY p.id').bind(me.id),
    env.DB.prepare(
      `SELECT c.id, c.title, c.description, c.listed, (SELECT json_group_array(s.site) FROM collection_sites s WHERE s.collection_id = c.id) AS sites
       FROM collections c WHERE c.user_id = ?`,
    ).bind(me.id),
    env.DB.prepare('SELECT c.name FROM clubs c JOIN club_members m ON m.club_id = c.id WHERE m.user_id = ?').bind(me.id),
    env.DB.prepare('SELECT title, description, place, starts_at, ends_at FROM events WHERE user_id = ?').bind(me.id),
    env.DB.prepare('SELECT site, title, description, created_at FROM achievements WHERE user_id = ?').bind(me.id),
    env.DB.prepare('SELECT key, data FROM user_sync WHERE user_id = ?').bind(me.id),
  ]);
  const decoder = new TextDecoder();
  type File = { site: string; path: string; type: string; size: number; content: ArrayBuffer | number[] };
  const filesBySite = new Map<string, unknown[]>();
  for (const f of files.results as File[]) {
    // Text files as they are; pictures and other files are listed (they're on the site itself).
    const text = TEXT_RE.test(f.path) ? decoder.decode(f.content instanceof ArrayBuffer ? new Uint8Array(f.content) : Uint8Array.from(f.content)) : undefined;
    filesBySite.set(f.site, [...(filesBySite.get(f.site) ?? []), { path: f.path, type: f.type, size: f.size, ...(text !== undefined ? { text } : {}) }]);
  }
  const data = {
    exportedAt: new Date().toISOString(),
    account: user.results[0],
    friends: friends.results,
    blocked: blocks.results,
    sites: (sites.results as { name: string }[]).map((s) => ({ ...s, files: filesBySite.get(s.name) ?? [] })),
    messagesYouSent: messages.results,
    guestbookNotes: notes.results,
    comments: comments.results,
    boardPosts: posts.results,
    collections: (collections.results as { sites: string }[]).map((c) => ({ ...c, sites: JSON.parse(c.sites) })),
    clubs: clubs.results,
    events: events.results,
    achievements: achievements.results,
    synced: Object.fromEntries((sync.results as { key: string; data: string }[]).map((s) => [s.key, JSON.parse(s.data)])),
  };
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="bigglenet-${me.username}.json"`,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'Content-Disposition',
    },
  });
}

// --- Delete your account ---

export async function deleteAccount(req: Request, env: Env): Promise<Response> {
  const me = await requireUser(req, env);
  const input = await readJson(req);
  if (str(input.confirm).trim().toLowerCase() !== me.username) throw new HttpError(400, 'confirm', 'Type your username to confirm.');
  const row = await env.DB.prepare('SELECT password_hash, password_salt FROM users WHERE id = ?').bind(me.id).first<{ password_hash: string; password_salt: string }>();
  // Accounts with a password need it too (Google ones don't have one).
  if (row?.password_hash && !(await verifyPassword(str(input.password), row.password_hash, row.password_salt))) {
    throw new HttpError(403, 'wrong_password', 'That password isn’t right.');
  }
  const [sites, attachments] = await env.DB.batch([
    env.DB.prepare('SELECT name FROM names WHERE owner_id = ?').bind(me.id),
    env.DB.prepare('SELECT attachment FROM chat_messages WHERE sender_id = ? AND attachment IS NOT NULL').bind(me.id),
  ]);
  // Files in storage: your picture, and what you sent in chats.
  const keys = [`avatars/${me.id}`, ...(attachments.results as { attachment: string }[]).map((a) => (JSON.parse(a.attachment) as { key: string }).key)];
  await deleteFiles(env, keys).catch(() => {});
  await env.DB.batch([
    // Messages you sent are wiped (they stay as "deleted" so chats still make sense).
    env.DB.prepare("UPDATE chat_messages SET deleted = 1, body = '', attachment = NULL, unlock_at = NULL WHERE sender_id = ?").bind(me.id),
    env.DB.prepare('DELETE FROM names WHERE owner_id = ?').bind(me.id),
    // Everything else that's yours goes with you (ON DELETE CASCADE), or stays without your name.
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(me.id),
  ]);
  for (const s of sites.results as { name: string }[]) forget(s.name);
  return json({});
}
