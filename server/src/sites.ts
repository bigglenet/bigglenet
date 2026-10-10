// Sites hosted on the Bigglenet itself, made with the Biggle site editor.
// New sites wait for an admin's approval; until then only the owner and admins can see them.
import { requireAdmin, requireUser, type User } from './auth';
import { forget } from './gateway';
import { blobBytes, HttpError, json, NAME_RE, readJson, str } from './http';
import { notify } from './live';
import { TEMPLATES, templateFiles, type Template } from './templates';

const MAX_SITES = 3;
export const MAX_FILE = 1_000_000;
const MAX_SITE = 5_000_000;
const MAX_FILES = 60;
const PREVIEW_TTL = 60 * 60;

const RESERVED = new Set([
  'admin', 'api', 'app', 'www', 'mail', 'biggle', 'bigglenet', 'home', 'hello', 'help', 'support',
  'start', 'sites', 'root', 'system', 'official', 'staff', 'mod', 'news', 'status', 'security', 'nox', 'requests',
]);

export const FILE_TYPES: Record<string, string> = {
  bhtml: 'text/bhtml; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  ico: 'image/x-icon',
  avif: 'image/avif',
  woff2: 'font/woff2',
  woff: 'font/woff',
  ttf: 'font/ttf',
  otf: 'font/otf',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  webm: 'video/webm',
};

const PATH_RE = /^(?:[A-Za-z0-9_-][A-Za-z0-9._-]*\/){0,4}[A-Za-z0-9_-][A-Za-z0-9._-]*\.([a-z0-9]+)$/;

export type SiteRow = {
  name: string;
  url: string | null;
  title: string | null;
  owner_id: number | null;
  status: 'pending' | 'live' | 'rejected';
  review_note: string | null;
  created_at: number;
  updated_at: number;
};

function checkPath(raw: string): { path: string; type: string } {
  const m = PATH_RE.exec(raw);
  const type = m && FILE_TYPES[m[1].toLowerCase()];
  if (!m || !type || raw.length > 120) {
    throw new HttpError(400, 'bad_path', `"${raw}" isn't a file name Biggle can host. Use letters, numbers, - and _, and an extension like .bhtml, .css, .js or .png.`);
  }
  return { path: raw, type };
}

function checkName(raw: string): string {
  const name = raw.trim().toLowerCase().replace(/\.biggle$/, '');
  if (!NAME_RE.test(name) || name.length < 2) {
    throw new HttpError(400, 'bad_name', 'Names are 2–63 characters: a–z, 0–9 and "-", not starting or ending with "-".');
  }
  return name;
}

async function getSite(env: Env, name: string): Promise<SiteRow> {
  const site = await env.DB.prepare('SELECT * FROM names WHERE name = ?').bind(name.toLowerCase()).first<SiteRow>();
  if (!site) throw new HttpError(404, 'no_such_site', `${name}.biggle doesn't exist.`);
  return site;
}

/** The site, if this user owns it (or is an admin). */
async function editable(req: Request, env: Env, name: string): Promise<{ user: User; site: SiteRow }> {
  const user = await requireUser(req, env);
  const site = await getSite(env, name);
  if (site.owner_id !== user.id && !user.is_admin) throw new HttpError(403, 'not_yours', "That isn't your site.");
  if (site.url) throw new HttpError(400, 'external', `${site.name}.biggle is hosted somewhere else, so it can't be edited here.`);
  return { user, site };
}

const publicSite = (s: SiteRow) => ({
  name: s.name,
  title: s.title,
  status: s.status,
  note: s.review_note,
  createdAt: s.created_at,
  updatedAt: s.updated_at,
});

async function notifyAdmins(env: Env) {
  const { results } = await env.DB.prepare('SELECT id FROM users WHERE is_admin = 1').all<{ id: number }>();
  await Promise.all(results.map((r) => notify(env, r.id, { type: 'review' })));
}

async function touch(env: Env, name: string) {
  await env.DB.prepare('UPDATE names SET updated_at = unixepoch() WHERE name = ?').bind(name).run();
}

// --- Owner endpoints ---

export async function mySites(req: Request, env: Env): Promise<Response> {
  const user = await requireUser(req, env);
  const { results } = await env.DB.prepare('SELECT * FROM names WHERE owner_id = ? ORDER BY created_at DESC')
    .bind(user.id)
    .all<SiteRow>();
  return json({ sites: results.map(publicSite), limit: user.is_admin ? null : MAX_SITES });
}

export async function checkAvailable(req: Request, env: Env, raw: string): Promise<Response> {
  await requireUser(req, env);
  let name: string;
  try {
    name = checkName(raw);
  } catch (e) {
    return json({ available: false, reason: (e as Error).message });
  }
  if (RESERVED.has(name)) return json({ available: false, reason: `${name}.biggle is reserved.` });
  const taken = await env.DB.prepare('SELECT 1 FROM names WHERE name = ?').bind(name).first();
  return json({ available: !taken, reason: taken ? `${name}.biggle is taken.` : null });
}

