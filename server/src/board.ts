// The board (board.biggle): old-school forums. A few boards, threads in each, replies in order.
// Whoever started a thread, and everyone who replied, hears about new replies.
//
//   GET    /api/board                       the boards, with how many threads and the latest one
//   GET    /api/board/:board?before=<at>    its threads, pinned first, then the most recent
//   POST   /api/board/:board                { title, body } → { id }
//   GET    /api/board/threads/:id           the thread and its posts (?after=<post id> for more)
//   POST   /api/board/threads/:id           { body }: a reply
//   PATCH  /api/board/threads/:id           its writer: { title }; admins: { pinned, locked }
//   DELETE /api/board/threads/:id           admins, or its writer before anyone replies
//   PATCH  /api/board/posts/:id             { body }: your own post
//   DELETE /api/board/posts/:id             your own post, or any (admins)
import { requireUser, type User } from './auth';
import { record } from './feed';
import { HttpError, json, readJson, str } from './http';
import { addNotification } from './notifications';
import { blockedIds } from './people';

export const BOARDS = [
  { id: 'news', name: 'News', about: 'What’s new on the Bigglenet. Only admins start threads here.', adminOnly: true },
  { id: 'general', name: 'General', about: 'Anything about the Bigglenet.' },
  { id: 'help', name: 'Help', about: 'Stuck making a site? Ask here.' },
  { id: 'show', name: 'Show and tell', about: 'Made something? Show it off.' },
  { id: 'games', name: 'Games', about: 'Game nights, high scores and games people made.' },
  { id: 'offtopic', name: 'Off topic', about: 'Everything else.' },
] as const;

const THREADS_PAGE = 30;
const POSTS_PAGE = 100;
const MAX_TITLE = 100;
const MAX_BODY = 5000;
const MAX_NOTIFIED = 20;

type Thread = { id: number; board: string; user_id: number | null; title: string; created_at: number; last_at: number; replies: number; pinned: number; locked: number };
type Post = { id: number; thread_id: number; user_id: number | null; body: string; created_at: number; edited_at: number | null; deleted: number };

const board = (id: string) => {
  const b = BOARDS.find((x) => x.id === id);
  if (!b) throw new HttpError(404, 'no_such_board', 'There’s no board called that.');
  return b;
};

async function getThread(env: Env, raw: string): Promise<Thread> {
  const t = await env.DB.prepare('SELECT * FROM board_threads WHERE id = ?').bind(Number(raw)).first<Thread>();
  if (!t) throw new HttpError(404, 'no_such_thread', 'That thread doesn’t exist any more.');
  return t;
}

const limited = async (env: Env, me: User) => {
  if (!(await env.MESSAGE_LIMIT.limit({ key: `board:${me.id}` })).success) throw new HttpError(429, 'slow_down', 'Slow down a little, then try again.');
};

const cleanTitle = (v: unknown) => str(v).replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE);
const cleanBody = (v: unknown) => {
  const body = str(v).replace(/\r\n/g, '\n').trim();
  if (!body) throw new HttpError(400, 'empty', 'Write something first.');
  if (body.length > MAX_BODY) throw new HttpError(400, 'too_long', `Posts can be up to ${MAX_BODY.toLocaleString('en')} characters.`);
  return body;
};

export async function boards(req: Request, env: Env): Promise<Response> {
  await requireUser(req, env);
  const { results } = await env.DB.prepare(
    `SELECT b.board, COUNT(*) AS threads, SUM(b.replies) AS replies, MAX(b.last_at) AS last_at,
       (SELECT json_object('id', t.id, 'title', t.title, 'at', t.last_at) FROM board_threads t WHERE t.board = b.board ORDER BY t.last_at DESC LIMIT 1) AS latest
     FROM board_threads b GROUP BY b.board`,
  ).all<{ board: string; threads: number; replies: number; last_at: number; latest: string | null }>();
  return json({
    boards: BOARDS.map((b) => {
      const r = results.find((x) => x.board === b.id);
      return { id: b.id, name: b.name, about: b.about, adminOnly: 'adminOnly' in b, threads: r?.threads ?? 0, posts: (r?.threads ?? 0) + (r?.replies ?? 0), latest: r?.latest ? JSON.parse(r.latest) : null };
    }),
  });
}

