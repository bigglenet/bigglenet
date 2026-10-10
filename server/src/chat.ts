// Chats: one-to-one and group conversations, and voice and video calls in them. Calls are
// peer-to-peer (WebRTC). The server keeps track of who's in each call and passes the connection
// details between them over the live connection.
//
//   GET    /api/chats                       my chats
//   POST   /api/chats { members, name?, group? }  open a one-to-one chat, or make a group
//   PATCH  /api/chats/:id { name }          rename a group
//   POST   /api/chats/:id/members { usernames }  add friends to a group
//   DELETE /api/chats/:id/members/me        leave a group
//   GET    /api/chats/:id/messages?before=  messages, newest page first
//   POST   /api/chats/:id/messages { body } send one
//   POST   /api/chats/:id/read              mark everything read
//   POST   /api/chats/:id/call { action, video }   join, leave, decline or keep alive
//   POST   /api/chats/:id/signal { to, data }      pass call connection details to someone
import { requireUser, type User } from './auth';
import { HttpError, json, readJson, str } from './http';
import { notify, type LiveEvent } from './live';

const PAGE = 50;
const MAX_MESSAGE = 2000;
const MAX_GROUP = 20;
const MAX_NAME = 60;
/** People in a call who haven't checked in for this long have gone. */
const CALL_STALE_MS = 45_000;

type Chat = { id: number; kind: 'direct' | 'group'; name: string | null; call_started: number | null };
type MessageRow = { id: number; chat_id: number; sender: string | null; kind: 'text' | 'event'; body: string; created_at: number };

const publicMessage = (m: MessageRow) => ({ id: m.id, chatId: m.chat_id, from: m.sender, kind: m.kind, body: m.body, at: m.created_at });

// --- Who's who ---

async function userByName(env: Env, username: string) {
  const user = await env.DB.prepare('SELECT id, username FROM users WHERE username = ?')
    .bind(username.trim().toLowerCase())
    .first<{ id: number; username: string }>();
  if (!user) throw new HttpError(404, 'no_such_user', `There's nobody called ${username}.`);
  return user;
}

async function areFriends(env: Env, a: number, b: number) {
  return !!(await env.DB.prepare("SELECT 1 FROM friendships WHERE user_id = ? AND friend_id = ? AND status = 'friends'").bind(a, b).first());
}

async function memberIds(env: Env, chatId: number): Promise<number[]> {
  const { results } = await env.DB.prepare('SELECT user_id FROM chat_members WHERE chat_id = ?').bind(chatId).all<{ user_id: number }>();
  return results.map((r) => r.user_id);
}

/** The chat, if I'm in it. */
async function myChat(env: Env, me: User, rawId: string): Promise<Chat> {
  const chat = await env.DB.prepare(
    `SELECT c.id, c.kind, c.name, c.call_started FROM chats c
     JOIN chat_members m ON m.chat_id = c.id AND m.user_id = ?
     WHERE c.id = ?`,
  )
    .bind(me.id, Number(rawId))
    .first<Chat>();
  if (!chat) throw new HttpError(404, 'no_such_chat', "That chat doesn't exist, or you're not in it.");
  return chat;
}

/** One-to-one chats need the two people to still be friends. */
async function requireCanTalk(env: Env, me: User, chat: Chat) {
  if (chat.kind !== 'direct') return;
  const other = (await memberIds(env, chat.id)).find((id) => id !== me.id);
  if (!other || !(await areFriends(env, me.id, other))) throw new HttpError(403, 'not_friends', 'You can only message your friends.');
}

const tellMembers = async (env: Env, chatId: number, event: LiveEvent) => {
  await Promise.all((await memberIds(env, chatId)).map((id) => notify(env, id, event)));
};