export async function createSite(req: Request, env: Env): Promise<Response> {
  const user = await requireUser(req, env);
  const body = await readJson(req);
  const name = checkName(str(body.name));
  if (RESERVED.has(name)) throw new HttpError(409, 'name_taken', `${name}.biggle is reserved.`);
  const title = str(body.title).trim().slice(0, 80) || name;
  const about = str(body.about).trim().slice(0, 300);
  const template = (TEMPLATES as string[]).includes(str(body.template)) ? (str(body.template) as Template) : 'page';

  if (!user.is_admin) {
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM names WHERE owner_id = ?').bind(user.id).first<{ n: number }>();
    if ((count?.n ?? 0) >= MAX_SITES) throw new HttpError(400, 'too_many', `You can have up to ${MAX_SITES} sites.`);
  }

  const files = body.files && typeof body.files === 'object' ? starterFiles(body.files) : templateFiles(template, title, about);
  const enc = new TextEncoder();
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO names (name, title, owner_id, status) VALUES (?, ?, ?, 'pending')").bind(name, title, user.id),
      ...Object.entries(files).map(([path, text]) => {
        const bytes = enc.encode(text);
        return env.DB.prepare('INSERT INTO site_files (site, path, type, content, size) VALUES (?, ?, ?, ?, ?)').bind(
          name,
          path,
          checkPath(path).type,
          bytes,
          bytes.length,
        );
      }),
    ]);
  } catch (e) {
    if (String(e).includes('UNIQUE')) throw new HttpError(409, 'name_taken', `${name}.biggle is taken.`);
    throw e;
  }
  await notifyAdmins(env);
  return json({ site: publicSite(await getSite(env, name)) }, 201);
}

/** Starting files sent by the editor (the easy editor builds its own). */
function starterFiles(raw: object): Record<string, string> {
  const entries = Object.entries(raw);
  if (entries.length > 20) throw new HttpError(400, 'too_many_files', 'Too many starting files.');
  let total = 0;
  for (const [path, text] of entries) {
    checkPath(path);
    if (typeof text !== 'string') throw new HttpError(400, 'bad_file', `${path} must be text.`);
    total += text.length;
    if (text.length > MAX_FILE || total > MAX_SITE) throw new HttpError(413, 'too_large', 'Those files are too big.');
    if (path.endsWith('.bhtml') && !/^\uFEFF?\s*<!bhtml\s+1\s*>/i.test(text)) {
      throw new HttpError(400, 'not_bhtml', `${path} must start with <!bhtml 1>.`);
    }
  }
  if (typeof (raw as Record<string, unknown>)['index.bhtml'] !== 'string') {
    throw new HttpError(400, 'needs_index', 'Every site needs an index.bhtml.');
  }
  return raw as Record<string, string>;
}

export async function getSiteInfo(req: Request, env: Env, name: string): Promise<Response> {
  const { site } = await editable(req, env, name);
  const { results } = await env.DB.prepare(
    'SELECT path, type, size, updated_at FROM site_files WHERE site = ? ORDER BY path',
  )
    .bind(site.name)
    .all<{ path: string; type: string; size: number; updated_at: number }>();
  return json({
    site: publicSite(site),
    files: results.map((f) => ({ path: f.path, type: f.type, size: f.size, updatedAt: f.updated_at })),
    limits: { file: MAX_FILE, site: MAX_SITE, files: MAX_FILES },
  });
}

export async function updateSite(req: Request, env: Env, name: string): Promise<Response> {
  const { site } = await editable(req, env, name);
  const title = str((await readJson(req)).title).trim().slice(0, 80);
  if (title) await env.DB.prepare('UPDATE names SET title = ?, updated_at = unixepoch() WHERE name = ?').bind(title, site.name).run();
  return json({ site: publicSite(await getSite(env, site.name)) });
}

export async function deleteSite(req: Request, env: Env, name: string): Promise<Response> {
  const { site } = await editable(req, env, name);
  await env.DB.prepare('DELETE FROM names WHERE name = ?').bind(site.name).run();
  forget(site.name);
  return json({});
}

/** Ask again after a rejection. */
export async function submitSite(req: Request, env: Env, name: string): Promise<Response> {
  const { site } = await editable(req, env, name);
  if (site.status === 'rejected') {
    await env.DB.prepare("UPDATE names SET status = 'pending', review_note = NULL WHERE name = ?").bind(site.name).run();
    await notifyAdmins(env);
  }
  return json({ site: publicSite(await getSite(env, site.name)) });
}

