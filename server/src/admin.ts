// Admin-only: .biggle names and the user list.
import { requireAdmin } from './auth';
import { forget } from './gateway';
import { HttpError, json, NAME_RE, readJson, str } from './http';

export async function listNames(req: Request, env: Env): Promise<Response> {
  await requireAdmin(req, env);
  const { results } = await env.DB.prepare('SELECT name, url, title, updated_at FROM names ORDER BY name').all();
  return json({ names: results });
}

export async function setName(req: Request, env: Env, rawName: string): Promise<Response> {
  await requireAdmin(req, env);
  const name = rawName.toLowerCase();
  if (!NAME_RE.test(name)) {
    throw new HttpError(400, 'bad_name', 'Names are 1–63 characters: a–z, 0–9 and "-", not starting or ending with "-".');
  }
  const body = await readJson(req);
  let url: URL;
  try {
    url = new URL(str(body.url).trim());
  } catch {
    throw new HttpError(400, 'bad_url', "That isn't a URL.");
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new HttpError(400, 'bad_url', 'The URL must start with https://');
  }
  url.search = '';
  url.hash = '';
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  const title = str(body.title).trim().slice(0, 100) || null;

  await env.DB.prepare(
    `INSERT INTO names (name, url, title) VALUES (?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET url = excluded.url, title = excluded.title, updated_at = unixepoch()`,
  )
    .bind(name, url.href, title)
    .run();
  forget(name);
  return json({ name, url: url.href, title });
}

export async function deleteName(req: Request, env: Env, name: string): Promise<Response> {
  await requireAdmin(req, env);
  await env.DB.prepare('DELETE FROM names WHERE name = ?').bind(name.toLowerCase()).run();
  forget(name.toLowerCase());
  return json({});
}

export async function listUsers(req: Request, env: Env): Promise<Response> {
  await requireAdmin(req, env);
  const { results } = await env.DB.prepare(
    'SELECT username, is_admin AS admin, created_at FROM users ORDER BY created_at',
  ).all<{ username: string; admin: number; created_at: number }>();
  return json({ users: results.map((u) => ({ ...u, admin: !!u.admin })) });
}
