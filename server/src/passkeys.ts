// Passkeys: sign in with Touch ID, Windows Hello or your phone instead of a password. The web app
// asks the browser itself; the desktop app opens /passkey/:id in the system browser (which knows
// about passkeys) and waits for it to finish, like signing in with Google.
//
//   GET    /api/passkeys                     yours
//   DELETE /api/passkeys/:id                 remove one
//   POST   /api/passkeys/register/start      signed in → { id, options }
//   POST   /api/passkeys/register/finish     { id, credential, name }
//   POST   /api/passkeys/login/start         → { id, options }
//   POST   /api/passkeys/login/finish        { id, credential } → signed in
//   POST   /api/passkeys/poll                { id }: the desktop app asking whether it's done
//   GET    /passkey/:id                      the page the system browser shows
import { base64url, randomId, requireUser, signedIn } from './auth';
import { HttpError, json, readJson, str } from './http';

const REQUEST_TTL = 10 * 60;
const MAX_PASSKEYS = 10;

const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const sha256 = async (bytes: Uint8Array) => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));

/** Passkeys belong to this site's address (the "relying party"); localhost when testing locally. */
const rpId = (req: Request, env: Env) => (env.LOCAL_DEV === '1' ? 'localhost' : new URL(req.url).hostname);
/** Where the web app and the passkey page may be. */
function allowedOrigin(req: Request, env: Env, origin: string): boolean {
  const host = rpId(req, env);
  if (origin === `https://${host}`) return true;
  return host === 'localhost' && /^http:\/\/localhost:\d+$/.test(origin);
}

type PasskeyRequest = { id: string; kind: 'register' | 'login'; challenge: string; user_id: number | null; status: string; error: string | null };

async function getRequest(env: Env, id: string): Promise<PasskeyRequest> {
  const r = await env.DB.prepare('SELECT * FROM passkey_requests WHERE id = ? AND created_at > unixepoch() - ?').bind(id, REQUEST_TTL).first<PasskeyRequest>();
  if (!r) throw new HttpError(400, 'expired', 'That has expired. Try again.');
  return r;
}

async function newRequest(env: Env, kind: 'register' | 'login', userId: number | null) {
  const id = randomId(18);
  const challenge = randomId(32);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM passkey_requests WHERE created_at < unixepoch() - ?').bind(REQUEST_TTL),
    env.DB.prepare('INSERT INTO passkey_requests (id, kind, challenge, user_id) VALUES (?, ?, ?, ?)').bind(id, kind, challenge, userId),
  ]);
  return { id, challenge };
}

/** What the browser signed: the right kind of request, our challenge, from our own pages. */
function checkClientData(req: Request, env: Env, raw: Uint8Array, type: string, challenge: string) {
  let data: { type?: string; challenge?: string; origin?: string };
  try {
    data = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    throw new HttpError(400, 'bad_passkey', 'That passkey answer didn’t make sense.');
  }
  if (data.type !== type || data.challenge !== challenge || !data.origin || !allowedOrigin(req, env, data.origin)) {
    throw new HttpError(400, 'bad_passkey', 'That passkey answer wasn’t for this.');
  }
}

async function registerOptions(req: Request, env: Env, userId: number, username: string, challenge: string) {
  const { results } = await env.DB.prepare('SELECT id FROM passkeys WHERE user_id = ?').bind(userId).all<{ id: string }>();
  return {
    challenge,
    rp: { id: rpId(req, env), name: 'Bigglenet' },
    user: { id: base64url(new TextEncoder().encode(String(userId))), name: username, displayName: username },
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 },
      { type: 'public-key', alg: -257 },
    ],
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
    excludeCredentials: results.map((r) => ({ type: 'public-key', id: r.id })),
    timeout: 120_000,
    attestation: 'none',
  };
}

const loginOptions = (req: Request, env: Env, challenge: string) => ({ challenge, rpId: rpId(req, env), userVerification: 'preferred', timeout: 120_000 });

// --- Your passkeys ---

export async function listPasskeys(req: Request, env: Env): Promise<Response> {
  const me = await requireUser(req, env);
  const { results } = await env.DB.prepare('SELECT id, name, created_at, last_used FROM passkeys WHERE user_id = ? ORDER BY created_at').bind(me.id).all();
  return json({ passkeys: results });
}

export async function removePasskey(req: Request, env: Env, id: string): Promise<Response> {
  const me = await requireUser(req, env);
  await env.DB.prepare('DELETE FROM passkeys WHERE id = ? AND user_id = ?').bind(id, me.id).run();
  return json({});
}

// --- Adding one ---

export async function registerStart(req: Request, env: Env): Promise<Response> {
  const me = await requireUser(req, env);
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM passkeys WHERE user_id = ?').bind(me.id).first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_PASSKEYS) throw new HttpError(400, 'too_many', `You can have up to ${MAX_PASSKEYS} passkeys.`);
  const { id, challenge } = await newRequest(env, 'register', me.id);
  return json({ id, options: await registerOptions(req, env, me.id, me.username, challenge) });
}