export async function readFile(req: Request, env: Env, name: string, rawPath: string): Promise<Response> {
  const { site } = await editable(req, env, name);
  const { path } = checkPath(rawPath);
  const file = await env.DB.prepare('SELECT type, content FROM site_files WHERE site = ? AND path = ?')
    .bind(site.name, path)
    .first<{ type: string; content: ArrayBuffer | number[] }>();
  if (!file) throw new HttpError(404, 'no_such_file', `${path} doesn't exist.`);
  return new Response(blobBytes(file.content), {
    headers: { 'Content-Type': file.type, 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' },
  });
}

export async function writeFile(req: Request, env: Env, name: string, rawPath: string): Promise<Response> {
  const { site } = await editable(req, env, name);
  const { path, type } = checkPath(rawPath);
  if (Number(req.headers.get('Content-Length') ?? 0) > MAX_FILE) throw new HttpError(413, 'too_large', 'Files can be up to 1 MB.');
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length > MAX_FILE) throw new HttpError(413, 'too_large', 'Files can be up to 1 MB.');
  if (path.endsWith('.bhtml') && !/^﻿?\s*<!bhtml\s+1\s*>/i.test(new TextDecoder().decode(bytes.slice(0, 200)))) {
    throw new HttpError(400, 'not_bhtml', '.bhtml files must start with <!bhtml 1>.');
  }

  const totals = await env.DB.prepare(
    'SELECT COUNT(*) AS files, COALESCE(SUM(size), 0) AS size FROM site_files WHERE site = ? AND path != ?',
  )
    .bind(site.name, path)
    .first<{ files: number; size: number }>();
  if ((totals?.files ?? 0) >= MAX_FILES) throw new HttpError(400, 'too_many_files', `A site can have up to ${MAX_FILES} files.`);
  if ((totals?.size ?? 0) + bytes.length > MAX_SITE) throw new HttpError(400, 'site_full', 'A site can use up to 5 MB.');

  await env.DB.prepare(
    `INSERT INTO site_files (site, path, type, content, size) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(site, path) DO UPDATE SET type = excluded.type, content = excluded.content,
       size = excluded.size, updated_at = unixepoch()`,
  )
    .bind(site.name, path, type, bytes, bytes.length)
    .run();
  await touch(env, site.name);
  return json({ path, type, size: bytes.length });
}

export async function deleteFile(req: Request, env: Env, name: string, rawPath: string): Promise<Response> {
  const { site } = await editable(req, env, name);
  const { path } = checkPath(rawPath);
  if (path === 'index.bhtml') throw new HttpError(400, 'needs_index', 'Every site needs an index.bhtml.');
  await env.DB.prepare('DELETE FROM site_files WHERE site = ? AND path = ?').bind(site.name, path).run();
  await touch(env, site.name);
  return json({});
}

// --- Previews: let owners and admins see a site before it's approved ---

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function hmac(env: Env, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.PREVIEW_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))));
}

export async function previewToken(req: Request, env: Env, name: string): Promise<Response> {
  const { site } = await editable(req, env, name);
  const payload = `${site.name}.${Math.floor(Date.now() / 1000) + PREVIEW_TTL}`;
  const token = `${payload}.${await hmac(env, payload)}`;
  return json({ base: `/preview/${token}/` });
}

/** The site name a preview token is for, or null if it's invalid or expired. */
export async function checkPreviewToken(env: Env, token: string): Promise<string | null> {
  const m = /^([a-z0-9-]+)\.(\d+)\.([A-Za-z0-9_-]+)$/.exec(token);
  if (!m || Number(m[2]) < Date.now() / 1000) return null;
  const expected = new TextEncoder().encode(await hmac(env, `${m[1]}.${m[2]}`));
  const given = new TextEncoder().encode(m[3]);
  return expected.length === given.length && crypto.subtle.timingSafeEqual(expected, given) ? m[1] : null;
}

// --- Admin review ---

export async function reviewList(req: Request, env: Env): Promise<Response> {
  await requireAdmin(req, env);
  const { results } = await env.DB.prepare(
    `SELECT n.*, u.username AS owner,
       (SELECT COUNT(*) FROM site_files f WHERE f.site = n.name) AS files,
       (SELECT COALESCE(SUM(size), 0) FROM site_files f WHERE f.site = n.name) AS size
     FROM names n LEFT JOIN users u ON u.id = n.owner_id
     WHERE n.status = 'pending' ORDER BY n.created_at`,
  ).all<SiteRow & { owner: string | null; files: number; size: number }>();
  return json({ sites: results.map((s) => ({ ...publicSite(s), owner: s.owner, files: s.files, size: s.size })) });
}

async function review(req: Request, env: Env, name: string, status: 'live' | 'rejected', note: string | null) {
  await requireAdmin(req, env);
  const site = await getSite(env, name);
  await env.DB.prepare('UPDATE names SET status = ?, review_note = ? WHERE name = ?').bind(status, note, site.name).run();
  forget(site.name);
  if (site.owner_id) await notify(env, site.owner_id, { type: 'site', name: site.name, status });
  await notifyAdmins(env);
  return json({ site: publicSite(await getSite(env, site.name)) });
}

export async function approveSite(req: Request, env: Env, name: string): Promise<Response> {
  return review(req, env, name, 'live', null);
}

export async function rejectSite(req: Request, env: Env, name: string): Promise<Response> {
  const note = str((await readJson(req)).note).trim().slice(0, 300) || null;
  return review(req, env, name, 'rejected', note);
}