export async function threads(req: Request, env: Env, id: string): Promise<Response> {
  const me = await requireUser(req, env);
  const b = board(id);
  const before = Number(new URL(req.url).searchParams.get('before')) || 0;
  const { results } = await env.DB.prepare(
    `SELECT t.*, u.username, (SELECT p.user_id FROM board_posts p WHERE p.thread_id = t.id ORDER BY p.id DESC LIMIT 1) AS last_user,
       (SELECT x.username FROM board_posts p JOIN users x ON x.id = p.user_id WHERE p.thread_id = t.id ORDER BY p.id DESC LIMIT 1) AS last_name
     FROM board_threads t LEFT JOIN users u ON u.id = t.user_id
     WHERE t.board = ?1 ${before ? 'AND t.pinned = 0 AND t.last_at < ?2' : ''}
     ORDER BY ${before ? '' : 't.pinned DESC,'} t.last_at DESC LIMIT ?3`,
  )
    .bind(b.id, before, THREADS_PAGE + 1)
    .all<Thread & { username: string | null; last_user: number | null; last_name: string | null }>();
  const blocked = await blockedIds(env, me.id);
  const page = results.slice(0, THREADS_PAGE);
  return json({
    board: { id: b.id, name: b.name, about: b.about, canStart: !('adminOnly' in b) || !!me.is_admin },
    threads: page
      .filter((t) => !t.user_id || !blocked.has(t.user_id))
      .map((t) => ({
        id: t.id,
        title: t.title,
        author: t.username,
        replies: t.replies,
        pinned: !!t.pinned,
        locked: !!t.locked,
        createdAt: t.created_at,
        lastAt: t.last_at,
        lastBy: t.last_name,
      })),
    // The next page starts after the last unpinned thread here.
    next: results.length > THREADS_PAGE ? page.filter((t) => !t.pinned).at(-1)?.last_at ?? null : null,
  });
}

export async function startThread(req: Request, env: Env, id: string): Promise<Response> {
  const me = await requireUser(req, env);
  const b = board(id);
  if ('adminOnly' in b && !me.is_admin) throw new HttpError(403, 'admins_only', 'Only admins start threads in News.');
  await limited(env, me);
  const input = await readJson(req);
  const title = cleanTitle(input.title);
  if (!title) throw new HttpError(400, 'no_title', 'Give your thread a title.');
  const body = cleanBody(input.body);
  const thread = await env.DB.prepare('INSERT INTO board_threads (board, user_id, title) VALUES (?, ?, ?) RETURNING id').bind(b.id, me.id, title).first<{ id: number }>();
  await env.DB.prepare('INSERT INTO board_posts (thread_id, user_id, body) VALUES (?, ?, ?)').bind(thread!.id, me.id, body).run();
  await record(env, me.id, 'thread-new', { thread: thread!.id, title, board: b.id });
  return json({ id: thread!.id }, 201);
}

const shownPost = (p: Post & { username: string | null; avatar_v: number | null }, me: User, first: boolean) => ({
  id: p.id,
  author: p.username,
  avatar: p.avatar_v,
  body: p.deleted ? '' : p.body,
  deleted: !!p.deleted,
  first,
  createdAt: p.created_at,
  editedAt: p.edited_at,
  mine: p.user_id === me.id,
  canDelete: !p.deleted && (p.user_id === me.id || !!me.is_admin),
});

export async function thread(req: Request, env: Env, raw: string): Promise<Response> {
  const me = await requireUser(req, env);
  const t = await getThread(env, raw);
  const after = Number(new URL(req.url).searchParams.get('after')) || 0;
  const [posts, author, firstPost] = await env.DB.batch([
    env.DB.prepare(
      `SELECT p.*, u.username, u.avatar_v FROM board_posts p LEFT JOIN users u ON u.id = p.user_id
       WHERE p.thread_id = ? AND p.id > ? ORDER BY p.id LIMIT ?`,
    ).bind(t.id, after, POSTS_PAGE + 1),
    env.DB.prepare('SELECT username FROM users WHERE id = ?').bind(t.user_id ?? 0),
    env.DB.prepare('SELECT MIN(id) AS id FROM board_posts WHERE thread_id = ?').bind(t.id),
  ]);
  const blocked = await blockedIds(env, me.id);
  const rows = (posts.results as (Post & { username: string | null; avatar_v: number | null })[]).slice(0, POSTS_PAGE);
  const first = (firstPost.results[0] as { id: number | null } | undefined)?.id ?? 0;
  const b = BOARDS.find((x) => x.id === t.board);
  return json({
    thread: {
      id: t.id,
      board: t.board,
      boardName: b?.name ?? t.board,
      title: t.title,
      author: (author.results[0] as { username: string } | undefined)?.username ?? null,
      replies: t.replies,
      pinned: !!t.pinned,
      locked: !!t.locked,
      createdAt: t.created_at,
      canReply: !t.locked || !!me.is_admin,
      canModerate: !!me.is_admin,
      mine: t.user_id === me.id,
    },
    posts: rows.map((p) => (p.user_id && blocked.has(p.user_id) ? { ...shownPost(p, me, p.id === first), body: '', hidden: true } : shownPost(p, me, p.id === first))),
    more: posts.results.length > POSTS_PAGE,
  });
}

