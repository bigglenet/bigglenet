// Admin-only: .biggle names and the user list.
import { requireAdmin } from './auth';
import { forget } from './gateway';
import { HttpError, json, NAME_RE, readJson, str } from './http';

export async function listNames(req: Request, env: Env): Promise<Response> {
  await requireAdmin(req, env);
  const { results } = await env.DB.prepare(
    `SELECT n.name, n.tld, n.url, n.title, n.status, n.live, n.review_note AS note, n.created_at, n.updated_at, u.username AS owner,
       (SELECT COUNT(*) FROM site_files f WHERE f.site = n.name) AS files,
       (SELECT COALESCE(SUM(size), 0) FROM site_files f WHERE f.site = n.name) AS size
     FROM names n LEFT JOIN users u ON u.id = n.owner_id ORDER BY n.name`,
  ).all();
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
  // A live app's normal web pages are shown as they are, instead of needing .bhtml.
  const live = body.live === true ? 1 : 0;
  const tld = body.tld === 'b' ? 'b' : 'biggle';

  await env.DB.prepare(
    `INSERT INTO names (name, url, title, status, live, tld) VALUES (?, ?, ?, 'live', ?, ?)
     ON CONFLICT(name) DO UPDATE SET url = excluded.url, title = excluded.title, status = 'live', live = excluded.live,
       tld = excluded.tld, updated_at = unixepoch()`,
  )
    .bind(name, url.href, title, live, tld)
    .run();
  forget(name);
  return json({ name, url: url.href, title, live: !!live, tld });
}

/** Change a site's address ending: name.biggle or name.b. */
export async function setTld(req: Request, env: Env, rawName: string): Promise<Response> {
  await requireAdmin(req, env);
  const name = rawName.toLowerCase();
  const tld = str((await readJson(req)).tld) === 'b' ? 'b' : 'biggle';
  const row = await env.DB.prepare('UPDATE names SET tld = ?, updated_at = unixepoch() WHERE name = ? RETURNING name').bind(tld, name).first();
  if (!row) throw new HttpError(404, 'no_such_site', `${name} doesn't exist.`);
  forget(name);
  return json({ name, tld });
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
    'SELECT username, is_admin AS admin, trusted, created_at FROM users ORDER BY created_at',
  ).all<{ username: string; admin: number; trusted: number; created_at: number }>();
  return json({ users: results.map((u) => ({ ...u, admin: !!u.admin, trusted: !!u.trusted })) });
}

/** Trust someone (they can give their sites .b addresses), or stop trusting them. */
export async function setTrusted(req: Request, env: Env, username: string): Promise<Response> {
  await requireAdmin(req, env);
  const trusted = (await readJson(req)).trusted === true ? 1 : 0;
  const row = await env.DB.prepare('UPDATE users SET trusted = ? WHERE username = ? RETURNING id')
    .bind(trusted, decodeURIComponent(username).toLowerCase())
    .first<{ id: number }>();
  if (!row) throw new HttpError(404, 'no_such_user', `There's nobody called ${username}.`);
  return json({ username, trusted: !!trusted });
}