/** Get or make the one-to-one chat between two people. */
export async function directChat(env: Env, a: number, b: number): Promise<number> {
  const pair = `${Math.min(a, b)}:${Math.max(a, b)}`;
  const existing = await env.DB.prepare('SELECT id FROM chats WHERE pair = ?').bind(pair).first<{ id: number }>();
  if (existing) return existing.id;
  const made = await env.DB.prepare("INSERT INTO chats (kind, pair, created_by) VALUES ('direct', ?, ?) ON CONFLICT(pair) DO NOTHING RETURNING id")
    .bind(pair, a)
    .first<{ id: number }>();
  const id = made?.id ?? (await env.DB.prepare('SELECT id FROM chats WHERE pair = ?').bind(pair).first<{ id: number }>())!.id;
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO chat_members (chat_id, user_id) VALUES (?, ?)').bind(id, a),
    env.DB.prepare('INSERT OR IGNORE INTO chat_members (chat_id, user_id) VALUES (?, ?)').bind(id, b),
  ]);
  return id;
}

/**
 * Add a message, or an event note, to a chat and tell everyone in it. An event's body follows
 * the sender's name ("made the group"); with no sender it stands alone ("Call ended").
 */
export async function postMessage(env: Env, chatId: number, sender: User | null, body: string, kind: 'text' | 'event' = 'text') {
  const at = Date.now();
  const row = await env.DB.prepare('INSERT INTO chat_messages (chat_id, sender_id, kind, body, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id')
    .bind(chatId, sender?.id ?? null, kind, body, at)
    .first<{ id: number }>();
  await env.DB.batch([
    env.DB.prepare('UPDATE chats SET last_at = ? WHERE id = ?').bind(at, chatId),
    // Your own messages count as read.
    ...(sender ? [env.DB.prepare('UPDATE chat_members SET read_up_to = ? WHERE chat_id = ? AND user_id = ?').bind(row!.id, chatId, sender.id)] : []),
  ]);
  const message = { id: row!.id, chatId, from: sender?.username ?? null, kind, body, at };
  const members = await memberIds(env, chatId);
  await Promise.all(members.map((id) => notify(env, id, { type: 'chat-message', message })));
  // Apps from before group chats only understand one-to-one messages.
  if (kind === 'text' && sender) {
    const chat = await env.DB.prepare('SELECT kind FROM chats WHERE id = ?').bind(chatId).first<{ kind: string }>();
    if (chat?.kind === 'direct') {
      const otherId = members.find((id) => id !== sender.id);
      const other = otherId && (await env.DB.prepare('SELECT username FROM users WHERE id = ?').bind(otherId).first<{ username: string }>());
      if (other) {
        const legacy = { id: row!.id, from: sender.username, to: other.username, body, at };
        await Promise.all(members.map((id) => notify(env, id, { type: 'message', message: legacy })));
      }
    }
  }
  return message;
}

// --- Chats ---

export async function listChats(req: Request, env: Env): Promise<Response> {
  const me = await requireUser(req, env);
  const [chats, members, calls] = await env.DB.batch([
    env.DB.prepare(
      `SELECT c.id, c.kind, c.name, c.last_at, c.call_started,
         (SELECT COUNT(*) FROM chat_messages x
            WHERE x.chat_id = c.id AND x.id > m.read_up_to AND (x.sender_id IS NULL OR x.sender_id != ?1)) AS unread,
         (SELECT json_object('from', u.username, 'kind', x.kind, 'body', substr(x.body, 1, 140), 'at', x.created_at)
            FROM chat_messages x LEFT JOIN users u ON u.id = x.sender_id
            WHERE x.chat_id = c.id ORDER BY x.id DESC LIMIT 1) AS last
       FROM chat_members m JOIN chats c ON c.id = m.chat_id
       WHERE m.user_id = ?1
       ORDER BY COALESCE(c.last_at, c.created_at * 1000) DESC`,
    ).bind(me.id),
    env.DB.prepare(
      `SELECT cm.chat_id, u.username FROM chat_members cm JOIN users u ON u.id = cm.user_id
       WHERE cm.chat_id IN (SELECT chat_id FROM chat_members WHERE user_id = ?)`,
    ).bind(me.id),
    env.DB.prepare(
      `SELECT k.chat_id, u.username, k.video FROM call_members k JOIN users u ON u.id = k.user_id
       WHERE k.chat_id IN (SELECT chat_id FROM chat_members WHERE user_id = ?) AND k.seen_at > ?`,
    ).bind(me.id, Date.now() - CALL_STALE_MS),
  ]);
  type Row = { id: number; kind: string; name: string | null; last_at: number | null; call_started: number | null; unread: number; last: string | null };
  const byChat = <T extends { chat_id: number }>(rows: T[], id: number) => rows.filter((r) => r.chat_id === id);
  return json({
    chats: (chats.results as Row[]).map((c) => ({
      id: c.id,
      kind: c.kind,
      name: c.name,
      members: byChat(members.results as { chat_id: number; username: string }[], c.id).map((r) => r.username),
      lastAt: c.last_at,
      last: c.last ? JSON.parse(c.last) : null,
      unread: c.unread,
      call: byChat(calls.results as { chat_id: number; username: string; video: number }[], c.id).map((r) => ({ username: r.username, video: !!r.video })),
      callStarted: c.call_started,
    })),
  });
}

