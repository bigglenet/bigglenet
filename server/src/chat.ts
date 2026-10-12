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
//   GET    /api/chats/:id/messages/:mid     one message (a time capsule that just opened)
//   POST   /api/chats/:id/messages { body, replyTo?, attachment?, unlockAt? }  send one
//   PATCH  /api/chats/:id/messages/:mid { body }   edit your message
//   DELETE /api/chats/:id/messages/:mid     delete your message
//   POST   /api/chats/:id/messages/:mid/reactions { emoji }   add or take back a reaction
//   POST   /api/chats/:id/files  (the file)  upload a picture, file or voice message to send
//   POST   /api/chats/:id/typing            tell the others you're typing
//   POST   /api/chats/:id/read              mark everything read
//   POST   /api/chats/:id/call { action, video }   join, leave, decline or keep alive
//   POST   /api/chats/:id/signal { to, data }      pass call connection details to someone
//   POST   /api/chats/:id/together { data }        watching or listening together in a call
import { randomId, requireUser, type User } from './auth';
import { deleteFile, fileLink } from './files';
import { HttpError, json, readJson, str } from './http';
import { notify, type LiveEvent } from './live';
import { blockedIds } from './people';

const PAGE = 50;
const MAX_MESSAGE = 2000;
const MAX_FILE = 10 * 1024 * 1024;
const MAX_FILE_NAME = 120;
/** Time capsules can open up to this far ahead. */
const MAX_CAPSULE_MS = 5 * 365 * 24 * 60 * 60 * 1000;
const MAX_GROUP = 20;
const MAX_NAME = 60;
/** People in a call who haven't checked in for this long have gone. */
const CALL_STALE_MS = 45_000;

type Chat = { id: number; kind: 'direct' | 'group'; name: string | null; call_started: number | null };
type Attachment = {
  key: string;
  name: string;
  type: string;
  size: number;
  width?: number;
  height?: number;
  /** Seconds, for voice messages and other sound or video. */
  duration?: number;
  voice?: boolean;
};

type MessageRow = {
  id: number;
  chat_id: number;
  sender_id: number | null;
  sender: string | null;
  kind: 'text' | 'event';
  body: string;
  created_at: number;
  reply_to: number | null;
  edited_at: number | null;
  deleted: number;
  attachment: string | null;
  unlock_at: number | null;
  /** JSON: [{ emoji, user }]. */
  reactions: string;
  /** JSON: the message it replies to. */
  reply: string | null;
};

const MESSAGE_SELECT = `
  SELECT m.id, m.chat_id, m.sender_id, u.username AS sender, m.kind, m.body, m.created_at, m.reply_to, m.edited_at,
    m.deleted, m.attachment, m.unlock_at,
    (SELECT json_group_array(json_object('emoji', r.emoji, 'user', ru.username))
       FROM chat_reactions r JOIN users ru ON ru.id = r.user_id WHERE r.message_id = m.id) AS reactions,
    (SELECT json_object('id', p.id, 'from', pu.username, 'senderId', p.sender_id, 'body', substr(p.body, 1, 140),
            'deleted', p.deleted, 'attachment', p.attachment, 'unlockAt', p.unlock_at)
       FROM chat_messages p LEFT JOIN users pu ON pu.id = p.sender_id WHERE p.id = m.reply_to AND p.chat_id = m.chat_id) AS reply
  FROM chat_messages m LEFT JOIN users u ON u.id = m.sender_id`;

/** Inline in the chat: pictures, sound and video. Everything else is a file to download. */
const INLINE = /^(image\/(png|jpeg|gif|webp|avif)|audio\/(webm|ogg|mpeg|mp4|aac|wav)|video\/(mp4|webm))$/;

async function publicAttachment(env: Env, raw: string | null) {
  if (!raw) return null;
  const a = JSON.parse(raw) as Attachment;
  const inline = INLINE.test(a.type);
  return {
    url: await fileLink(env, a.key, inline ? undefined : a.name),
    name: a.name,
    type: a.type,
    size: a.size,
    inline,
    ...(a.width ? { width: a.width, height: a.height } : {}),
    ...(a.duration ? { duration: a.duration } : {}),
    ...(a.voice ? { voice: true } : {}),
  };
}

