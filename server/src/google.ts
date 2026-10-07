// "Continue with Google". The app starts a request, opens Google in the system browser and
// polls until Google sends the browser back here. That works the same in the desktop app,
// on phones and on the web, without the app having to receive the redirect itself.
import { checkUsername, randomId, signedIn } from './auth';
import { emailReady } from './email';
import { HttpError, json, readJson, str } from './http';

const REQUEST_TTL = 10 * 60;

type Request_ = {
  id: string;
  state: string;
  status: 'waiting' | 'done' | 'needs_username' | 'failed';
  user_id: number | null;
  google_sub: string | null;
  email: string | null;
  error: string | null;
  created_at: number;
};

const enabled = (env: Env) => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
const redirectUri = (req: Request) => `${new URL(req.url).origin}/api/auth/google/callback`;

export async function options(_req: Request, env: Env): Promise<Response> {
  // While email is off, nobody is asked to confirm one, and only Google can make new accounts.
  return json({ google: enabled(env), email: emailReady(env) });
}

export async function start(req: Request, env: Env): Promise<Response> {
  if (!enabled(env)) throw new HttpError(503, 'google_off', "Google sign-in isn't set up yet.");
  const id = randomId(24);
  const state = randomId(24);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM oauth_requests WHERE created_at < unixepoch() - ?').bind(REQUEST_TTL),
    env.DB.prepare('INSERT INTO oauth_requests (id, state) VALUES (?, ?)').bind(id, state),
  ]);
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(req),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  }).toString();
  return json({ id, url: url.href });
}

/** Google sends the browser here after the person picks an account. */
export async function callback(req: Request, env: Env): Promise<Response> {
  const params = new URL(req.url).searchParams;
  const row = await env.DB.prepare('SELECT * FROM oauth_requests WHERE state = ? AND created_at > unixepoch() - ?')
    .bind(params.get('state') ?? '', REQUEST_TTL)
    .first<Request_>();
  if (!row) return page('That sign-in link has expired', 'Go back to Bigglenet and try again.');
  const fail = async (error: string) => {
    await env.DB.prepare("UPDATE oauth_requests SET status = 'failed', error = ? WHERE id = ?").bind(error, row.id).run();
    return page("Couldn't sign you in", `${error} Go back to Bigglenet and try again.`);
  };
  if (params.get('error')) return fail('Google sign-in was cancelled.');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: params.get('code') ?? '',
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(req),
      grant_type: 'authorization_code',
    }),
  });
  const tokens = await res.json<{ id_token?: string }>().catch(() => ({}) as { id_token?: string });
  if (!res.ok || !tokens.id_token) return fail('Google said no.');

  // The ID token came straight from Google over TLS, in exchange for our client secret,
  // so its claims can be read without checking the signature again.
  const claims = JSON.parse(atob(tokens.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  const sub = String(claims.sub ?? '');
  const email = claims.email_verified ? String(claims.email ?? '').toLowerCase() : null;
  if (!sub) return fail('Google didn\'t say who you are.');

  const linked = await env.DB.prepare('SELECT id FROM users WHERE google_sub = ?').bind(sub).first<{ id: number }>();
  const byEmail = !linked && email ? await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: number }>() : null;
  const userId = linked?.id ?? byEmail?.id ?? null;
  if (byEmail) {
    await env.DB.prepare('UPDATE users SET google_sub = ?, email_verified = 1 WHERE id = ?').bind(sub, byEmail.id).run();
  }
  await env.DB.prepare('UPDATE oauth_requests SET status = ?, user_id = ?, google_sub = ?, email = ? WHERE id = ?')
    .bind(userId ? 'done' : 'needs_username', userId, sub, email, row.id)
    .run();
  return page("You're signed in", 'Go back to Bigglenet. You can close this tab.');
}

/** The app asks: has the person finished with Google yet? */
export async function poll(req: Request, env: Env): Promise<Response> {
  const id = str((await readJson(req)).id);
  const row = await env.DB.prepare('SELECT * FROM oauth_requests WHERE id = ? AND created_at > unixepoch() - ?')
    .bind(id, REQUEST_TTL)
    .first<Request_>();
  if (!row) throw new HttpError(400, 'expired', 'That sign-in has expired. Try again.');
  if (row.status === 'failed') throw new HttpError(400, 'google_failed', row.error ?? "Couldn't sign you in with Google.");
  if (row.status === 'needs_username') return json({ needsUsername: true, email: row.email });
  if (row.status === 'waiting') return json({ waiting: true });
  await env.DB.prepare('DELETE FROM oauth_requests WHERE id = ?').bind(id).run();
  return signedIn(env, row.user_id!);
}

/** First time with Google: pick a username, then the account is made. */
export async function finish(req: Request, env: Env): Promise<Response> {
  const body = await readJson(req);
  const row = await env.DB.prepare("SELECT * FROM oauth_requests WHERE id = ? AND status = 'needs_username' AND created_at > unixepoch() - ?")
    .bind(str(body.id), REQUEST_TTL)
    .first<Request_>();
  if (!row) throw new HttpError(400, 'expired', 'That sign-in has expired. Try again.');
  const username = await checkUsername(env, str(body.username));
  let created;
  try {
    created = await env.DB.prepare(
      `INSERT INTO users (username, password_hash, password_salt, email, email_verified, google_sub)
       VALUES (?, '', '', ?, ?, ?) RETURNING id`,
    )
      .bind(username, row.email, row.email ? 1 : 0, row.google_sub)
      .first<{ id: number }>();
  } catch (e) {
    if (String(e).includes('UNIQUE')) throw new HttpError(409, 'username_taken', 'That username is taken.');
    throw e;
  }
  await env.DB.prepare('DELETE FROM oauth_requests WHERE id = ?').bind(row.id).run();
  return signedIn(env, created!.id, 201);
}

function page(title: string, body: string): Response {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Bigglenet</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,-apple-system,sans-serif;background:#f6f4f0;color:#222;text-align:center;padding:24px}
@media (prefers-color-scheme:dark){body{background:#1c1c1c;color:#f6f4f0}}
b{display:block;font-size:28px;letter-spacing:-0.02em;margin-bottom:24px}h1{font-size:24px;margin:0 0 8px}p{opacity:.7;margin:0}</style>
<main><b>b.net</b><h1>${title}</h1><p>${body}</p></main>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" } },
  );
}
