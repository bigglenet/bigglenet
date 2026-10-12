// Admin-only: .biggle names and the user list.
import { requireAdmin } from './auth';
import { forget } from './gateway';
import { HttpError, json, NAME_RE, readJson, siteKey, splitAddress, str } from './http';
import { moveSite } from './sites';

export async function listNames(req: Request, env: Env): Promise<Response> {
  await requireAdmin(req, env);
  const { results } = await env.DB.prepare(
    `SELECT n.name, n.tld, n.url, n.title, n.status, n.live, n.direct, n.own_window, n.review_note AS note, n.created_at, n.updated_at, u.username AS owner,
       (SELECT COUNT(*) FROM site_files f WHERE f.site = n.name) AS files,
       (SELECT COALESCE(SUM(size), 0) FROM site_files f WHERE f.site = n.name) AS size,
       (SELECT COUNT(*) FROM site_visits v WHERE v.site = n.name) AS visits
     FROM names n LEFT JOIN users u ON u.id = n.owner_id ORDER BY n.name`,
  ).all();
  return json({ names: results });
}

export async function setName(req: Request, env: Env, rawName: string): Promise<Response> {
  await requireAdmin(req, env);
  const address = splitAddress(decodeURIComponent(rawName));
  if (!NAME_RE.test(address.name)) {
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
  // A direct link loads the real website straight from its host, at exactly the address given
  // (a game's index.html, say). A live app goes through the gateway, which turns its normal web
  // pages into .bhtml, so it points at a folder.
  const direct = body.direct === true ? 1 : 0;
  url.hash = '';
  if (!direct) {
    url.search = '';
    if (!url.pathname.endsWith('/')) url.pathname += '/';
  }
  const title = str(body.title).trim().slice(0, 100) || null;
  const live = body.live === true && !direct ? 1 : 0;
  // Some direct sites have to open in a window of their own: games that need cross-origin
  // isolation, and sites that won't be shown inside other apps. Asked for, or found out here.
  const ownWindow = direct ? Math.max(body.window === true ? WINDOW : 0, await needsOwnWindow(req, url)) : 0;
  const tld = body.tld === 'b' || body.tld === 'biggle' ? body.tld : (address.tld ?? 'biggle');
  const name = siteKey(address.name, tld);

  await env.DB.prepare(
    `INSERT INTO names (name, url, title, status, live, direct, own_window, tld) VALUES (?, ?, ?, 'live', ?, ?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET url = excluded.url, title = excluded.title, status = 'live', live = excluded.live,
       direct = excluded.direct, own_window = excluded.own_window, tld = excluded.tld, updated_at = unixepoch()`,
  )
    .bind(name, url.href, title, live, direct, ownWindow, tld)
    .run();
  forget(name);
  return json({ name, url: url.href, title, live: !!live, direct: !!direct, window: ownWindow > 0, tld });
}

/** names.own_window: in a tab, in a window of its own, or in one through the desktop app's relay. */
const WINDOW = 1;
const WINDOW_RELAY = 2;

/**
 * Whether a direct site has to open in a window of its own instead of inside a tab: it asks for
 * cross-origin isolation (Cross-Origin-Embedder-Policy, for games with threads), which a page
 * only gets at the top, or it won't be shown inside other apps (X-Frame-Options, CSP
 * frame-ancestors). COEP "credentialless" also needs the desktop app's relay on macOS and Linux,
 * whose engine only understands "require-corp".
 */
async function needsOwnWindow(req: Request, url: URL): Promise<number> {
  if (url.host === new URL(req.url).host) throw new HttpError(400, 'bad_url', "A direct link can't point at the Bigglenet itself.");
  let res: Response;
  try {
    res = await fetch(url, { headers: { 'User-Agent': 'Bigglenet/1 (+https://bigglenet.ethembeldagli.dev)' } });
  } catch {
    throw new HttpError(400, 'unreachable', "Couldn't reach that website.");
  }
  await res.body?.cancel();
  const coep = (res.headers.get('Cross-Origin-Embedder-Policy') ?? '').toLowerCase();
  if (coep.includes('credentialless')) return WINDOW_RELAY;
  if (coep.includes('require-corp')) return WINDOW;
  const xfo = (res.headers.get('X-Frame-Options') ?? '').toLowerCase();
  if (xfo.includes('deny') || xfo.includes('sameorigin')) return WINDOW;
  const ancestors = /(?:^|;)\s*frame-ancestors\s+([^;]*)/i.exec(res.headers.get('Content-Security-Policy') ?? '')?.[1].trim().split(/\s+/);
  return ancestors && !ancestors.includes('*') ? WINDOW : 0;
}

/** Change a site's address ending: name.biggle or name.b. */
export async function setTld(req: Request, env: Env, rawName: string): Promise<Response> {
  await requireAdmin(req, env);
  const key = decodeURIComponent(rawName).toLowerCase();
  const tld = str((await readJson(req)).tld) === 'b' ? 'b' : 'biggle';
  if (!(await env.DB.prepare('SELECT 1 FROM names WHERE name = ?').bind(key).first())) {
    throw new HttpError(404, 'no_such_site', `${key} doesn't exist.`);
  }
  return json({ name: await moveSite(env, key, tld), tld });
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
