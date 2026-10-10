// Telling a site's own server who is signed in. A page calls biggle.idToken() and sends the token
// to its server, which asks GET /api/identity/verify whether it's genuine and whose it is. Tokens
// name the site they were made for, so one site can't use another site's token.
import { base64url, requireUser } from './auth';
import { HttpError, json, readJson, SITE_KEY_RE, str } from './http';

const TTL = 60 * 60;
const TOKEN_RE = /^([a-z0-9-]+(?:\.b)?)\.([a-z0-9_]+)\.(\d+)\.([A-Za-z0-9_-]+)$/;

async function sign(env: Env, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.PREVIEW_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`identity:${payload}`))));
}

/** POST /api/identity/token { site } → a token saying the signed-in user is visiting that site. */
export async function issue(req: Request, env: Env): Promise<Response> {
  const user = await requireUser(req, env);
  const site = str((await readJson(req)).site).toLowerCase();
  if (!SITE_KEY_RE.test(site)) throw new HttpError(400, 'bad_name', "That isn't a site name.");
  const expires = Math.floor(Date.now() / 1000) + TTL;
  const payload = `${site}.${user.username}.${expires}`;
  return json({ token: `${payload}.${await sign(env, payload)}`, expires });
}

/** GET /api/identity/verify?site=…&token=… → { username } if the token is genuine and for that site. */
export async function verify(req: Request, env: Env): Promise<Response> {
  const params = new URL(req.url).searchParams;
  const m = TOKEN_RE.exec(params.get('token') ?? '');
  const bad = () => new HttpError(401, 'bad_token', "That token isn't valid for this site.");
  if (!m || m[1] !== (params.get('site') ?? '').toLowerCase() || Number(m[3]) < Date.now() / 1000) throw bad();
  const expected = new TextEncoder().encode(await sign(env, `${m[1]}.${m[2]}.${m[3]}`));
  const given = new TextEncoder().encode(m[4]);
  if (expected.length !== given.length || !crypto.subtle.timingSafeEqual(expected, given)) throw bad();
  // The account must still exist.
  if (!(await env.DB.prepare('SELECT 1 FROM users WHERE username = ?').bind(m[2]).first())) throw bad();
  return json({ username: m[2], site: m[1] });
}