export async function createChat(req: Request, env: Env): Promise<Response> {
  const me = await requireUser(req, env);
  const body = await readJson(req);
  const usernames = Array.isArray(body.members) ? [...new Set(body.members.map((u) => str(u).trim().toLowerCase()))].filter((u) => u && u !== me.username) : [];
  const name = str(body.name).replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
  if (!usernames.length) throw new HttpError(400, 'no_members', 'Pick at least one friend.');
  if (usernames.length + 1 > MAX_GROUP) throw new HttpError(400, 'too_many', `Groups can have up to ${MAX_GROUP} people.`);

  const others = [];
  for (const username of usernames) {
    const other = await userByName(env, username);
    if (!(await areFriends(env, me.id, other.id))) throw new HttpError(403, 'not_friends', `You can only add friends, and ${other.username} isn't one yet.`);
    others.push(other);
  }

  // One friend, unless asked for a group: the one-to-one chat with them.
  if (others.length === 1 && !name && body.group !== true) {
    const id = await directChat(env, me.id, others[0].id);
    return json({ id });
  }

  const made = await env.DB.prepare("INSERT INTO chats (kind, name, created_by) VALUES ('group', ?, ?) RETURNING id")
    .bind(name || null, me.id)
    .first<{ id: number }>();
  const id = made!.id;
  await env.DB.batch([me, ...others].map((u) => env.DB.prepare('INSERT INTO chat_members (chat_id, user_id) VALUES (?, ?)').bind(id, u.id)));
  await postMessage(env, id, me, 'made the group', 'event');
  await tellMembers(env, id, { type: 'chats' });
  return json({ id }, 201);
}

export async function renameChat(req: Request, env: Env, rawId: string): Promise<Response> {
  const me = await requireUser(req, env);
  const chat = await myChat(env, me, rawId);
  if (chat.kind !== 'group') throw new HttpError(400, 'not_group', 'Only groups have names.');
  const name = str((await readJson(req)).name).replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
  await env.DB.prepare('UPDATE chats SET name = ? WHERE id = ?').bind(name || null, chat.id).run();
  await postMessage(env, chat.id, me, name ? `named the group “${name}”` : 'removed the group name', 'event');
  await tellMembers(env, chat.id, { type: 'chats' });
  return json({});
}

export async function addMembers(req: Request, env: Env, rawId: string): Promise<Response> {
  const me = await requireUser(req, env);
  const chat = await myChat(env, me, rawId);
  if (chat.kind !== 'group') throw new HttpError(400, 'not_group', 'Make a group to add more people.');
  const body = await readJson(req);
  const usernames = Array.isArray(body.usernames) ? body.usernames.map((u) => str(u).trim().toLowerCase()).filter(Boolean) : [];
  const current = await memberIds(env, chat.id);
  const added = [];
  for (const username of usernames) {
    const other = await userByName(env, username);
    if (current.includes(other.id)) continue;
    if (!(await areFriends(env, me.id, other.id))) throw new HttpError(403, 'not_friends', `You can only add friends, and ${other.username} isn't one yet.`);
    added.push(other);
  }
  if (current.length + added.length > MAX_GROUP) throw new HttpError(400, 'too_many', `Groups can have up to ${MAX_GROUP} people.`);
  if (!added.length) return json({});
  await env.DB.batch(added.map((u) => env.DB.prepare('INSERT OR IGNORE INTO chat_members (chat_id, user_id) VALUES (?, ?)').bind(chat.id, u.id)));
  await postMessage(env, chat.id, me, `added ${added.map((u) => u.username).join(', ')}`, 'event');
  await tellMembers(env, chat.id, { type: 'chats' });
  return json({});
}

