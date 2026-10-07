// Biggle ID: accounts and sessions. Every account has a confirmed email address
// (checked with an emailed code) or signs in with Google.
import { emailReady, sendCode } from './email';
import { HttpError, json, readJson, str, USERNAME_RE } from './http';

export type User = { id: number; username: string; is_admin: number; email: string | null; email_verified: number };

const ITERATIONS = 100_000;
const SESSION_TTL = 90 * 86400;
const CODE_TTL = 15 * 60;
const CODE_ATTEMPTS = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const enc = new TextEncoder();

export function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const randomId = (bytes = 16) => base64url(crypto.getRandomValues(new Uint8Array(bytes)));

async function sha256Hex(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, key, 256);
  return new Uint8Array(bits);
}

async function newPasswordHash(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { hash: toBase64(await hashPassword(password, salt)), salt: toBase64(salt) };
}

export const publicUser = (u: User) => ({
  username: u.username,
  admin: !!u.is_admin,
  email: u.email,
  emailVerified: !!u.email_verified,
});

const USER_COLUMNS = 'u.id, u.username, u.is_admin, u.email, u.email_verified';

export async function createSession(env: Env, userId: number): Promise<string> {
  const token = base64url(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id) VALUES (?, ?)').bind(await sha256Hex(token), userId).run();
  return token;
}