export async function registerFinish(req: Request, env: Env): Promise<Response> {
  const input = await readJson(req);
  const r = await getRequest(env, str(input.id));
  if (r.kind !== 'register' || !r.user_id || r.status !== 'waiting') throw new HttpError(400, 'expired', 'That has expired. Try again.');
  const c = (input.credential ?? {}) as Record<string, unknown>;
  try {
    checkClientData(req, env, fromB64url(str(c.clientDataJSON)), 'webauthn.create', r.challenge);
    const algorithm = Number(c.algorithm);
    if (algorithm !== -7 && algorithm !== -257) throw new HttpError(400, 'bad_passkey', 'That kind of passkey isn’t supported.');
    // The key must be one we can use.
    await importKey(str(c.publicKey), algorithm);
    await env.DB.prepare('INSERT INTO passkeys (id, user_id, public_key, algorithm, name) VALUES (?, ?, ?, ?, ?)')
      .bind(str(c.id), r.user_id, str(c.publicKey), algorithm, str(input.name).trim().slice(0, 60) || 'Passkey')
      .run();
    await env.DB.prepare("UPDATE passkey_requests SET status = 'done' WHERE id = ?").bind(r.id).run();
    return json({}, 201);
  } catch (e) {
    await env.DB.prepare("UPDATE passkey_requests SET status = 'failed', error = ? WHERE id = ?").bind(e instanceof HttpError ? e.message : 'That didn’t work.', r.id).run();
    throw e instanceof HttpError ? e : new HttpError(400, 'bad_passkey', 'That passkey couldn’t be added.');
  }
}

// --- Signing in with one ---

export async function loginStart(req: Request, env: Env): Promise<Response> {
  const { id, challenge } = await newRequest(env, 'login', null);
  return json({ id, options: loginOptions(req, env, challenge) });
}

async function importKey(spki: string, algorithm: number): Promise<CryptoKey> {
  const params = algorithm === -7 ? { name: 'ECDSA', namedCurve: 'P-256' } : { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
  return crypto.subtle.importKey('spki', fromB64url(spki), params, false, ['verify']);
}

/** ECDSA signatures come DER-encoded; WebCrypto wants r and s side by side. */
function derToRaw(der: Uint8Array): Uint8Array {
  let at = 2;
  const part = () => {
    if (der[at] !== 0x02) throw new HttpError(400, 'bad_passkey', 'That signature didn’t make sense.');
    const length = der[at + 1];
    let value = der.slice(at + 2, at + 2 + length);
    at += 2 + length;
    while (value.length > 32 && value[0] === 0) value = value.slice(1);
    const out = new Uint8Array(32);
    out.set(value, 32 - value.length);
    return out;
  };
  const raw = new Uint8Array(64);
  raw.set(part(), 0);
  raw.set(part(), 32);
  return raw;
}

export async function loginFinish(req: Request, env: Env): Promise<Response> {
  const input = await readJson(req);
  const r = await getRequest(env, str(input.id));
  if (r.kind !== 'login' || r.status !== 'waiting') throw new HttpError(400, 'expired', 'That has expired. Try again.');
  const c = (input.credential ?? {}) as Record<string, unknown>;
  try {
    const key = await env.DB.prepare('SELECT * FROM passkeys WHERE id = ?').bind(str(c.id)).first<{ id: string; user_id: number; public_key: string; algorithm: number; sign_count: number }>();
    if (!key) throw new HttpError(400, 'unknown_passkey', 'That passkey isn’t on any Biggle ID. Sign in another way, then add it in Settings.');
    const clientData = fromB64url(str(c.clientDataJSON));
    checkClientData(req, env, clientData, 'webauthn.get', r.challenge);
    const authData = fromB64url(str(c.authenticatorData));
    // The authenticator answered for our address, and someone was there.
    const rpHash = await sha256(new TextEncoder().encode(rpId(req, env)));
    if (authData.length < 37 || !rpHash.every((b, i) => authData[i] === b) || !(authData[32] & 1)) {
      throw new HttpError(400, 'bad_passkey', 'That passkey answer wasn’t for this.');
    }
    const signed = new Uint8Array(authData.length + 32);
    signed.set(authData, 0);
    signed.set(await sha256(clientData), authData.length);
    const signature = fromB64url(str(c.signature));
    const ok =
      key.algorithm === -7
        ? await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, await importKey(key.public_key, -7), derToRaw(signature), signed)
        : await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, await importKey(key.public_key, -257), signature, signed);
    if (!ok) throw new HttpError(400, 'bad_passkey', 'That passkey didn’t check out.');
    const count = new DataView(authData.buffer, authData.byteOffset).getUint32(33);
    // A counter that went backwards means the passkey was copied.
    if (count !== 0 && count <= key.sign_count) throw new HttpError(400, 'bad_passkey', 'That passkey didn’t check out.');
    await env.DB.batch([
      env.DB.prepare('UPDATE passkeys SET sign_count = ?, last_used = unixepoch() WHERE id = ?').bind(count, key.id),
      env.DB.prepare("UPDATE passkey_requests SET status = 'done', user_id = ? WHERE id = ?").bind(key.user_id, r.id),
    ]);
    // From the system browser, for the desktop app: it gets signed in when it asks (poll), not here.
    if (input.external === true) return json({ done: true });
    return signedIn(env, key.user_id);
  } catch (e) {
    await env.DB.prepare("UPDATE passkey_requests SET status = 'failed', error = ? WHERE id = ?").bind(e instanceof HttpError ? e.message : 'That didn’t work.', r.id).run();
    throw e instanceof HttpError ? e : new HttpError(400, 'bad_passkey', 'That passkey didn’t work.');
  }
}

