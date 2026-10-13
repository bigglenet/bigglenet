// Two-factor sign-in: after your password (or Google, or resetting your password), a 6-digit
// code from an authenticator app, or one of your recovery codes. Passkeys don't need it: they're
// already something you have.
//
//   GET    /api/me/2fa            { enabled, recoveryLeft }
//   POST   /api/me/2fa/setup      a new secret and its otpauth:// link (not on until confirmed)
//   POST   /api/me/2fa/enable     { secret, code } → { recoveryCodes } (shown once)
//   DELETE /api/me/2fa            { code }: turn it off (an app code or a recovery code)
//   POST   /api/auth/login/2fa    { ticket, code }: the second step of signing in
import { randomId, requireUser, signedIn } from './auth';
import { HttpError, json, readJson, str } from './http';

const STEP = 30;
const TICKET_TTL = 10 * 60;
const MAX_ATTEMPTS = 5;
const RECOVERY_CODES = 10;
const ISSUER = 'Bigglenet';
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

function base32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function unbase32(text: string): Uint8Array {
  const clean = text.toUpperCase().replace(/[\s=]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of clean) {
    const i = B32.indexOf(c);
    if (i === -1) throw new HttpError(400, 'bad_secret', 'That isn’t a valid secret.');
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** The 6-digit code for a secret at a time step (RFC 6238, SHA-1). */
async function codeAt(secret: Uint8Array, step: number): Promise<string> {
  const counter = new Uint8Array(8);
  new DataView(counter.buffer).setBigUint64(0, BigInt(step));
  const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, counter));
  const at = mac[19] & 15;
  const n = ((mac[at] & 127) << 24) | (mac[at + 1] << 16) | (mac[at + 2] << 8) | mac[at + 3];
  return String(n % 1_000_000).padStart(6, '0');
}

/** The time step a code is for, if it's right now (or a step either side), else null. */
async function matchingStep(secret: string, code: string, after = -1): Promise<number | null> {
  if (!/^\d{6}$/.test(code)) return null;
  const now = Math.floor(Date.now() / 1000 / STEP);
  const key = unbase32(secret);
  for (const step of [now, now - 1, now + 1]) {
    if (step > after && (await codeAt(key, step)) === code) return step;
  }
  return null;
}

const sha256 = async (text: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), (b) => b.toString(16).padStart(2, '0')).join('');
const normalCode = (code: string) => code.replace(/[\s-]/g, '').toLowerCase();

/** An app code (used once) or an unused recovery code. */
async function checkCode(env: Env, userId: number, raw: string): Promise<boolean> {
  const code = normalCode(raw);
  const user = await env.DB.prepare('SELECT totp_secret, totp_last FROM users WHERE id = ?').bind(userId).first<{ totp_secret: string | null; totp_last: number | null }>();
  if (!user?.totp_secret) return false;
  const step = await matchingStep(user.totp_secret, code, user.totp_last ?? -1);
  if (step !== null) {
    await env.DB.prepare('UPDATE users SET totp_last = ? WHERE id = ?').bind(step, userId).run();
    return true;
  }
  if (!/^[a-z0-9]{10}$/.test(code)) return false;
  const used = await env.DB.prepare('UPDATE recovery_codes SET used_at = unixepoch() WHERE user_id = ? AND code_hash = ? AND used_at IS NULL RETURNING user_id')
    .bind(userId, await sha256(code))
    .first();
  return !!used;
}

export async function twoFactorStatus(req: Request, env: Env): Promise<Response> {
  const me = await requireUser(req, env);
  const row = await env.DB.prepare(
    'SELECT totp_secret IS NOT NULL AS enabled, (SELECT COUNT(*) FROM recovery_codes WHERE user_id = ?1 AND used_at IS NULL) AS left FROM users WHERE id = ?1',
  )
    .bind(me.id)
    .first<{ enabled: number; left: number }>();
  return json({ enabled: !!row?.enabled, recoveryLeft: row?.left ?? 0 });
}