/** A message as `viewer` sees it: time capsules stay shut until they open (except for their sender). */
async function shape(env: Env, m: MessageRow, viewer: number) {
  const now = Date.now();
  const locked = !!m.unlock_at && m.unlock_at > now && m.sender_id !== viewer;
  const reactions = new Map<string, string[]>();
  for (const r of JSON.parse(m.reactions || '[]') as { emoji: string; user: string }[]) {
    reactions.set(r.emoji, [...(reactions.get(r.emoji) ?? []), r.user]);
  }
  let reply = null;
  if (m.reply) {
    const p = JSON.parse(m.reply) as { id: number; from: string | null; senderId: number | null; body: string; deleted: number; attachment: string | null; unlockAt: number | null };
    const hidden = !!p.deleted || (!!p.unlockAt && p.unlockAt > now && p.senderId !== viewer);
    const file = p.attachment && !hidden ? (JSON.parse(p.attachment) as Attachment) : null;
    reply = { id: p.id, from: p.from, body: hidden ? '' : p.body, deleted: !!p.deleted, locked: !p.deleted && hidden, file: file ? { name: file.name, type: file.type, voice: !!file.voice } : null };
  }
  return {
    id: m.id,
    chatId: m.chat_id,
    from: m.sender,
    kind: m.kind,
    body: locked || m.deleted ? '' : m.body,
    at: m.created_at,
    ...(m.edited_at ? { editedAt: m.edited_at } : {}),
    ...(m.deleted ? { deleted: true } : {}),
    ...(m.unlock_at ? { unlockAt: m.unlock_at } : {}),
    ...(locked ? { locked: true } : {}),
    attachment: locked || m.deleted ? null : await publicAttachment(env, m.attachment),
    reply,
    reactions: [...reactions].map(([emoji, users]) => ({ emoji, users })),
  };
}

async function messageRow(env: Env, chatId: number, id: number): Promise<MessageRow> {
  const row = await env.DB.prepare(`${MESSAGE_SELECT} WHERE m.id = ? AND m.chat_id = ?`).bind(id, chatId).first<MessageRow>();
  if (!row) throw new HttpError(404, 'no_such_message', 'That message is gone.');
  return row;
}

