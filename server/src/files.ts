// Files people upload: profile pictures, and pictures, files and voice messages sent in chats.
// They're kept in their own D1 database (FILES_DB, files-migrations/), in pieces of up to 1 MB:
// a row can't hold more than 2 MB. Private files are served from signed links that expire, so
// <img> and <audio> can load them without the session token.
//
//   GET /files/:key?exp=&sig=   a private file, through a signed link (see fileLink)
import { HttpError } from './http';

const PIECE = 1_000_000;
// How much the files may take up: the files database holds 500 MB on Workers Free, and this
// leaves room to spare.
const SPACE = 450_000_000;

/** Signed links last this long. Lists of messages hand out fresh ones each time. */
const LINK_TTL = 24 * 60 * 60;

const enc = new TextEncoder();

async function hmac(env: Env, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(env.PREVIEW_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`file:${data}`)));
  return btoa(String.fromCharCode(...sig)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export type FileInfo = { type: string; size: number; name: string | null; owner: number | null };

/** Keep a file (replacing one with the same key). */
export async function putFile(env: Env, key: string, body: ArrayBuffer | Uint8Array, type: string, about: { name?: string; owner?: number } = {}) {
  const bytes = body instanceof Uint8Array ? body : new Uint8Array(body);
  const used = await env.FILES_DB.prepare('SELECT COALESCE(SUM(size), 0) AS n FROM files WHERE key != ?').bind(key).first<{ n: number }>();
  if ((used?.n ?? 0) + bytes.byteLength > SPACE) throw new HttpError(507, 'no_space', 'The Bigglenet is out of room for files right now. Try again later.');
  const pieces = Math.max(1, Math.ceil(bytes.byteLength / PIECE));
  await env.FILES_DB.prepare('DELETE FROM file_pieces WHERE key = ?').bind(key).run();
  try {
    // One piece per call: a call can't carry much more than that.
    for (let n = 0; n < pieces; n++) {
      await env.FILES_DB.prepare('INSERT INTO file_pieces (key, n, data) VALUES (?, ?, ?)').bind(key, n, bytes.subarray(n * PIECE, (n + 1) * PIECE)).run();
    }
    // The file counts once all its pieces are in.
    await env.FILES_DB.prepare(
      `INSERT INTO files (key, type, size, name, owner_id, pieces) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET type = excluded.type, size = excluded.size, name = excluded.name, owner_id = excluded.owner_id, pieces = excluded.pieces, created_at = unixepoch()`,
    )
      .bind(key, type, bytes.byteLength, about.name ?? null, about.owner ?? null, pieces)
      .run();
  } catch (e) {
    await env.FILES_DB.batch([env.FILES_DB.prepare('DELETE FROM file_pieces WHERE key = ?').bind(key), env.FILES_DB.prepare('DELETE FROM files WHERE key = ?').bind(key)]).catch(() => {});
    throw e;
  }
}

/** What's known about a kept file, or null if there isn't one. */
export async function fileInfo(env: Env, key: string): Promise<FileInfo | null> {
  const row = await env.FILES_DB.prepare('SELECT type, size, name, owner_id FROM files WHERE key = ?').bind(key).first<{ type: string; size: number; name: string | null; owner_id: number | null }>();
  return row ? { type: row.type, size: row.size, name: row.name, owner: row.owner_id } : null;
}

export async function deleteFile(env: Env, key: string) {
  await deleteFiles(env, [key]);
}

/** Many at once, a few calls for all of them. */
export async function deleteFiles(env: Env, keys: string[]) {
  // A call takes up to 100 values.
  for (let i = 0; i < keys.length; i += 90) {
    const some = keys.slice(i, i + 90);
    const marks = some.map(() => '?').join(', ');
    await env.FILES_DB.batch([
      env.FILES_DB.prepare(`DELETE FROM file_pieces WHERE key IN (${marks})`).bind(...some),
      env.FILES_DB.prepare(`DELETE FROM files WHERE key IN (${marks})`).bind(...some),
    ]);
  }
}

/** How much the files take up, for the admin dashboard. */
export async function filesSpace(env: Env): Promise<{ used: number; space: number; files: number }> {
  const row = await env.FILES_DB.prepare('SELECT COALESCE(SUM(size), 0) AS used, COUNT(*) AS files FROM files').first<{ used: number; files: number }>();
  return { used: row?.used ?? 0, space: SPACE, files: row?.files ?? 0 };
}

/** A file as a response, its pieces streamed one after another, or null if it isn't there. */
export async function fileResponse(env: Env, key: string, headers: Record<string, string> = {}): Promise<Response | null> {
  const file = await env.FILES_DB.prepare('SELECT type, size, pieces FROM files WHERE key = ?').bind(key).first<{ type: string; size: number; pieces: number }>();
  if (!file) return null;
  // Sent as the pieces are read, with its length known up front (for progress, and seeking in
  // voice messages).
  const { readable, writable } = new FixedLengthStream(file.size);
  const writer = writable.getWriter();
  (async () => {
    try {
      for (let n = 0; n < file.pieces; n++) {
        const piece = await env.FILES_DB.prepare('SELECT data FROM file_pieces WHERE key = ? AND n = ?').bind(key, n).first<{ data: ArrayBuffer | number[] }>();
        if (!piece) throw new Error('A piece of that file is missing.');
        await writer.write(piece.data instanceof ArrayBuffer ? new Uint8Array(piece.data) : Uint8Array.from(piece.data));
      }
      await writer.close();
    } catch (e) {
      await writer.abort(e);
    }
  })();
  return new Response(readable, {
    headers: {
      'Content-Type': file.type,
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