export async function setupTwoFactor(req: Request, env: Env): Promise<Response> {
  const me = await requireUser(req, env);
  const secret = base32(crypto.getRandomValues(new Uint8Array(20)));
  const label = encodeURIComponent(`${ISSUER}:${me.username}`);
  return json({ secret, url: `otpauth://totp/${label}?secret=${secret}&issuer=${ISSUER}&algorithm=SHA1&digits=6&period=${STEP}` });
}

export async function enableTwoFactor(req: Request, env: Env): Promise<Response> {
  const me = await requireUser(req, env);
  const input = await readJson(req);
  const secret = str(input.secret).toUpperCase().replace(/\s/g, '');
  if (secret.length < 16) throw new HttpError(400, 'bad_secret', 'Start again: that setup has expired.');
  const step = await matchingStep(secret, normalCode(str(input.code)));
  if (step === null) throw new HttpError(400, 'bad_code', 'That code isn’t right. Check the time on your phone, and try the newest code.');
  const codes = Array.from({ length: RECOVERY_CODES }, () => [...crypto.getRandomValues(new Uint8Array(10))].map((b) => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length]).join(''));
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET totp_secret = ?, totp_last = ? WHERE id = ?').bind(secret, step, me.id),
    env.DB.prepare('DELETE FROM recovery_codes WHERE user_id = ?').bind(me.id),
    ...(await Promise.all(codes.map(async (c) => env.DB.prepare('INSERT INTO recovery_codes (user_id, code_hash) VALUES (?, ?)').bind(me.id, await sha256(c))))),
  ]);
  return json({ recoveryCodes: codes.map((c) => `${c.slice(0, 5)}-${c.slice(5)}`) });
}

export async function disableTwoFactor(req: Request, env: Env): Promise<Response> {
  const me = await requireUser(req, env);
  if (!(await checkCode(env, me.id, str((await readJson(req)).code)))) throw new HttpError(400, 'bad_code', 'That code isn’t right.');
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET totp_secret = NULL, totp_last = NULL WHERE id = ?').bind(me.id),
    env.DB.prepare('DELETE FROM recovery_codes WHERE user_id = ?').bind(me.id),
  ]);
  return json({});
}

/**
 * Signed in, unless two-factor is on: then a ticket for the second step. Password sign-in,
 * Google and password resets all go through here.
 */
export async function signedInOrSecondStep(env: Env, userId: number, status = 200): Promise<Response> {
  const row = await env.DB.prepare('SELECT totp_secret IS NOT NULL AS on2fa FROM users WHERE id = ?').bind(userId).first<{ on2fa: number }>();
  if (!row?.on2fa) return signedIn(env, userId, status);
  const ticket = randomId(24);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM login_tickets WHERE created_at < unixepoch() - ?').bind(TICKET_TTL),
    env.DB.prepare('INSERT INTO login_tickets (id, user_id) VALUES (?, ?)').bind(ticket, userId),
  ]);
  return json({ needs2fa: true, ticket });
}

export async function secondStep(req: Request, env: Env): Promise<Response> {
  const input = await readJson(req);
  const ticket = await env.DB.prepare('SELECT id, user_id, attempts FROM login_tickets WHERE id = ? AND created_at > unixepoch() - ?')
    .bind(str(input.ticket), TICKET_TTL)
    .first<{ id: string; user_id: number; attempts: number }>();
  if (!ticket || ticket.attempts >= MAX_ATTEMPTS) throw new HttpError(400, 'expired', 'That sign-in has expired. Start again.');
  if (!(await checkCode(env, ticket.user_id, str(input.code)))) {
    await env.DB.prepare('UPDATE login_tickets SET attempts = attempts + 1 WHERE id = ?').bind(ticket.id).run();
    throw new HttpError(400, 'bad_code', 'That code isn’t right.');
  }
  await env.DB.prepare('DELETE FROM login_tickets WHERE id = ?').bind(ticket.id).run();
  return signedIn(env, ticket.user_id);
}