/** Tell everyone in the chat about a message (each sees it their way: capsules stay shut). */
async function broadcast(env: Env, chatId: number, row: MessageRow, type: 'chat-message' | 'chat-message-update') {
  const members = await memberIds(env, chatId);
  const capsule = !!row.unlock_at && row.unlock_at > Date.now();
  const forAll = capsule ? null : await shape(env, row, 0);
  await Promise.all(members.map(async (id) => notify(env, id, { type, message: forAll ?? (await shape(env, row, id)) })));
  return members;
}

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
export async function postMessage(
  env: Env,
  chatId: number,
  sender: User | null,
  body: string,
  kind: 'text' | 'event' = 'text',
  extra: { replyTo?: number | null; attachment?: Attachment | null; unlockAt?: number | null } = {},
) {
  const at = Date.now();
  const row = await env.DB.prepare(
    'INSERT INTO chat_messages (chat_id, sender_id, kind, body, created_at, reply_to, attachment, unlock_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
  )
    .bind(chatId, sender?.id ?? null, kind, body, at, extra.replyTo ?? null, extra.attachment ? JSON.stringify(extra.attachment) : null, extra.unlockAt ?? null)
    .first<{ id: number }>();
  await env.DB.batch([
    env.DB.prepare('UPDATE chats SET last_at = ? WHERE id = ?').bind(at, chatId),
    // Your own messages count as read.
    ...(sender ? [env.DB.prepare('UPDATE chat_members SET read_up_to = ? WHERE chat_id = ? AND user_id = ?').bind(row!.id, chatId, sender.id)] : []),
  ]);
  const full = await messageRow(env, chatId, row!.id);
  const members = await broadcast(env, chatId, full, 'chat-message');
  // Apps from before group chats only understand one-to-one text messages.
  if (kind === 'text' && sender && !extra.attachment && !extra.unlockAt) {
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
  return shape(env, full, sender?.id ?? 0);
}

// --- Chats ---

/** The newest message, for the chat list: what kind of thing it was, but not a capsule's insides. */
function lastPreview(
  l: { from: string | null; senderId: number | null; kind: string; body: string; at: number; deleted: number; attachment: string | null; unlockAt: number | null },
  me: number,
) {
  const locked = !!l.unlockAt && l.unlockAt > Date.now() && l.senderId !== me;
  const a = l.attachment && !locked && !l.deleted ? (JSON.parse(l.attachment) as Attachment) : null;
  return {
    from: l.from,
    kind: l.kind,
    body: locked || l.deleted ? '' : l.body,
    at: l.at,
    ...(l.deleted ? { deleted: true } : {}),
    ...(l.unlockAt ? { capsule: true } : {}),
    ...(a ? { file: { name: a.name, type: a.type, voice: !!a.voice } } : {}),
  };
}

export async function listChats(req: Request, env: Env): Promise<Response> {
  const me = await requireUser(req, env);
  const [chats, members, calls] = await env.DB.batch([
    env.DB.prepare(
      `SELECT c.id, c.kind, c.name, c.last_at, c.call_started,
         (SELECT COUNT(*) FROM chat_messages x
            WHERE x.chat_id = c.id AND x.id > m.read_up_to AND (x.sender_id IS NULL OR x.sender_id != ?1)) AS unread,
         (SELECT json_object('from', u.username, 'senderId', x.sender_id, 'kind', x.kind, 'body', substr(x.body, 1, 140), 'at', x.created_at,
                 'deleted', x.deleted, 'attachment', x.attachment, 'unlockAt', x.unlock_at)
            FROM chat_messages x LEFT JOIN users u ON u.id = x.sender_id
            WHERE x.chat_id = c.id ORDER BY x.id DESC LIMIT 1) AS last
       FROM chat_members m JOIN chats c ON c.id = m.chat_id
       WHERE m.user_id = ?1
       ORDER BY COALESCE(c.last_at, c.created_at * 1000) DESC`,
    ).bind(me.id),
    env.DB.prepare(
      `SELECT cm.chat_id, u.username, cm.read_up_to FROM chat_members cm JOIN users u ON u.id = cm.user_id
       WHERE cm.chat_id IN (SELECT chat_id FROM chat_members WHERE user_id = ?)`,
    ).bind(me.id),
    env.DB.prepare(
      `SELECT k.chat_id, u.username, k.video FROM call_members k JOIN users u ON u.id = k.user_id
       WHERE k.chat_id IN (SELECT chat_id FROM chat_members WHERE user_id = ?) AND k.seen_at > ?`,
    ).bind(me.id, Date.now() - CALL_STALE_MS),
  ]);
  type Row = { id: number; kind: string; name: string | null; last_at: number | null; call_started: number | null; unread: number; last: string | null };
  const byChat = <T extends { chat_id: number }>(rows: T[], id: number) => rows.filter((r) => r.chat_id === id);
  type MemberRow = { chat_id: number; username: string; read_up_to: number };
  return json({
    chats: (chats.results as Row[]).map((c) => ({
      id: c.id,
      kind: c.kind,
      name: c.name,
      members: byChat(members.results as MemberRow[], c.id).map((r) => r.username),
      /** How far each member has read, for "Seen". */
      reads: Object.fromEntries(byChat(members.results as MemberRow[], c.id).map((r) => [r.username, r.read_up_to])),
      lastAt: c.last_at,
      last: c.last ? lastPreview(JSON.parse(c.last), me.id) : null,
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
  const { results } = await env.DB.prepare(`${MESSAGE_SELECT} WHERE m.chat_id = ? AND m.id < ? ORDER BY m.id DESC LIMIT ?`)
    .bind(chat.id, before, PAGE + 1)
    .all<MessageRow>();
  // Messages from people I've blocked (in groups) are hidden.
  const blocked = await blockedIds(env, me.id);
  const messages = await Promise.all(
    results
      .slice(0, PAGE)
      .reverse()
      .map(async (m) => {
        const shown = await shape(env, m, me.id);
        return m.sender_id && blocked.has(m.sender_id) ? { ...shown, body: '', attachment: null, blocked: true } : shown;
      }),
  );
  return json({ messages, more: results.length > PAGE });
}

export async function getMessage(req: Request, env: Env, rawId: string, rawMid: string): Promise<Response> {
  const me = await requireUser(req, env);
  const chat = await myChat(env, me, rawId);
  return json({ message: await shape(env, await messageRow(env, chat.id, Number(rawMid)), me.id) });
}

export async function sendMessage(req: Request, env: Env, rawId: string): Promise<Response> {
  const me = await requireUser(req, env);
  if (!(await env.MESSAGE_LIMIT.limit({ key: String(me.id) })).success) {
    throw new HttpError(429, 'slow_down', "You're sending messages too fast. Wait a few seconds.");
  }
  const chat = await myChat(env, me, rawId);
  await requireCanTalk(env, me, chat);
  const input = await readJson(req);
  const body = str(input.body).trim();
  if (body.length > MAX_MESSAGE) throw new HttpError(400, 'too_long', `Messages can be up to ${MAX_MESSAGE} characters.`);

  // A file uploaded to this chat first (POST /files).
  let attachment: Attachment | null = null;
  if (input.attachment && typeof input.attachment === 'object') {
    const a = input.attachment as Record<string, unknown>;
    const key = str(a.key);
    if (!key.startsWith(`chat/${chat.id}/`)) throw new HttpError(400, 'bad_file', "That file isn't in this chat.");
    const object = await env.FILES.head(key);
    if (!object) throw new HttpError(400, 'bad_file', 'That file didn’t finish uploading. Try again.');
    const num = (v: unknown, max: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.min(Math.round(Number(v)), max) : undefined);
    attachment = {
      key,
      name: object.customMetadata?.name ?? 'file',
      type: object.httpMetadata?.contentType ?? 'application/octet-stream',
      size: object.size,
      width: num(a.width, 20000),
      height: num(a.height, 20000),
      duration: num(a.duration, 24 * 3600),
      voice: a.voice === true && /^audio\//.test(object.httpMetadata?.contentType ?? '') ? true : undefined,
    };
  }
  if (!body && !attachment) throw new HttpError(400, 'empty', 'Write something first.');

  let replyTo: number | null = null;
  if (input.replyTo !== undefined && input.replyTo !== null) {
    const target = await env.DB.prepare('SELECT id FROM chat_messages WHERE id = ? AND chat_id = ?').bind(Number(input.replyTo), chat.id).first<{ id: number }>();
    if (!target) throw new HttpError(400, 'bad_reply', 'The message you replied to is gone.');
    replyTo = target.id;
  }

  let unlockAt: number | null = null;
  if (input.unlockAt !== undefined && input.unlockAt !== null) {
    unlockAt = Math.floor(Number(input.unlockAt));
    if (!Number.isFinite(unlockAt) || unlockAt < Date.now() + 60_000) throw new HttpError(400, 'bad_capsule', 'Pick a time at least a minute from now.');
    if (unlockAt > Date.now() + MAX_CAPSULE_MS) throw new HttpError(400, 'bad_capsule', 'Time capsules can open up to 5 years from now.');
  }

  return json({ message: await postMessage(env, chat.id, me, body, 'text', { replyTo, attachment, unlockAt }) }, 201);
}

/** One of my own messages. */
async function myMessage(env: Env, me: User, chat: Chat, rawMid: string): Promise<MessageRow> {
  const row = await messageRow(env, chat.id, Number(rawMid));
  if (row.sender_id !== me.id || row.kind !== 'text') throw new HttpError(403, 'not_yours', 'You can only change your own messages.');
  if (row.deleted) throw new HttpError(410, 'deleted', 'That message was deleted.');
  return row;
}

export async function editMessage(req: Request, env: Env, rawId: string, rawMid: string): Promise<Response> {
  const me = await requireUser(req, env);
  const chat = await myChat(env, me, rawId);
  const row = await myMessage(env, me, chat, rawMid);
  const body = str((await readJson(req)).body).trim();
  if (!body && !row.attachment) throw new HttpError(400, 'empty', 'Write something, or delete the message.');
  if (body.length > MAX_MESSAGE) throw new HttpError(400, 'too_long', `Messages can be up to ${MAX_MESSAGE} characters.`);
  await env.DB.prepare('UPDATE chat_messages SET body = ?, edited_at = ? WHERE id = ?').bind(body, Date.now(), row.id).run();
  const updated = await messageRow(env, chat.id, row.id);
  await broadcast(env, chat.id, updated, 'chat-message-update');
  return json({ message: await shape(env, updated, me.id) });
}

export async function deleteMessage(req: Request, env: Env, rawId: string, rawMid: string): Promise<Response> {
  const me = await requireUser(req, env);
  const chat = await myChat(env, me, rawId);
  const row = await myMessage(env, me, chat, rawMid);
  await env.DB.batch([
    env.DB.prepare("UPDATE chat_messages SET deleted = 1, body = '', attachment = NULL, unlock_at = NULL WHERE id = ?").bind(row.id),
    env.DB.prepare('DELETE FROM chat_reactions WHERE message_id = ?').bind(row.id),
  ]);
  if (row.attachment) await deleteFile(env, (JSON.parse(row.attachment) as Attachment).key).catch(() => {});
  const updated = await messageRow(env, chat.id, row.id);
  await broadcast(env, chat.id, updated, 'chat-message-update');
  return json({ message: await shape(env, updated, me.id) });
}

const EMOJI_RE = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[\u200d\ufe0f\u{1F3FB}-\u{1F3FF}#*0-9\u20e3])+$/u;

export async function react(req: Request, env: Env, rawId: string, rawMid: string): Promise<Response> {
  const me = await requireUser(req, env);
  const chat = await myChat(env, me, rawId);
  const row = await messageRow(env, chat.id, Number(rawMid));
  if (row.deleted || row.kind !== 'text') throw new HttpError(400, 'cant_react', "You can't react to that.");
  const emoji = str((await readJson(req)).emoji).trim();
  if (!emoji || emoji.length > 16 || !EMOJI_RE.test(emoji)) throw new HttpError(400, 'bad_emoji', 'React with an emoji.');
  const had = await env.DB.prepare('DELETE FROM chat_reactions WHERE message_id = ? AND user_id = ? AND emoji = ? RETURNING emoji')
    .bind(row.id, me.id, emoji)
    .first();
  if (!had) {
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM chat_reactions WHERE message_id = ? AND user_id = ?').bind(row.id, me.id).first<{ n: number }>();
    if ((count?.n ?? 0) >= 10) throw new HttpError(400, 'too_many', 'That’s plenty of reactions.');
    await env.DB.prepare('INSERT INTO chat_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)').bind(row.id, me.id, emoji).run();
  }
  const updated = await messageRow(env, chat.id, row.id);
  const reactions = (await shape(env, updated, me.id)).reactions;
  await tellMembers(env, chat.id, { type: 'chat-reactions', chatId: chat.id, messageId: row.id, reactions });
  return json({ reactions });
}

/** A picture, file or voice message, uploaded before it's sent (so the app can show progress). */
export async function uploadFile(req: Request, env: Env, rawId: string): Promise<Response> {
  const me = await requireUser(req, env);
  const chat = await myChat(env, me, rawId);
  await requireCanTalk(env, me, chat);
  if (Number(req.headers.get('Content-Length') ?? 0) > MAX_FILE) throw new HttpError(413, 'too_large', 'Files can be up to 10 MB.');
  const bytes = await req.arrayBuffer();
  if (!bytes.byteLength) throw new HttpError(400, 'empty', 'That file is empty.');
  if (bytes.byteLength > MAX_FILE) throw new HttpError(413, 'too_large', 'Files can be up to 10 MB.');
  const type = (req.headers.get('Content-Type') ?? 'application/octet-stream').split(';')[0].trim().toLowerCase().slice(0, 100) || 'application/octet-stream';
  let name = 'file';
  try {
    name = decodeURIComponent(req.headers.get('X-File-Name') ?? 'file');
  } catch {}
  name = name.replace(/[\u0000-\u001f/\\]/g, '').trim().slice(0, MAX_FILE_NAME) || 'file';
  const key = `chat/${chat.id}/${randomId(12)}`;
  await env.FILES.put(key, bytes, { httpMetadata: { contentType: type }, customMetadata: { name, by: String(me.id) } });
  return json({ key, name, type, size: bytes.byteLength }, 201);
}

export async function typing(req: Request, env: Env, rawId: string): Promise<Response> {
  const me = await requireUser(req, env);
  const chat = await myChat(env, me, rawId);
  const others = (await memberIds(env, chat.id)).filter((id) => id !== me.id);
  await Promise.all(others.map((id) => notify(env, id, { type: 'typing', chatId: chat.id, username: me.username })));
  return json({});
}

export async function markRead(req: Request, env: Env, rawId: string): Promise<Response> {
  const me = await requireUser(req, env);
  const chat = await myChat(env, me, rawId);
  const row = await env.DB.prepare(
    `UPDATE chat_members SET read_up_to = MAX(read_up_to, COALESCE((SELECT MAX(id) FROM chat_messages WHERE chat_id = ?1), 0))
     WHERE chat_id = ?1 AND user_id = ?2 RETURNING read_up_to`,
  )
    .bind(chat.id, me.id)
    .first<{ read_up_to: number }>();
  await notify(env, me.id, { type: 'chat-read', chatId: chat.id });
  // Everyone else sees "Seen".
  const others = (await memberIds(env, chat.id)).filter((id) => id !== me.id);
  await Promise.all(others.map((id) => notify(env, id, { type: 'chat-seen', chatId: chat.id, username: me.username, upTo: row?.read_up_to ?? 0 })));
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

/** Watching or listening together during a call: pass what the player did to everyone else in it. */
export async function together(req: Request, env: Env, rawId: string): Promise<Response> {
  const me = await requireUser(req, env);
  const chat = await myChat(env, me, rawId);
  const data = (await readJson(req)).data;
  if (!data || typeof data !== 'object' || JSON.stringify(data).length > 4000) throw new HttpError(400, 'bad_data', "That isn't player data.");
  const members = await env.DB.prepare('SELECT user_id FROM call_members WHERE chat_id = ? AND seen_at > ? AND user_id != ?')
    .bind(chat.id, Date.now() - CALL_STALE_MS, me.id)
    .all<{ user_id: number }>();
  await Promise.all(members.results.map((m) => notify(env, m.user_id, { type: 'together', chatId: chat.id, from: me.username, data })));
  return json({});
}