export async function leaveChat(req: Request, env: Env, rawId: string): Promise<Response> {
  const me = await requireUser(req, env);
  const chat = await myChat(env, me, rawId);
  if (chat.kind !== 'group') throw new HttpError(400, 'not_group', "You can't leave a one-to-one chat. Remove the friend instead.");
  await leaveCall(env, chat, me);
  await postMessage(env, chat.id, me, 'left the group', 'event');
  await env.DB.prepare('DELETE FROM chat_members WHERE chat_id = ? AND user_id = ?').bind(chat.id, me.id).run();
  const left = await memberIds(env, chat.id);
  if (!left.length) await env.DB.prepare('DELETE FROM chats WHERE id = ?').bind(chat.id).run();
  await Promise.all([...left, me.id].map((id) => notify(env, id, { type: 'chats' })));
  return json({});
}

// --- Messages ---

export async function listMessages(req: Request, env: Env, rawId: string): Promise<Response> {
  const me = await requireUser(req, env);
  const chat = await myChat(env, me, rawId);
  const before = Number(new URL(req.url).searchParams.get('before')) || Number.MAX_SAFE_INTEGER;
  const { results } = await env.DB.prepare(
    `SELECT m.id, m.chat_id, u.username AS sender, m.kind, m.body, m.created_at
     FROM chat_messages m LEFT JOIN users u ON u.id = m.sender_id
     WHERE m.chat_id = ? AND m.id < ? ORDER BY m.id DESC LIMIT ?`,
  )
    .bind(chat.id, before, PAGE + 1)
    .all<MessageRow>();
  return json({ messages: results.slice(0, PAGE).reverse().map(publicMessage), more: results.length > PAGE });
}

export async function sendMessage(req: Request, env: Env, rawId: string): Promise<Response> {
  const me = await requireUser(req, env);
  if (!(await env.MESSAGE_LIMIT.limit({ key: String(me.id) })).success) {
    throw new HttpError(429, 'slow_down', "You're sending messages too fast. Wait a few seconds.");
  }
  const chat = await myChat(env, me, rawId);
  await requireCanTalk(env, me, chat);
  const body = str((await readJson(req)).body).trim();
  if (!body) throw new HttpError(400, 'empty', 'Write something first.');
  if (body.length > MAX_MESSAGE) throw new HttpError(400, 'too_long', `Messages can be up to ${MAX_MESSAGE} characters.`);
  return json({ message: await postMessage(env, chat.id, me, body) }, 201);
}

export async function markRead(req: Request, env: Env, rawId: string): Promise<Response> {
  const me = await requireUser(req, env);
  const chat = await myChat(env, me, rawId);
  await env.DB.prepare(
    'UPDATE chat_members SET read_up_to = MAX(read_up_to, COALESCE((SELECT MAX(id) FROM chat_messages WHERE chat_id = ?1), 0)) WHERE chat_id = ?1 AND user_id = ?2',
  )
    .bind(chat.id, me.id)
    .run();
  await notify(env, me.id, { type: 'chat-read', chatId: chat.id });
  return json({});
}

// --- Calls ---

async function callState(env: Env, chatId: number) {
  const { results } = await env.DB.prepare(
    'SELECT u.username, k.video FROM call_members k JOIN users u ON u.id = k.user_id WHERE k.chat_id = ? AND k.seen_at > ? ORDER BY k.joined_at',
  )
    .bind(chatId, Date.now() - CALL_STALE_MS)
    .all<{ username: string; video: number }>();
  return results.map((r) => ({ username: r.username, video: !!r.video }));
}

