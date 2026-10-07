// Biggle ID: accounts, invite codes and sessions.
import { HttpError, json, readJson, str, USERNAME_RE } from './http';

export type User = { id: number; username: string; is_admin: number };

const ITERATIONS = 100_000;
const SESSION_TTL = 90 * 86400;

const enc = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function sha256Hex(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, key, 256);
  return new Uint8Array(bits);
}

export const publicUser = (u: User) => ({ username: u.username, admin: !!u.is_admin });

async function createSession(env: Env, userId: number): Promise<string> {
  const token = base64url(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id) VALUES (?, ?)').bind(await sha256Hex(token), userId).run();
  return token;
}

export async function userForToken(env: Env, token: string): Promise<User | null> {
  const hash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT u.id, u.username, u.is_admin, s.last_seen
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
  )
    .bind(hash)
    .first<User & { last_seen: number }>();
  if (!row) return null;
  const now = Math.floor(Date.now() / 1000);
  if (now - row.last_seen > SESSION_TTL) {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(hash).run();
    return null;
  }
  if (now - row.last_seen > 86400) {
    await env.DB.prepare('UPDATE sessions SET last_seen = ? WHERE token_hash = ?').bind(now, hash).run();
  }
  return { id: row.id, username: row.username, is_admin: row.is_admin };
}

function bearer(req: Request): string | null {
  return req.headers.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1] ?? null;
}

export async function requireUser(req: Request, env: Env): Promise<User> {
  const token = bearer(req);
  const user = token && (await userForToken(env, token));
  if (!user) throw new HttpError(401, 'signed_out', 'Sign in first.');
  return user;
}

export async function requireAdmin(req: Request, env: Env): Promise<User> {
  const user = await requireUser(req, env);
  if (!user.is_admin) throw new HttpError(403, 'not_admin', 'Only admins can do that.');
  return user;
}

function checkPassword(password: string) {
  if (password.length < 8) throw new HttpError(400, 'weak_password', 'Use at least 8 characters for your password.');
  if (password.length > 200) throw new HttpError(400, 'weak_password', "That password's too long.");
}

export async function signup(req: Request, env: Env): Promise<Response> {
  const body = await readJson(req);
  const username = str(body.username).trim().toLowerCase();
  const password = str(body.password);
  const invite = str(body.invite).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!USERNAME_RE.test(username)) {
    throw new HttpError(400, 'bad_username', 'Usernames are 2–24 characters: a–z, 0–9 and _.');
  }
  checkPassword(password);
  if (!invite) throw new HttpError(400, 'bad_invite', 'You need an invite code to join.');

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await hashPassword(password, salt);

  // Claim the invite and create the user in one transaction, so a code can only be used once.
  let results;
  try {
    // The very first account becomes the admin.
    results = await env.DB.batch<{ id: number; is_admin: number }>([
      env.DB.prepare('UPDATE invites SET used_at = unixepoch() WHERE code = ? AND used_at IS NULL').bind(invite),
      env.DB.prepare(
        `INSERT INTO users (username, password_hash, password_salt, is_admin)
         SELECT ?, ?, ?, NOT EXISTS (SELECT 1 FROM users) WHERE changes() = 1
         RETURNING id, is_admin`,
      ).bind(username, toBase64(hash), toBase64(salt)),
    ]);
  } catch (e) {
    if (String(e).includes('UNIQUE')) throw new HttpError(409, 'username_taken', 'That username is taken.');
    throw e;
  }
  const created = results[1].results[0];
  if (!created) throw new HttpError(400, 'bad_invite', "That invite code doesn't work. It may have been used already.");
  const { id, is_admin } = created;
  await env.DB.prepare('UPDATE invites SET used_by = ? WHERE code = ?').bind(id, invite).run();

  const user: User = { id, username, is_admin };
  return json({ token: await createSession(env, id), user: publicUser(user) }, 201);
}

export async function login(req: Request, env: Env): Promise<Response> {
  const body = await readJson(req);
  const username = str(body.username).trim().toLowerCase();
  const password = str(body.password);
  const row = await env.DB.prepare('SELECT id, username, is_admin, password_hash, password_salt FROM users WHERE username = ?')
    .bind(username)
    .first<User & { password_hash: string; password_salt: string }>();

  // Hash even when the user doesn't exist, so timing doesn't reveal which usernames are real.
  const salt = row ? fromBase64(row.password_salt) : new Uint8Array(16);
  const hash = await hashPassword(password, salt);
  const expected = row ? fromBase64(row.password_hash) : new Uint8Array(32);
  if (!row || hash.length !== expected.length || !crypto.subtle.timingSafeEqual(hash, expected)) {
    throw new HttpError(401, 'bad_login', 'Wrong username or password.');
  }
  return json({ token: await createSession(env, row.id), user: publicUser(row) });
}

export async function logout(req: Request, env: Env): Promise<Response> {
  const token = bearer(req);
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
  return json({});
}

export async function me(req: Request, env: Env): Promise<Response> {
  return json({ user: publicUser(await requireUser(req, env)) });
}
