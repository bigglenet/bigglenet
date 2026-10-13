// Web push: notifications on phones (and browsers that allow it) while Bigglenet is closed.
// Someone's Live object (live.ts) sends one when something arrives and they have no connection
// open. Messages are encrypted for the device (RFC 8291) and signed with our VAPID key (RFC 8292).
//
//   GET    /api/push              { key }: our public key, or null when push isn't set up
//   POST   /api/push              { endpoint, keys: { p256dh, auth }, lang }: this device wants pushes
//   DELETE /api/push              { endpoint }: not any more
//
// Set up with two secrets: VAPID_PUBLIC (uncompressed P-256 point, base64url) and VAPID_PRIVATE
// (the private key as a JWK, JSON). See README.
import { requireUser } from './auth';
import { HttpError, json, readJson, str } from './http';
import { translate } from './i18n';

const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

const configured = (env: Env) => !!env.VAPID_PUBLIC && !!env.VAPID_PRIVATE;

export async function pushKey(_req: Request, env: Env): Promise<Response> {
  return json({ key: configured(env) ? env.VAPID_PUBLIC : null });
}

export async function subscribe(req: Request, env: Env): Promise<Response> {
  const me = await requireUser(req, env);
  if (!configured(env)) throw new HttpError(503, 'no_push', 'Notifications while Bigglenet is closed aren’t set up on this server.');
  const input = await readJson(req);
  const endpoint = str(input.endpoint);
  const keys = (input.keys ?? {}) as Record<string, unknown>;
  // (A local test server may push to a local endpoint.)
  const local = env.LOCAL_DEV === '1' && /^http:\/\/localhost:\d+\//.test(endpoint);
  if ((!/^https:\/\//.test(endpoint) && !local) || endpoint.length > 1000 || !str(keys.p256dh) || !str(keys.auth)) {
    throw new HttpError(400, 'bad_subscription', 'That isn’t a push subscription.');
  }
  await env.DB.prepare(
    `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, lang) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, lang = excluded.lang`,
  )
    .bind(endpoint, me.id, str(keys.p256dh), str(keys.auth), input.lang === 'tr' ? 'tr' : 'en')
    .run();
  // A few devices each; the oldest go.
  await env.DB.prepare('DELETE FROM push_subscriptions WHERE user_id = ?1 AND endpoint NOT IN (SELECT endpoint FROM push_subscriptions WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 5)')
    .bind(me.id)
    .run();
  return json({}, 201);
}

export async function unsubscribe(req: Request, env: Env): Promise<Response> {
  const me = await requireUser(req, env);
  await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').bind(str((await readJson(req)).endpoint), me.id).run();
  return json({});
}

// --- Sending ---

/** `ours`: the body is the Bigglenet's own text (not someone's message), so it's translated for each device. */
export type PushMessage = { title: string; body: string; tag?: string; href?: string; chatId?: number; ours?: boolean };
type Subscription = { endpoint: string; p256dh: string; auth: string; lang: string };

/** Our signature for a push service (a JWT, ES256). */
async function vapid(env: Env, endpoint: string): Promise<string> {
  const jwk = JSON.parse(env.VAPID_PRIVATE!) as JsonWebKey;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const header = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'https://bigglenet.ethembeldagli.dev' })));
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`)));
  return `vapid t=${header}.${claims}.${b64url(signature)}, k=${env.VAPID_PUBLIC}`;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

/** The message, encrypted for one device (aes128gcm, RFC 8291). */
async function encrypt(p256dh: string, auth: string, payload: Uint8Array): Promise<Uint8Array> {
  const uaPublic = fromB64url(p256dh);
  const authSecret = fromB64url(auth);
  const ours = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const asPublic = new Uint8Array((await crypto.subtle.exportKey('raw', ours.publicKey)) as ArrayBuffer);
  const theirs = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  // (The Workers types call `public` `$public`; the runtime wants `public`, as the standard says.)
  const ecdh = { name: 'ECDH', public: theirs } as unknown as SubtleCryptoDeriveKeyAlgorithm;
  const shared = new Uint8Array(await crypto.subtle.deriveBits(ecdh, ours.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // One record: the message and the "last record" padding byte.
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(payload, new Uint8Array([2]))));
  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  return concat(header, asPublic, sealed);
}

/** Send to every device that asked; forget the ones the push service says are gone. */
export async function sendPush(env: Env, userId: number, message: PushMessage, subs?: Subscription[]) {
  if (!configured(env)) return;
  const list =
    subs ??
    (await env.DB.prepare('SELECT endpoint, p256dh, auth, lang FROM push_subscriptions WHERE user_id = ?').bind(userId).all<Subscription>()).results;
  const { ours, ...rest } = message;
  for (const s of list) {
    const lang = s.lang === 'tr' ? 'tr' : 'en';
    const payload = enc.encode(JSON.stringify(ours ? { ...rest, body: translate(rest.body, lang) } : rest));
    try {
      const res = await fetch(s.endpoint, {
        method: 'POST',
        headers: {
          Authorization: await vapid(env, s.endpoint),
          'Content-Encoding': 'aes128gcm',
          'Content-Type': 'application/octet-stream',
          TTL: '86400',
          Urgency: 'high',
          ...(message.tag ? { Topic: message.tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) } : {}),
        },
        body: await encrypt(s.p256dh, s.auth, payload),
      });
      if (res.status === 404 || res.status === 410) await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(s.endpoint).run();
      else if (!res.ok) console.error('push refused', res.status, await res.text().catch(() => ''));
    } catch (e) {
      console.error('push failed', e);
    }
  }
}
