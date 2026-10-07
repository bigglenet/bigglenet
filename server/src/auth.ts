// Biggle ID: accounts and sessions.
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

const RESERVED = new Set([
  'admin', 'administrator', 'root', 'system', 'support', 'help', 'staff', 'official',
  'mod', 'moderator', 'biggle', 'bigglenet', 'home', 'me', 'everyone', 'nobody', 'null', 'undefined',
]);

/** One limit per client IP, so a single visitor can't hammer sign-up or sign-in. */
async function limitByIp(req: Request, limiter: RateLimit, what: string) {
  const ip = req.headers.get('CF-Connecting-IP') ?? 'local';
  const { success } = await limiter.limit({ key: ip });
  if (!success) throw new HttpError(429, 'slow_down', `Too many ${what} attempts. Wait a minute and try again.`);
}

export async function signup(req: Request, env: Env): Promise<Response> {
  await limitByIp(req, env.SIGNUP_LIMIT, 'sign-up');
  const body = await readJson(req);
  const username = str(body.username).trim().toLowerCase();
  const password = str(body.password);
  if (!USERNAME_RE.test(username)) {
    throw new HttpError(400, 'bad_username', 'Usernames are 2–24 characters: a–z, 0–9 and _.');
  }
  if (RESERVED.has(username)) throw new HttpError(409, 'username_taken', 'That username is taken.');
  checkPassword(password);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await hashPassword(password, salt);

  // Nobody becomes an admin by signing up. Admins are made with `npm run promote`.
  let created;
  try {
    created = await env.DB.prepare('INSERT INTO users (username, password_hash, password_salt) VALUES (?, ?, ?) RETURNING id')
      .bind(username, toBase64(hash), toBase64(salt))
      .first<{ id: number }>();
  } catch (e) {
    if (String(e).includes('UNIQUE')) throw new HttpError(409, 'username_taken', 'That username is taken.');
    throw e;
  }
  const user: User = { id: created!.id, username, is_admin: 0 };
  return json({ token: await createSession(env, user.id), user: publicUser(user) }, 201);
}

export async function login(req: Request, env: Env): Promise<Response> {
  await limitByIp(req, env.LOGIN_LIMIT, 'sign-in');
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
