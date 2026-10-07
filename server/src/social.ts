// Friends and direct messages.
import { requireUser, type User } from './auth';
import { HttpError, json, readJson, str } from './http';
import { isOnline, notify } from './live';

const PAGE = 50;
const MAX_MESSAGE = 2000;

type Status = 'outgoing' | 'incoming' | 'friends';

async function findUser(env: Env, username: string): Promise<{ id: number; username: string }> {
  const user = await env.DB.prepare('SELECT id, username FROM users WHERE username = ?')
    .bind(username.trim().toLowerCase())
    .first<{ id: number; username: string }>();
  if (!user) throw new HttpError(404, 'no_such_user', `There's nobody called ${username} on the Bigglenet.`);
  return user;
}

async function statusWith(env: Env, me: User, other: { id: number }): Promise<Status | null> {
  const row = await env.DB.prepare('SELECT status FROM friendships WHERE user_id = ? AND friend_id = ?')
    .bind(me.id, other.id)
    .first<{ status: Status }>();
  return row?.status ?? null;
}

async function requireFriend(env: Env, me: User, username: string) {
  const other = await findUser(env, username);
  if ((await statusWith(env, me, other)) !== 'friends') {
    throw new HttpError(403, 'not_friends', `You and ${other.username} aren't friends.`);
  }
  return other;
}

function setStatus(env: Env, a: number, b: number, aSees: Status, bSees: Status) {
  const upsert = `INSERT INTO friendships (user_id, friend_id, status) VALUES (?, ?, ?)
    ON CONFLICT(user_id, friend_id) DO UPDATE SET status = excluded.status`;
  return env.DB.batch([env.DB.prepare(upsert).bind(a, b, aSees), env.DB.prepare(upsert).bind(b, a, bSees)]);
}

const friendsChanged = (env: Env, a: number, b: number) =>
  Promise.all([notify(env, a, { type: 'friends' }), notify(env, b, { type: 'friends' })]);

export async function listFriends(req: Request, env: Env): Promise<Response> {
  const me = await requireUser(req, env);
  const { results } = await env.DB.prepare(
    `SELECT u.id, u.username, f.status,
       (SELECT COUNT(*) FROM messages m
          WHERE m.sender_id = f.friend_id AND m.recipient_id = f.user_id AND m.read_at IS NULL) AS unread,
       (SELECT MAX(m.created_at) FROM messages m
          WHERE (m.sender_id = f.friend_id AND m.recipient_id = f.user_id)
             OR (m.sender_id = f.user_id AND m.recipient_id = f.friend_id)) AS last_at
     FROM friendships f JOIN users u ON u.id = f.friend_id
     WHERE f.user_id = ?
     ORDER BY last_at DESC, u.username`,
  )
    .bind(me.id)
    .all<{ id: number; username: string; status: Status; unread: number; last_at: number | null }>();

  const friends = await Promise.all(
    results
      .filter((r) => r.status === 'friends')
      .map(async (r) => ({
        username: r.username,
        unread: r.unread,
        lastAt: r.last_at,
        online: await isOnline(env, r.id).catch(() => false),
      })),
  );
  return json({
    friends,
    incoming: results.filter((r) => r.status === 'incoming').map((r) => r.username),
    outgoing: results.filter((r) => r.status === 'outgoing').map((r) => r.username),
  });
}

/** Send a friend request, or accept theirs if they already asked. */
export async function addFriend(req: Request, env: Env): Promise<Response> {
  const me = await requireUser(req, env);
  if (!(await env.MESSAGE_LIMIT.limit({ key: `friend:${me.id}` })).success) {
    throw new HttpError(429, 'slow_down', 'Too many friend requests. Wait a few seconds.');
  }
  const other = await findUser(env, str((await readJson(req)).username));
  if (other.id === me.id) throw new HttpError(400, 'self', "You can't add yourself.");
  const status = await statusWith(env, me, other);
  if (status === 'incoming') {
    await setStatus(env, me.id, other.id, 'friends', 'friends');
  } else if (!status) {
    await setStatus(env, me.id, other.id, 'outgoing', 'incoming');
  }
  await friendsChanged(env, me.id, other.id);
  return json({ status: status === 'incoming' ? 'friends' : (status ?? 'outgoing') });
}