export async function reply(req: Request, env: Env, raw: string): Promise<Response> {
  const me = await requireUser(req, env);
  const t = await getThread(env, raw);
  if (t.locked && !me.is_admin) throw new HttpError(403, 'locked', 'This thread is locked.');
  await limited(env, me);
  const body = cleanBody((await readJson(req)).body);
  const now = Math.floor(Date.now() / 1000);
  const [post] = await env.DB.batch([
    env.DB.prepare('INSERT INTO board_posts (thread_id, user_id, body, created_at) VALUES (?, ?, ?, ?) RETURNING id').bind(t.id, me.id, body, now),
    env.DB.prepare('UPDATE board_threads SET replies = replies + 1, last_at = ? WHERE id = ?').bind(now, t.id),
  ]);
  // Everyone in the conversation hears about it (but not too many, and not the person replying).
  const { results } = await env.DB.prepare(
    `SELECT user_id FROM board_posts WHERE thread_id = ? AND user_id IS NOT NULL AND user_id != ? AND deleted = 0
     GROUP BY user_id ORDER BY MAX(id) DESC LIMIT ?`,
  )
    .bind(t.id, me.id, MAX_NOTIFIED)
    .all<{ user_id: number }>();
  const blocked = await blockedIds(env, me.id);
  for (const { user_id } of results) {
    if (blocked.has(user_id)) continue;
    await addNotification(env, user_id, 'forum-reply', { thread: t.id, title: t.title, author: me.username });
  }
  return json({ id: (post.results[0] as { id: number }).id }, 201);
}

export async function updateThread(req: Request, env: Env, raw: string): Promise<Response> {
  const me = await requireUser(req, env);
  const t = await getThread(env, raw);
  const input = await readJson(req);
  if (input.title !== undefined) {
    if (t.user_id !== me.id && !me.is_admin) throw new HttpError(403, 'not_yours', 'Only its writer can rename a thread.');
    const title = cleanTitle(input.title);
    if (!title) throw new HttpError(400, 'no_title', 'Give your thread a title.');
    await env.DB.prepare('UPDATE board_threads SET title = ? WHERE id = ?').bind(title, t.id).run();
  }
  if (input.pinned !== undefined || input.locked !== undefined) {
    if (!me.is_admin) throw new HttpError(403, 'admins_only', 'Only admins can pin or lock threads.');
    await env.DB.prepare('UPDATE board_threads SET pinned = ?, locked = ? WHERE id = ?')
      .bind(input.pinned === undefined ? t.pinned : input.pinned ? 1 : 0, input.locked === undefined ? t.locked : input.locked ? 1 : 0, t.id)
      .run();
  }
  return json({});
}

export async function deleteThread(req: Request, env: Env, raw: string): Promise<Response> {
  const me = await requireUser(req, env);
  const t = await getThread(env, raw);
  if (!me.is_admin && !(t.user_id === me.id && t.replies === 0)) {
    throw new HttpError(403, 'not_yours', t.user_id === me.id ? 'People have replied, so the thread stays. You can still take your post down.' : 'That isn’t your thread.');
  }
  await env.DB.prepare('DELETE FROM board_threads WHERE id = ?').bind(t.id).run();
  return json({});
}

async function getPost(env: Env, raw: string): Promise<Post> {
  const p = await env.DB.prepare('SELECT * FROM board_posts WHERE id = ?').bind(Number(raw)).first<Post>();
  if (!p || p.deleted) throw new HttpError(404, 'no_such_post', 'That post doesn’t exist any more.');
  return p;
}

export async function editPost(req: Request, env: Env, raw: string): Promise<Response> {
  const me = await requireUser(req, env);
  const p = await getPost(env, raw);
  if (p.user_id !== me.id) throw new HttpError(403, 'not_yours', 'You can only change your own posts.');
  const body = cleanBody((await readJson(req)).body);
  await env.DB.prepare('UPDATE board_posts SET body = ?, edited_at = unixepoch() WHERE id = ?').bind(body, p.id).run();
  return json({});
}

export async function deletePost(req: Request, env: Env, raw: string): Promise<Response> {
  const me = await requireUser(req, env);
  const p = await getPost(env, raw);
  if (p.user_id !== me.id && !me.is_admin) throw new HttpError(403, 'not_yours', 'You can only take down your own posts.');
  await env.DB.prepare("UPDATE board_posts SET deleted = 1, body = '' WHERE id = ?").bind(p.id).run();
  return json({});
}
