// People: profiles (biggle://u/<name>), profile pictures, statuses, what friends are up to, and
// blocking.
//
//   GET    /api/users/:username          someone's profile
//   PATCH  /api/me/profile { bio?, status?, shareActivity? }
//   PUT    /api/me/activity { text }      what I'm up to ("Playing GTA V"), if I share it
//   PUT    /api/me/avatar  (an image)     a new profile picture; DELETE removes it
//   GET    /api/avatars/:username         someone's profile picture (404 if none)
//   GET    /api/blocks                    people I've blocked
//   POST   /api/blocks { username }       block someone; DELETE /api/blocks/:username unblocks
import { requireUser, type User } from './auth';
import { deleteFile, fileResponse, putFile } from './files';
import { HttpError, json, readJson, str } from './http';
import { notify } from './live';
import { badgesOf } from './badges';
import { stampsOf } from './stamps';

const MAX_BIO = 300;
const MAX_STATUS = 60;
const MAX_ACTIVITY = 80;
const MAX_AVATAR = 300_000;
/** What someone's up to stops showing if their app hasn't said so lately. */
const ACTIVITY_FRESH_MS = 15 * 60 * 1000;
const AVATAR_TYPES = new Set(['image/webp', 'image/jpeg', 'image/png']);

type PersonRow = {
  id: number;
  username: string;
  created_at: number;
  bio: string | null;
  avatar_v: number | null;
  status_text: string | null;
  status_emoji: string | null;
  status_until: number | null;
  share_activity: number;
  activity: string | null;
  activity_at: number | null;
};

const PERSON = `id, username, created_at, bio, avatar_v, status_text, status_emoji, status_until, share_activity, activity, activity_at`;

export async function personByName(env: Env, username: string): Promise<PersonRow> {
  const row = await env.DB.prepare(`SELECT ${PERSON} FROM users WHERE username = ?`).bind(username.trim().toLowerCase()).first<PersonRow>();
  if (!row) throw new HttpError(404, 'no_such_user', `There's nobody called ${username} on the Bigglenet.`);
  return row;
}

/** Their status, unless it's run out. */
export function statusOf(p: Pick<PersonRow, 'status_text' | 'status_emoji' | 'status_until'>) {
  if (!p.status_text && !p.status_emoji) return null;
  if (p.status_until && p.status_until < Date.now()) return null;
  return { text: p.status_text ?? '', emoji: p.status_emoji ?? '', until: p.status_until };
}

/** What they're up to, if they share it and it's recent. Only for friends. */
export function activityOf(p: Pick<PersonRow, 'share_activity' | 'activity' | 'activity_at'>) {
  if (!p.share_activity || !p.activity || !p.activity_at || Date.now() - p.activity_at > ACTIVITY_FRESH_MS) return null;
  return { text: p.activity, at: p.activity_at };
}

/** Whether either of the two has blocked the other. */
export async function blockedBetween(env: Env, a: number, b: number): Promise<boolean> {
  return !!(await env.DB.prepare('SELECT 1 FROM blocks WHERE (user_id = ?1 AND blocked_id = ?2) OR (user_id = ?2 AND blocked_id = ?1)').bind(a, b).first());
}

/** The ids of people I've blocked. */
export async function blockedIds(env: Env, me: number): Promise<Set<number>> {
  const { results } = await env.DB.prepare('SELECT blocked_id FROM blocks WHERE user_id = ?').bind(me).all<{ blocked_id: number }>();
  return new Set(results.map((r) => r.blocked_id));
}

async function friendIds(env: Env, userId: number): Promise<number[]> {
  const { results } = await env.DB.prepare("SELECT friend_id FROM friendships WHERE user_id = ? AND status = 'friends'").bind(userId).all<{ friend_id: number }>();
  return results.map((r) => r.friend_id);
}

/** Let friends know my status or activity changed. */
async function tellFriends(env: Env, me: number) {
  const p = await env.DB.prepare(`SELECT ${PERSON} FROM users WHERE id = ?`).bind(me).first<PersonRow>();
  if (!p) return;
  const event = { type: 'status' as const, username: p.username, status: statusOf(p), activity: activityOf(p) };
  await Promise.all((await friendIds(env, me)).map((id) => notify(env, id, event)));
}

// --- Profiles ---