/** The desktop app, waiting for the system browser: done (signed in, or added), failed, or not yet. */
export async function poll(req: Request, env: Env): Promise<Response> {
  const r = await getRequest(env, str((await readJson(req)).id));
  if (r.status === 'failed') throw new HttpError(400, 'passkey_failed', r.error ?? 'That didn’t work.');
  if (r.status !== 'done') return json({ waiting: true });
  await env.DB.prepare('DELETE FROM passkey_requests WHERE id = ?').bind(r.id).run();
  if (r.kind === 'register') return json({ done: true });
  return signedIn(env, r.user_id!);
}

/** What /passkey/:id needs to start (the page has no sign-in of its own). */
export async function requestOptions(req: Request, env: Env, id: string): Promise<Response> {
  const r = await getRequest(env, id);
  if (r.status !== 'waiting') throw new HttpError(400, 'expired', 'That has expired. Try again.');
  if (r.kind === 'login') return json({ kind: 'login', options: loginOptions(req, env, r.challenge) });
  const user = await env.DB.prepare('SELECT username FROM users WHERE id = ?').bind(r.user_id).first<{ username: string }>();
  return json({ kind: 'register', options: await registerOptions(req, env, r.user_id!, user?.username ?? 'you', r.challenge) });
}

/** The page the desktop app opens in the system browser. */
export async function passkeyPage(_req: Request, _env: Env, id: string): Promise<Response> {
  const safeId = id.replace(/[^A-Za-z0-9_-]/g, '');
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Passkey · Bigglenet</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,-apple-system,sans-serif;background:#f6f4f0;color:#222;text-align:center;padding:24px}
main{max-width:420px}h1{font-size:22px;margin:0 0 8px}p{color:#6e6b65;line-height:1.5}button{margin-top:12px;padding:12px 20px;border:0;border-radius:12px;background:#222;color:#f6f4f0;font:inherit;font-weight:600;cursor:pointer}
@media (prefers-color-scheme:dark){body{background:#1c1c1c;color:#f6f4f0}p{color:#a5a29b}button{background:#f6f4f0;color:#222}}</style>
<main><h1 id="title">Passkey</h1><p id="text">One moment…</p><button id="go" hidden>Use my passkey</button></main>
<script type="module">
const id = ${JSON.stringify(safeId)};
const $ = (x) => document.getElementById(x);
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
const bytes = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const say = (title, text) => { $('title').textContent = title; $('text').textContent = text; };
const post = async (path, body) => { const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const d = await r.json(); if (!r.ok) throw new Error(d.message || 'That didn’t work.'); return d; };
let start;
try { const r = await fetch('/api/passkeys/requests/' + id); start = await r.json(); if (!r.ok) throw new Error(start.message); }
catch (e) { say('That has expired', e.message || 'Go back to Bigglenet and try again.'); throw e; }
const run = async () => {
  $('go').hidden = true;
  try {
    const o = start.options;
    if (start.kind === 'login') {
      const c = await navigator.credentials.get({ publicKey: { ...o, challenge: bytes(o.challenge) } });
      await post('/api/passkeys/login/finish', { id, external: true, credential: { id: c.id, clientDataJSON: b64(c.response.clientDataJSON), authenticatorData: b64(c.response.authenticatorData), signature: b64(c.response.signature) } });
      say('You’re signed in', 'Go back to Bigglenet. You can close this tab.');
    } else {
      const c = await navigator.credentials.create({ publicKey: { ...o, challenge: bytes(o.challenge), user: { ...o.user, id: bytes(o.user.id) }, excludeCredentials: o.excludeCredentials.map((x) => ({ ...x, id: bytes(x.id) })) } });
      await post('/api/passkeys/register/finish', { id, name: navigator.platform || 'Passkey', credential: { id: c.id, clientDataJSON: b64(c.response.clientDataJSON), publicKey: b64(c.response.getPublicKey()), algorithm: c.response.getPublicKeyAlgorithm() } });
      say('Passkey added', 'Go back to Bigglenet. You can close this tab.');
    }
  } catch (e) {
    say('That didn’t work', (e && e.name === 'NotAllowedError') ? 'It was cancelled. Try again, or go back to Bigglenet.' : (e.message || 'Try again.'));
    $('go').hidden = false;
  }
};
say(start.kind === 'login' ? 'Sign in with a passkey' : 'Add a passkey', start.kind === 'login' ? 'Use Touch ID, Windows Hello or your phone.' : 'Use Touch ID, Windows Hello or your phone, so you can sign in without a password.');
$('go').hidden = false;
$('go').onclick = run;
</script>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } },
  );
}