export async function userById(env: Env, id: number): Promise<User> {
  return (await env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users u WHERE u.id = ?`).bind(id).first<User>())!;
}

export async function signedIn(env: Env, userId: number, status = 200): Promise<Response> {
  return json({ token: await createSession(env, userId), user: publicUser(await userById(env, userId)) }, status);
}

export async function userForToken(env: Env, token: string): Promise<User | null> {
  const hash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT ${USER_COLUMNS}, s.last_seen FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
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
  const { last_seen: _, ...user } = row;
  return user;
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

function checkEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) throw new HttpError(400, 'bad_email', "That doesn't look like an email address.");
  return email;
}

const RESERVED = new Set([
  'admin', 'administrator', 'root', 'system', 'support', 'help', 'staff', 'official',
  'mod', 'moderator', 'biggle', 'bigglenet', 'home', 'me', 'everyone', 'nobody', 'null', 'undefined',
]);

export async function checkUsername(env: Env, raw: string): Promise<string> {
  const username = raw.trim().toLowerCase();
  if (!USERNAME_RE.test(username)) {
    throw new HttpError(400, 'bad_username', 'Usernames are 2–24 characters: a–z, 0–9 and _.');
  }
  const taken = RESERVED.has(username) || (await env.DB.prepare('SELECT 1 FROM users WHERE username = ?').bind(username).first());
  if (taken) throw new HttpError(409, 'username_taken', 'That username is taken.');
  return username;
}

async function emailTaken(env: Env, email: string): Promise<boolean> {
  return !!(await env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first());
}

/** One limit per client IP, so a single visitor can't hammer sign-up or sign-in. */
async function limitByIp(req: Request, limiter: RateLimit, what: string) {
  const ip = req.headers.get('CF-Connecting-IP') ?? 'local';
  const { success } = await limiter.limit({ key: ip });
  if (!success) throw new HttpError(429, 'slow_down', `Too many ${what} attempts. Wait a minute and try again.`);
}

// --- Emailed codes ---

type Purpose = 'signup' | 'verify' | 'reset';
type CodeRow = { id: string; email: string; purpose: Purpose; code_hash: string; data: string | null; attempts: number; expires_at: number };

/** Make a code, email it (unless `send` is false) and return the ticket the app uses to finish. */
async function issueCode(env: Env, email: string, purpose: Purpose, data: unknown, send = true) {
  if (!emailReady(env)) {
    throw new HttpError(503, 'email_off', purpose === 'signup' ? 'New accounts open soon.' : "Email isn't switched on yet. Try again soon.");
  }
  const id = randomId();
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  const code = String(n).padStart(6, '0');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM email_codes WHERE email = ? AND purpose = ?').bind(email, purpose),
    env.DB.prepare('DELETE FROM email_codes WHERE expires_at < unixepoch()'),
    env.DB.prepare('INSERT INTO email_codes (id, email, purpose, code_hash, data, expires_at) VALUES (?, ?, ?, ?, ?, ?)').bind(
      id,
      email,
      purpose,
      await sha256Hex(`${id}:${code}`),
      JSON.stringify(data),
      Math.floor(Date.now() / 1000) + CODE_TTL,
    ),
  ]);
  const devCode = send ? await sendCode(env, email, code, purpose) : null;
  return { ticket: id, ...(devCode ? { devCode } : {}) };
}

/** Check a code. Returns its row, and uses it up. */
async function redeemCode(env: Env, ticket: string, code: string, purpose: Purpose): Promise<CodeRow> {
  const row = await env.DB.prepare('SELECT * FROM email_codes WHERE id = ? AND purpose = ?').bind(ticket, purpose).first<CodeRow>();
  const expired = !row || row.expires_at < Date.now() / 1000 || row.attempts >= CODE_ATTEMPTS;
  if (expired) throw new HttpError(400, 'code_expired', 'That code has expired. Ask for a new one.');
  if ((await sha256Hex(`${ticket}:${code.trim()}`)) !== row.code_hash) {
    await env.DB.prepare('UPDATE email_codes SET attempts = attempts + 1 WHERE id = ?').bind(ticket).run();
    throw new HttpError(400, 'wrong_code', "That code isn't right. Check the email and try again.");
  }
  await env.DB.prepare('DELETE FROM email_codes WHERE id = ?').bind(ticket).run();
  return row;
}

// --- Sign up with email ---

export async function signupStart(req: Request, env: Env): Promise<Response> {
  await limitByIp(req, env.SIGNUP_LIMIT, 'sign-up');
  const body = await readJson(req);
  const email = checkEmail(str(body.email));
  const username = await checkUsername(env, str(body.username));
  const password = str(body.password);
  checkPassword(password);
  if (await emailTaken(env, email)) throw new HttpError(409, 'email_taken', 'There is already an account with that email. Try signing in.');
  const { hash, salt } = await newPasswordHash(password);
  return json(await issueCode(env, email, 'signup', { username, hash, salt }));
}

export async function signupFinish(req: Request, env: Env): Promise<Response> {
  const body = await readJson(req);
  const row = await redeemCode(env, str(body.ticket), str(body.code), 'signup');
  const { username, hash, salt } = JSON.parse(row.data ?? '{}');
  let created;
  try {
    created = await env.DB.prepare(
      'INSERT INTO users (username, password_hash, password_salt, email, email_verified) VALUES (?, ?, ?, ?, 1) RETURNING id',
    )
      .bind(username, hash, salt, row.email)
      .first<{ id: number }>();
  } catch (e) {
    if (String(e).includes('UNIQUE')) throw new HttpError(409, 'username_taken', 'Someone just took that username or email. Start again.');
    throw e;
  }
  return signedIn(env, created!.id, 201);
}

/** The old one-step sign-up, used by Biggle 0.1.1 and earlier. */
export async function signupOld(): Promise<Response> {
  throw new HttpError(410, 'update_needed', 'Update Bigglenet to make an account. You can still sign in.');
}

// --- Sign in ---

export async function login(req: Request, env: Env): Promise<Response> {
  await limitByIp(req, env.LOGIN_LIMIT, 'sign-in');
  const body = await readJson(req);
  const login = str(body.username || body.login).trim().toLowerCase();
  const password = str(body.password);
  const row = await env.DB.prepare(
    `SELECT ${USER_COLUMNS}, u.password_hash, u.password_salt FROM users u WHERE u.username = ? OR u.email = ?`,
  )
    .bind(login, login)
    .first<User & { password_hash: string; password_salt: string }>();

  if (row && !row.password_hash) {
    throw new HttpError(400, 'use_google', 'This account signs in with Google. Use "Continue with Google".');
  }
  // Hash even when the user doesn't exist, so timing doesn't reveal which accounts are real.
  const salt = row ? fromBase64(row.password_salt) : new Uint8Array(16);
  const hash = await hashPassword(password, salt);
  const expected = row ? fromBase64(row.password_hash) : new Uint8Array(32);
  if (!row || hash.length !== expected.length || !crypto.subtle.timingSafeEqual(hash, expected)) {
    throw new HttpError(401, 'bad_login', 'Wrong username, email or password.');
  }
  return signedIn(env, row.id);
}

export async function logout(req: Request, env: Env): Promise<Response> {
  const token = bearer(req);
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
  return json({});
}

export async function me(req: Request, env: Env): Promise<Response> {
  return json({ user: publicUser(await requireUser(req, env)) });
}

// --- Add or change the email on an account ---

export async function emailStart(req: Request, env: Env): Promise<Response> {
  const user = await requireUser(req, env);
  await limitByIp(req, env.EMAIL_LIMIT, 'email');
  const email = checkEmail(str((await readJson(req)).email));
  if (email !== user.email && (await emailTaken(env, email))) {
    throw new HttpError(409, 'email_taken', 'Another account already uses that email.');
  }
  return json(await issueCode(env, email, 'verify', { userId: user.id }));
}

export async function emailFinish(req: Request, env: Env): Promise<Response> {
  const user = await requireUser(req, env);
  const body = await readJson(req);
  const row = await redeemCode(env, str(body.ticket), str(body.code), 'verify');
  if (JSON.parse(row.data ?? '{}').userId !== user.id) throw new HttpError(400, 'code_expired', 'That code is for another account.');
  try {
    await env.DB.prepare('UPDATE users SET email = ?, email_verified = 1 WHERE id = ?').bind(row.email, user.id).run();
  } catch (e) {
    if (String(e).includes('UNIQUE')) throw new HttpError(409, 'email_taken', 'Another account already uses that email.');
    throw e;
  }
  return json({ user: publicUser(await userById(env, user.id)) });
}

// --- Forgot password ---

export async function resetStart(req: Request, env: Env): Promise<Response> {
  await limitByIp(req, env.EMAIL_LIMIT, 'reset');
  const email = checkEmail(str((await readJson(req)).email));
  const user = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: number }>();
  // Answer the same either way, so this can't be used to find out who has an account.
  return json(await issueCode(env, email, 'reset', { userId: user?.id ?? null }, !!user));
}

export async function resetFinish(req: Request, env: Env): Promise<Response> {
  const body = await readJson(req);
  const password = str(body.password);
  checkPassword(password);
  const row = await redeemCode(env, str(body.ticket), str(body.code), 'reset');
  const userId = JSON.parse(row.data ?? '{}').userId;
  if (!userId) throw new HttpError(400, 'code_expired', 'That code has expired. Ask for a new one.');
  const { hash, salt } = await newPasswordHash(password);
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET password_hash = ?, password_salt = ?, email_verified = 1 WHERE id = ?').bind(hash, salt, userId),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId),
  ]);
  return signedIn(env, userId);
}
