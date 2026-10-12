// Files kept in R2 (the FILES bucket): profile pictures, and pictures, files and voice messages
// sent in chats. Private files are served from signed links that expire, so <img> and <audio>
// can load them without the session token.
//
//   GET /files/:key?exp=&sig=   a private file, through a signed link (see fileLink)
import { HttpError } from './http';

/** Signed links last this long. Lists of messages hand out fresh ones each time. */
const LINK_TTL = 24 * 60 * 60;

const enc = new TextEncoder();

async function hmac(env: Env, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(env.PREVIEW_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`file:${data}`)));
  return btoa(String.fromCharCode(...sig)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function putFile(env: Env, key: string, body: ArrayBuffer | Uint8Array, type: string) {
  await env.FILES.put(key, body, { httpMetadata: { contentType: type } });
}

export async function deleteFile(env: Env, key: string) {
  await env.FILES.delete(key);
}

/** A file as a response, or null if it isn't there. */
export async function fileResponse(env: Env, key: string, headers: Record<string, string> = {}): Promise<Response | null> {
  const object = await env.FILES.get(key);
  if (!object) return null;
  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream',
      'Content-Length': String(object.size),
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options': 'nosniff',
      // A file can't run as a page on the Bigglenet's own address.
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
      ...headers,
    },
  });
}

/** A link to a private file that works for a day, for whoever was given it. */
export async function fileLink(env: Env, key: string, name?: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + LINK_TTL;
  const sig = await hmac(env, `${key}.${exp}`);
  const download = name ? `&name=${encodeURIComponent(name)}` : '';
  return `/files/${key.split('/').map(encodeURIComponent).join('/')}?exp=${exp}&sig=${sig}${download}`;
}

/** GET /files/<key>?exp=&sig=: a private file, if the link is genuine and hasn't expired. */
export async function serveFile(req: Request, env: Env, rawKey: string): Promise<Response> {
  const url = new URL(req.url);
  const key = rawKey.split('/').map(decodeURIComponent).join('/');
  const exp = Number(url.searchParams.get('exp'));
  const sig = url.searchParams.get('sig') ?? '';
  if (!exp || exp < Date.now() / 1000) throw new HttpError(410, 'link_expired', 'That link has expired. Open the chat again.');
  const expected = enc.encode(await hmac(env, `${key}.${exp}`));
  const given = enc.encode(sig);
  if (expected.length !== given.length || !crypto.subtle.timingSafeEqual(expected, given)) {
    throw new HttpError(403, 'bad_link', "That link isn't valid.");
  }
  const name = url.searchParams.get('name');
  const res = await fileResponse(env, key, {
    'Cache-Control': 'private, max-age=86400, immutable',
    ...(name ? { 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}` } : {}),
  });
  if (!res) throw new HttpError(404, 'no_such_file', 'That file is gone.');
  return res;
}
