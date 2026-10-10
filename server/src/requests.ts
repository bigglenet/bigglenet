// Feature requests for the Bigglenet: anyone signed in can ask for something and vote for the
// requests they want most. Admins set a status (planned, done, declined) and can reply.
import { requireAdmin, requireUser, type User } from './auth';
import { HttpError, json, readJson, str } from './http';

const STATUSES = ['open', 'planned', 'done', 'declined'] as const;

type Row = {
  id: number;
  title: string;
  details: string | null;
  status: (typeof STATUSES)[number];
  reply: string | null;
  created_at: number;
  author: string | null;
  user_id: number | null;
  votes: number;
  voted: number;
};

const publicRequest = (r: Row, me: User) => ({
  id: r.id,
  title: r.title,
  details: r.details,
  status: r.status,
  reply: r.reply,
  createdAt: r.created_at,
  author: r.author,
  mine: r.user_id === me.id,
  votes: r.votes,
  voted: !!r.voted,
});

async function load(env: Env, me: User, id?: number) {
  const { results } = await env.DB.prepare(
    `SELECT r.*, u.username AS author,
       (SELECT COUNT(*) FROM request_votes v WHERE v.request_id = r.id) AS votes,
       EXISTS (SELECT 1 FROM request_votes v WHERE v.request_id = r.id AND v.user_id = ?1) AS voted
     FROM requests r LEFT JOIN users u ON u.id = r.user_id
     ${id ? 'WHERE r.id = ?2' : ''}
     ORDER BY votes DESC, r.created_at DESC`,
  )
    .bind(...(id ? [me.id, id] : [me.id]))
    .all<Row>();
  return results.map((r) => publicRequest(r, me));
}

async function find(env: Env, rawId: string) {
  const row = await env.DB.prepare('SELECT id, user_id FROM requests WHERE id = ?').bind(Number(rawId)).first<{ id: number; user_id: number | null }>();
  if (!row) throw new HttpError(404, 'no_such_request', 'That request is gone.');
  return row;
}

export async function list(req: Request, env: Env): Promise<Response> {
  const me = await requireUser(req, env);
  return json({ requests: await load(env, me) });
}

export async function create(req: Request, env: Env): Promise<Response> {
  const me = await requireUser(req, env);
  if (!(await env.MESSAGE_LIMIT.limit({ key: `request:${me.id}` })).success) {
    throw new HttpError(429, 'slow_down', 'Slow down a little, then try again.');
  }
  const body = await readJson(req);
  const title = str(body.title).replace(/\s+/g, ' ').trim();
  const details = str(body.details).trim();
  if (title.length < 3 || title.length > 120) throw new HttpError(400, 'bad_title', 'Describe your idea in 3 to 120 characters.');
  if (details.length > 2000) throw new HttpError(400, 'too_long', 'Keep the details under 2000 characters.');
  const row = await env.DB.prepare('INSERT INTO requests (user_id, title, details) VALUES (?, ?, ?) RETURNING id')
    .bind(me.id, title, details || null)
    .first<{ id: number }>();
  // Your own request starts with your vote.
  await env.DB.prepare('INSERT INTO request_votes (request_id, user_id) VALUES (?, ?)').bind(row!.id, me.id).run();
  return json({ request: (await load(env, me, row!.id))[0] }, 201);
}

export async function vote(req: Request, env: Env, id: string): Promise<Response> {
  const me = await requireUser(req, env);
  const row = await find(env, id);
  if (req.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM request_votes WHERE request_id = ? AND user_id = ?').bind(row.id, me.id).run();
  } else {
    await env.DB.prepare('INSERT OR IGNORE INTO request_votes (request_id, user_id) VALUES (?, ?)').bind(row.id, me.id).run();
  }
  return json({ request: (await load(env, me, row.id))[0] });
}

/** Admins: set the status and reply. */
export async function update(req: Request, env: Env, id: string): Promise<Response> {
  const me = await requireAdmin(req, env);
  const row = await find(env, id);
  const body = await readJson(req);
  const status = str(body.status);
  if (!(STATUSES as readonly string[]).includes(status)) throw new HttpError(400, 'bad_status', 'Pick a status.');
  const reply = str(body.reply).trim().slice(0, 1000) || null;
  await env.DB.prepare('UPDATE requests SET status = ?, reply = ? WHERE id = ?').bind(status, reply, row.id).run();
  return json({ request: (await load(env, me, row.id))[0] });
}

/** The person who asked, or an admin. */
export async function remove(req: Request, env: Env, id: string): Promise<Response> {
  const me = await requireUser(req, env);
  const row = await find(env, id);
  if (row.user_id !== me.id && !me.is_admin) throw new HttpError(403, 'not_yours', "That isn't your request.");
  await env.DB.prepare('DELETE FROM requests WHERE id = ?').bind(row.id).run();
  return json({});
}