export async function acceptFriend(req: Request, env: Env, username: string): Promise<Response> {
  const me = await requireUser(req, env);
  const other = await findUser(env, username);
  if ((await statusWith(env, me, other)) !== 'incoming') {
    throw new HttpError(400, 'no_request', `${other.username} hasn't sent you a friend request.`);
  }
  await setStatus(env, me.id, other.id, 'friends', 'friends');
  await friendsChanged(env, me.id, other.id);
  return json({ status: 'friends' });
}

/** Unfriend, decline a request, or cancel one you sent. */
export async function removeFriend(req: Request, env: Env, username: string): Promise<Response> {
  const me = await requireUser(req, env);
  const other = await findUser(env, username);
  await env.DB.prepare('DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)')
    .bind(me.id, other.id, other.id, me.id)
    .run();
  await friendsChanged(env, me.id, other.id);
  return json({});
}

type MessageRow = { id: number; sender_id: number; body: string; created_at: number };

export async function listMessages(req: Request, env: Env, username: string): Promise<Response> {
  const me = await requireUser(req, env);
  const other = await requireFriend(env, me, username);
  const before = Number(new URL(req.url).searchParams.get('before')) || Number.MAX_SAFE_INTEGER;
  const { results } = await env.DB.prepare(
    `SELECT id, sender_id, body, created_at FROM messages
     WHERE ((sender_id = ?1 AND recipient_id = ?2) OR (sender_id = ?2 AND recipient_id = ?1)) AND id < ?3
     ORDER BY id DESC LIMIT ?4`,
  )
    .bind(me.id, other.id, before, PAGE + 1)
    .all<MessageRow>();
  const page = results.slice(0, PAGE).reverse();
  return json({
    messages: page.map((m) => ({
      id: m.id,
      from: m.sender_id === me.id ? me.username : other.username,
      to: m.sender_id === me.id ? other.username : me.username,
      body: m.body,
      at: m.created_at,
    })),
    more: results.length > PAGE,
  });
}

export async function sendMessage(req: Request, env: Env, username: string): Promise<Response> {
  const me = await requireUser(req, env);
  if (!(await env.MESSAGE_LIMIT.limit({ key: String(me.id) })).success) {
    throw new HttpError(429, 'slow_down', "You're sending messages too fast. Wait a few seconds.");
  }
  const other = await requireFriend(env, me, username);
  const body = str((await readJson(req)).body).trim();
  if (!body) throw new HttpError(400, 'empty', 'Write something first.');
  if (body.length > MAX_MESSAGE) throw new HttpError(400, 'too_long', `Messages can be up to ${MAX_MESSAGE} characters.`);

  const row = await env.DB.prepare(
    'INSERT INTO messages (sender_id, recipient_id, body, created_at) VALUES (?, ?, ?, ?) RETURNING id, created_at',
  )
    .bind(me.id, other.id, body, Date.now())
    .first<{ id: number; created_at: number }>();
  const message = { id: row!.id, from: me.username, to: other.username, body, at: row!.created_at };
  // Tell the recipient, and the sender's other windows and devices.
  await Promise.all([notify(env, other.id, { type: 'message', message }), notify(env, me.id, { type: 'message', message })]);
  return json({ message }, 201);
}

export async function markRead(req: Request, env: Env, username: string): Promise<Response> {
  const me = await requireUser(req, env);
  const other = await findUser(env, username);
  await env.DB.prepare('UPDATE messages SET read_at = ? WHERE sender_id = ? AND recipient_id = ? AND read_at IS NULL')
    .bind(Date.now(), other.id, me.id)
    .run();
  await notify(env, me.id, { type: 'read', username: other.username });
  return json({});
}
