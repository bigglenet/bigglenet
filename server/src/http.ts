export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Expose-Headers': 'X-Biggle-Error',
};

/** Thrown by handlers; turned into a JSON error response. */
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export function fail(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: {
      ...CORS,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': 'sandbox',
      'X-Biggle-Error': code,
    },
  });
}

export function redirect(location: string, status = 301): Response {
  return new Response(null, { status, headers: { ...CORS, Location: location } });
}

export function preflight(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...CORS,
      'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}

const MAX_BODY = 64 * 1024;

export async function readJson<T extends Record<string, unknown>>(req: Request): Promise<Partial<T>> {
  const text = await req.text();
  if (text.length > MAX_BODY) throw new HttpError(413, 'too_large', 'That request is too big.');
  try {
    const data = JSON.parse(text || '{}');
    if (data && typeof data === 'object' && !Array.isArray(data)) return data;
  } catch {}
  throw new HttpError(400, 'bad_json', 'Expected a JSON object.');
}

export const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export const NAME_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * A site's key, as stored and as it appears in /site/<key>/ paths: the name for a .biggle site
 * ("hello"), or the name and ".b" for a .b site ("hello.b"). The two are separate sites.
 */
export const SITE_KEY_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.b)?$/;
export const siteKey = (name: string, tld: string) => (tld === 'b' ? `${name}.b` : name);
/** "hello.biggle" or "hello.b". */
export const siteAddress = (key: string) => (key.endsWith('.b') ? key : `${key}.biggle`);
/** "hello", "hello.biggle" or "hello.b" → the bare name, and the ending if one was given. */
export function splitAddress(raw: string): { name: string; tld: 'biggle' | 'b' | null } {
  const text = raw.trim().toLowerCase();
  const m = /^(.*)\.(biggle|b)$/.exec(text);
  return m ? { name: m[1], tld: m[2] as 'biggle' | 'b' } : { name: text, tld: null };
}
export const USERNAME_RE = /^[a-z0-9_]{2,24}$/;

/** D1 hands back BLOB columns as either an ArrayBuffer or an array of bytes. */
export function blobBytes(value: ArrayBuffer | ArrayLike<number>): Uint8Array {
  return value instanceof ArrayBuffer ? new Uint8Array(value) : Uint8Array.from(value);
}