export async function profile(req: Request, env: Env, username: string): Promise<Response> {
  const me = await requireUser(req, env);
  const p = await personByName(env, username);
  const isMe = p.id === me.id;
  // Someone who blocked you looks like they're not there.
  if (!isMe && (await env.DB.prepare('SELECT 1 FROM blocks WHERE user_id = ? AND blocked_id = ?').bind(p.id, me.id).first())) {
    throw new HttpError(404, 'no_such_user', `There's nobody called ${username} on the Bigglenet.`);
  }
  const [friendship, iBlocked, sites, friends, achievements, collections, clubs] = await env.DB.batch([
    env.DB.prepare('SELECT status FROM friendships WHERE user_id = ? AND friend_id = ?').bind(me.id, p.id),
    env.DB.prepare('SELECT 1 AS yes FROM blocks WHERE user_id = ? AND blocked_id = ?').bind(me.id, p.id),
    env.DB.prepare("SELECT name, title FROM names WHERE owner_id = ? AND status = 'live' ORDER BY created_at").bind(p.id),
    env.DB.prepare("SELECT COUNT(*) AS n FROM friendships WHERE user_id = ? AND status = 'friends'").bind(p.id),
    env.DB.prepare('SELECT site, key, title, description, created_at FROM achievements WHERE user_id = ? ORDER BY created_at DESC LIMIT 60').bind(p.id),
    env.DB.prepare(
      `SELECT c.id, c.title, (SELECT COUNT(*) FROM collection_sites s WHERE s.collection_id = c.id) AS sites
       FROM collections c WHERE c.user_id = ? AND c.listed = 1 ORDER BY c.updated_at DESC LIMIT 20`,
    ).bind(p.id),
    // Open clubs (closed ones are only for their members to know about).
    env.DB.prepare('SELECT c.id, c.name, c.emoji FROM clubs c JOIN club_members m ON m.club_id = c.id WHERE m.user_id = ? AND c.open = 1 ORDER BY c.name LIMIT 20').bind(p.id),
  ]);
  const status = (friendship.results[0] as { status?: string } | undefined)?.status ?? null;
  const { badges, fresh } = await badgesOf(env, p.id, p.created_at, isMe);
  return json({
    username: p.username,
    bio: p.bio,
    avatar: p.avatar_v,
    status: statusOf(p),
    activity: status === 'friends' || isMe ? activityOf(p) : null,
    joined: p.created_at,
    sites: (sites.results as { name: string; title: string | null }[]).map((s) => ({
      name: s.name,
      tld: s.name.endsWith('.b') ? 'b' : 'biggle',
      title: s.title,
    })),
    friends: (friends.results[0] as { n: number }).n,
    achievements: (achievements.results as { site: string; key: string; title: string; description: string | null; created_at: number }[]).map((a) => ({
      site: a.site,
      key: a.key,
      title: a.title,
      description: a.description,
      at: a.created_at,
    })),
    collections: collections.results as { id: string; title: string; sites: number }[],
    clubs: clubs.results as { id: number; name: string; emoji: string | null }[],
    badges,
    stamps: await stampsOf(env, p.id),
    friendship: status,
    blocked: iBlocked.results.length > 0,
    me: isMe,
    ...(isMe ? { shareActivity: !!p.share_activity, freshBadges: fresh } : {}),
  });
}

export async function updateProfile(req: Request, env: Env): Promise<Response> {
  const me = await requireUser(req, env);
  const body = await readJson(req);
  const sets: string[] = [];
  const values: unknown[] = [];
  if (body.bio !== undefined) {
    sets.push('bio = ?');
    values.push(str(body.bio).trim().slice(0, MAX_BIO) || null);
  }
  if (body.status !== undefined) {
    const s = body.status && typeof body.status === 'object' ? (body.status as Record<string, unknown>) : null;
    const text = s ? str(s.text).replace(/\s+/g, ' ').trim().slice(0, MAX_STATUS) : '';
    const emoji = s ? [...str(s.emoji).trim()].slice(0, 2).join('') : '';
    const until = s && Number(s.until) > Date.now() ? Math.floor(Number(s.until)) : null;
    sets.push('status_text = ?', 'status_emoji = ?', 'status_until = ?');
    values.push(text || null, emoji || null, text || emoji ? until : null);
  }
  if (body.shareActivity !== undefined) {
    sets.push('share_activity = ?');
    values.push(body.shareActivity === true ? 1 : 0);
    if (body.shareActivity !== true) sets.push('activity = NULL', 'activity_at = NULL');
  }
  if (sets.length) {
    await env.DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).bind(...values, me.id).run();
    if (body.status !== undefined || body.shareActivity !== undefined) await tellFriends(env, me.id);
  }
  return profile(req, env, me.username);
}