/** Drop anyone who stopped checking in, and end the call if nobody's left. */
async function tidyCall(env: Env, chat: Chat) {
  await env.DB.prepare('DELETE FROM call_members WHERE chat_id = ? AND seen_at <= ?').bind(chat.id, Date.now() - CALL_STALE_MS).run();
  const members = await callState(env, chat.id);
  if (!members.length && chat.call_started) {
    await env.DB.prepare('UPDATE chats SET call_started = NULL WHERE id = ?').bind(chat.id).run();
    const minutes = Math.max(1, Math.round((Date.now() - chat.call_started) / 60_000));
    await postMessage(env, chat.id, null, `Call ended · ${minutes} min`, 'event');
    chat.call_started = null;
  }
  return members;
}

async function leaveCall(env: Env, chat: Chat, me: User) {
  const was = await env.DB.prepare('DELETE FROM call_members WHERE chat_id = ? AND user_id = ? RETURNING user_id').bind(chat.id, me.id).first();
  if (!was) return;
  const members = await tidyCall(env, chat);
  await tellMembers(env, chat.id, { type: 'call', chatId: chat.id, members });
}

export async function call(req: Request, env: Env, rawId: string): Promise<Response> {
  const me = await requireUser(req, env);
  const chat = await myChat(env, me, rawId);
  const body = await readJson(req);
  const action = str(body.action);
  const now = Date.now();

  if (action === 'leave') {
    await leaveCall(env, chat, me);
    return json({});
  }
  if (action === 'ping') {
    await env.DB.prepare('UPDATE call_members SET seen_at = ? WHERE chat_id = ? AND user_id = ?').bind(now, chat.id, me.id).run();
    return json({ members: await callState(env, chat.id) });
  }
  if (action === 'decline') {
    // Tell whoever's calling. In a one-to-one call that ends it for them.
    const members = await callState(env, chat.id);
    await Promise.all(
      members.map(async (m) => notify(env, (await userByName(env, m.username)).id, { type: 'call-declined', chatId: chat.id, username: me.username })),
    );
    return json({});
  }
  if (action !== 'join') throw new HttpError(400, 'bad_action', 'Join, leave, decline or ping.');

  await requireCanTalk(env, me, chat);
  const before = await tidyCall(env, chat);
  const video = body.video === true;
  await env.DB.prepare(
    `INSERT INTO call_members (chat_id, user_id, video, joined_at, seen_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(chat_id, user_id) DO UPDATE SET video = excluded.video, seen_at = excluded.seen_at`,
  )
    .bind(chat.id, me.id, video ? 1 : 0, now, now)
    .run();
  const others = before.filter((m) => m.username !== me.username);
  if (!others.length) {
    // A new call: ring everyone else.
    await env.DB.prepare('UPDATE chats SET call_started = ? WHERE id = ?').bind(now, chat.id).run();
    await postMessage(env, chat.id, me, video ? 'started a video call' : 'started a call', 'event');
  }
  const members = await callState(env, chat.id);
  await tellMembers(env, chat.id, {
    type: 'call',
    chatId: chat.id,
    members,
    ...(others.length ? {} : { ring: { from: me.username, video } }),
  });
  // The newcomer connects to everyone already there.
  return json({ members: others.map((m) => m.username) });
}

export async function signal(req: Request, env: Env, rawId: string): Promise<Response> {
  const me = await requireUser(req, env);
  const chat = await myChat(env, me, rawId);
  const body = await readJson(req);
  const to = await userByName(env, str(body.to));
  const inCall = await env.DB.prepare('SELECT COUNT(*) AS n FROM call_members WHERE chat_id = ? AND user_id IN (?, ?) AND seen_at > ?')
    .bind(chat.id, me.id, to.id, Date.now() - CALL_STALE_MS)
    .first<{ n: number }>();
  if ((inCall?.n ?? 0) < 2) throw new HttpError(409, 'not_in_call', "You're not both in this call.");
  const data = body.data;
  if (!data || typeof data !== 'object' || JSON.stringify(data).length > 20_000) throw new HttpError(400, 'bad_signal', "That isn't call data.");
  await notify(env, to.id, { type: 'signal', chatId: chat.id, from: me.username, data });
  return json({});
}