/** What I'm up to: the browser says, now and then, if I've turned sharing on. null: nothing. */
export async function setActivity(req: Request, env: Env): Promise<Response> {
  const me = await requireUser(req, env);
  const text = str((await readJson(req)).text).replace(/\s+/g, ' ').trim().slice(0, MAX_ACTIVITY) || null;
  const before = await env.DB.prepare('SELECT share_activity, activity FROM users WHERE id = ?').bind(me.id).first<{ share_activity: number; activity: string | null }>();
  if (!before?.share_activity) return json({ shared: false });
  await env.DB.prepare('UPDATE users SET activity = ?, activity_at = ? WHERE id = ?').bind(text, text ? Date.now() : null, me.id).run();
  if (before.activity !== text) await tellFriends(env, me.id);
  return json({ shared: true });
}

// --- Profile pictures ---

export async function setAvatar(req: Request, env: Env): Promise<Response> {
  const me = await requireUser(req, env);
  const type = (req.headers.get('Content-Type') ?? '').split(';')[0].trim();
  if (!AVATAR_TYPES.has(type)) throw new HttpError(400, 'bad_image', 'Use a PNG, JPEG or WebP picture.');
  const bytes = await req.arrayBuffer();
  if (bytes.byteLength > MAX_AVATAR) throw new HttpError(413, 'too_large', 'That picture is too big.');
  await putFile(env, `avatars/${me.id}`, bytes, type);
  const v = Date.now();
  await env.DB.prepare('UPDATE users SET avatar_v = ? WHERE id = ?').bind(v, me.id).run();
  await announceAvatar(env, me, v);
  return json({ avatar: v });
}

export async function removeAvatar(req: Request, env: Env): Promise<Response> {
  const me = await requireUser(req, env);
  await deleteFile(env, `avatars/${me.id}`);
  await env.DB.prepare('UPDATE users SET avatar_v = NULL WHERE id = ?').bind(me.id).run();
  await announceAvatar(env, me, null);
  return json({ avatar: null });
}

async function announceAvatar(env: Env, me: User, avatar: number | null) {
  const event = { type: 'profile' as const, username: me.username, avatar };
  await Promise.all([me.id, ...(await friendIds(env, me.id))].map((id) => notify(env, id, event)));
}

/** Profile pictures are public, like usernames. ?v= changes with each new picture. */
export async function avatar(req: Request, env: Env, username: string): Promise<Response> {
  const row = await env.DB.prepare('SELECT id, avatar_v FROM users WHERE username = ?').bind(username.toLowerCase()).first<{ id: number; avatar_v: number | null }>();
  const versioned = new URL(req.url).searchParams.has('v');
  const cache = versioned ? 'public, max-age=31536000, immutable' : 'public, max-age=300';
  const res = row?.avatar_v ? await fileResponse(env, `avatars/${row.id}`, { 'Cache-Control': cache }) : null;
  return res ?? new Response(null, { status: 404, headers: { 'Cache-Control': 'public, max-age=300', 'Access-Control-Allow-Origin': '*' } });
}

// --- Blocking ---

export async function listBlocks(req: Request, env: Env): Promise<Response> {
  const me = await requireUser(req, env);
  const { results } = await env.DB.prepare('SELECT u.username FROM blocks b JOIN users u ON u.id = b.blocked_id WHERE b.user_id = ? ORDER BY b.created_at DESC')
    .bind(me.id)
    .all<{ username: string }>();
  return json({ blocked: results.map((r) => r.username) });
}

export async function block(req: Request, env: Env): Promise<Response> {
  const me = await requireUser(req, env);
  const other = await personByName(env, str((await readJson(req)).username));
  if (other.id === me.id) throw new HttpError(400, 'self', "You can't block yourself.");
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO blocks (user_id, blocked_id) VALUES (?, ?)').bind(me.id, other.id),
    // No longer friends, and no requests either way.
    env.DB.prepare('DELETE FROM friendships WHERE (user_id = ?1 AND friend_id = ?2) OR (user_id = ?2 AND friend_id = ?1)').bind(me.id, other.id),
  ]);
  await Promise.all([notify(env, me.id, { type: 'blocks' }), notify(env, me.id, { type: 'friends' }), notify(env, other.id, { type: 'friends' })]);
  return json({});
}

export async function unblock(req: Request, env: Env, username: string): Promise<Response> {
  const me = await requireUser(req, env);
  const other = await personByName(env, username);
  await env.DB.prepare('DELETE FROM blocks WHERE user_id = ? AND blocked_id = ?').bind(me.id, other.id).run();
  await notify(env, me.id, { type: 'blocks' });
  return json({});
}
