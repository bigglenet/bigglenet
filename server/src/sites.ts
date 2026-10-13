// Sites hosted on the Bigglenet itself, made with the Biggle site editor.
// New sites wait for an admin's approval; until then only the owner and admins can see them.
import { requireAdmin, requireUser, type User } from './auth';
import { forget } from './gateway';
import { blobBytes, HttpError, json, NAME_RE, readJson, siteAddress, siteKey, splitAddress, str } from './http';
import { notify } from './live';
import { addNotification } from './notifications';
import { TEMPLATES, templateFiles, type Template } from './templates';
import { today } from './visitors';

const MAX_SITES = 3;
export const MAX_FILE = 1_000_000;
const MAX_SITE = 5_000_000;
const MAX_FILES = 60;
const PREVIEW_TTL = 60 * 60;

const RESERVED = new Set([
  'admin', 'api', 'app', 'www', 'mail', 'biggle', 'bigglenet', 'home', 'hello', 'help', 'support',
  'start', 'sites', 'root', 'system', 'official', 'staff', 'mod', 'news', 'status', 'security', 'nox', 'requests', 'chat',
  'newtab', 'settings', 'bookmarks', 'history', 'downloads', 'u',
]);

/** The two address endings. Only admins and people they trust can use .b. */
export type Tld = 'biggle' | 'b';
export const canUseShort = (user: User) => !!user.is_admin || !!user.trusted;

function checkTld(user: User, raw: unknown): Tld {
  if (raw !== 'b') return 'biggle';
  if (!canUseShort(user)) throw new HttpError(403, 'not_trusted', 'Only admins and people they trust can have a .b address.');
  return 'b';
}

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
  tld: Tld;
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

/** A new site's name, without its ending. */
function checkName(raw: string): string {
  const { name } = splitAddress(raw);
  if (!NAME_RE.test(name) || name.length < 2) {
    throw new HttpError(400, 'bad_name', 'Names are 2–63 characters: a–z, 0–9 and "-", not starting or ending with "-".');
  }
  return name;
}

async function getSite(env: Env, key: string): Promise<SiteRow> {
  const site = await env.DB.prepare('SELECT * FROM names WHERE name = ?').bind(key.toLowerCase()).first<SiteRow>();
  if (!site) throw new HttpError(404, 'no_such_site', `${siteAddress(key)} doesn't exist.`);
  return site;
}

/**
 * Every table that keeps things by site key (the `site` column). A site moving to its other
 * ending takes them all with it, so add new ones here.
 */
const SITE_TABLES = [
  'site_files', 'site_visits', 'guestbook', 'achievements', 'site_editors', 'site_drafts', 'page_comments', 'poll_votes',
  'site_likes', 'scores', 'wall_strokes', 'page_views', 'site_referrals',
];

/**
 * Move a site to its other ending (hello.biggle ↔ hello.b), files and all. The other address
 * must be free.
 */
export async function moveSite(env: Env, key: string, tld: Tld): Promise<string> {
  const name = key.replace(/\.b$/, '');
  const next = siteKey(name, tld);
  if (next === key) return key;
  if (await env.DB.prepare('SELECT 1 FROM names WHERE name = ?').bind(next).first()) {
    throw new HttpError(409, 'name_taken', `${siteAddress(next)} is taken.`);
  }
  // New row, then the files, visits and guestbook, then the old row, so they always belong to a site.
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO names (name, url, title, owner_id, status, review_note, created_at, updated_at, live, tld)
       SELECT ?, url, title, owner_id, status, review_note, created_at, unixepoch(), live, ? FROM names WHERE name = ?`,
    ).bind(next, tld, key),
    ...SITE_TABLES.map((table) => env.DB.prepare(`UPDATE ${table} SET site = ? WHERE site = ?`).bind(next, key)),
    env.DB.prepare('DELETE FROM names WHERE name = ?').bind(key),
  ]);
  forget(key);
  forget(next);
  return next;
}

/**
 * The site, if this user may edit it: its owner, someone they added as an editor, or an admin.
 * `ownerOnly`: things only the owner (or an admin) may do, like deleting it.
 */
async function editable(req: Request, env: Env, name: string, ownerOnly = false): Promise<{ user: User; site: SiteRow; owner: boolean }> {
  const user = await requireUser(req, env);
  const site = await getSite(env, name);
  const owner = site.owner_id === user.id || !!user.is_admin;
  const editor = !owner && !!(await env.DB.prepare('SELECT 1 FROM site_editors WHERE site = ? AND user_id = ?').bind(site.name, user.id).first());
  if (!owner && (ownerOnly || !editor)) throw new HttpError(403, 'not_yours', "That isn't your site.");
  if (site.url) throw new HttpError(400, 'external', `${siteAddress(site.name)} is hosted somewhere else, so it can't be edited here.`);
  return { user, site, owner };
}

/**
 * Changes to a live site wait as drafts until someone presses Publish, so visitors never see
 * half-made edits. Sites waiting for approval have no visitors yet: their changes go straight in.
 */
const usesDrafts = (site: SiteRow) => site.status === 'live';

type FileRow = { path: string; type: string; size: number; updated_at: number };

/** The site's files as its editors see them: drafts over the published ones. */
async function editorFiles(env: Env, site: SiteRow): Promise<{ files: FileRow[]; changes: { path: string; kind: 'added' | 'changed' | 'deleted' }[] }> {
  const [live, drafts] = await env.DB.batch([
    env.DB.prepare('SELECT path, type, size, updated_at FROM site_files WHERE site = ? ORDER BY path').bind(site.name),
    env.DB.prepare('SELECT path, type, size, updated_at, deleted FROM site_drafts WHERE site = ? ORDER BY path').bind(site.name),
  ]);
  const files = new Map((live.results as FileRow[]).map((f) => [f.path, f]));
  const changes: { path: string; kind: 'added' | 'changed' | 'deleted' }[] = [];
  for (const d of drafts.results as (FileRow & { deleted: number })[]) {
    const had = files.has(d.path);
    if (d.deleted) {
      if (had) changes.push({ path: d.path, kind: 'deleted' });
      files.delete(d.path);
    } else {
      changes.push({ path: d.path, kind: had ? 'changed' : 'added' });
      files.set(d.path, { path: d.path, type: d.type, size: d.size, updated_at: d.updated_at });
    }
  }
  return { files: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)), changes };
}

const publicSite = (s: SiteRow) => ({
  /** The site's key: "hello" for hello.biggle, "hello.b" for hello.b. */
  name: s.name,
  tld: s.name.endsWith('.b') ? 'b' : 'biggle',
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
  // Sites I own and sites I help edit, with how many visits each has had (in all and in the last
  // 7 days) and whether there are unpublished changes.
  const { results } = await env.DB.prepare(
    `SELECT n.*, CASE WHEN n.owner_id = ?2 THEN 'owner' ELSE 'editor' END AS role,
       (SELECT COUNT(*) FROM site_visits v WHERE v.site = n.name) AS visits,
       (SELECT COUNT(*) FROM site_visits v WHERE v.site = n.name AND v.day > ?1) AS week,
       (SELECT COUNT(*) FROM site_drafts d WHERE d.site = n.name) AS drafts
     FROM names n
     WHERE n.owner_id = ?2 OR n.name IN (SELECT site FROM site_editors WHERE user_id = ?2)
     ORDER BY n.created_at DESC`,
  )
    .bind(today() - 7, user.id)
    .all<SiteRow & { visits: number; week: number; role: 'owner' | 'editor'; drafts: number }>();
  return json({
    sites: results.map((s) => ({ ...publicSite(s), visits: s.visits, week: s.week, role: s.role, drafts: s.drafts })),
    limit: user.is_admin ? null : MAX_SITES,
    short: canUseShort(user),
  });
}

export async function checkAvailable(req: Request, env: Env, raw: string): Promise<Response> {
  await requireUser(req, env);
  let name: string;
  try {
    name = checkName(raw);
  } catch (e) {
    return json({ available: false, reason: (e as Error).message });
  }
  // "hello.b" asks about the .b address; anything else about .biggle.
  const key = siteKey(name, splitAddress(raw).tld ?? 'biggle');
  if (RESERVED.has(name)) return json({ available: false, reason: `${siteAddress(key)} is reserved.` });
  const taken = await env.DB.prepare('SELECT 1 FROM names WHERE name = ?').bind(key).first();
  return json({ available: !taken, reason: taken ? `${siteAddress(key)} is taken.` : null });
}

export async function createSite(req: Request, env: Env): Promise<Response> {
  const user = await requireUser(req, env);
  const body = await readJson(req);
  const name = checkName(str(body.name));
  const tld = checkTld(user, body.tld ?? splitAddress(str(body.name)).tld);
  const key = siteKey(name, tld);
  if (RESERVED.has(name)) throw new HttpError(409, 'name_taken', `${siteAddress(key)} is reserved.`);
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
      env.DB.prepare("INSERT INTO names (name, tld, title, owner_id, status) VALUES (?, ?, ?, ?, 'pending')").bind(key, tld, title, user.id),
      ...Object.entries(files).map(([path, text]) => {
        const bytes = enc.encode(text);
        return env.DB.prepare('INSERT INTO site_files (site, path, type, content, size) VALUES (?, ?, ?, ?, ?)').bind(
          key,
          path,
          checkPath(path).type,
          bytes,
          bytes.length,
        );
      }),
    ]);
  } catch (e) {
    if (String(e).includes('UNIQUE')) throw new HttpError(409, 'name_taken', `${siteAddress(key)} is taken.`);
    throw e;
  }
  await notifyAdmins(env);
  return json({ site: publicSite(await getSite(env, key)) }, 201);
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
  const { site, owner } = await editable(req, env, name);
  const { files, changes } = await editorFiles(env, site);
  const { results: editors } = await env.DB.prepare('SELECT u.username FROM site_editors e JOIN users u ON u.id = e.user_id WHERE e.site = ? ORDER BY e.added_at')
    .bind(site.name)
    .all<{ username: string }>();
  const ownerName = site.owner_id ? (await env.DB.prepare('SELECT username FROM users WHERE id = ?').bind(site.owner_id).first<{ username: string }>())?.username : null;
  return json({
    site: publicSite(site),
    files: files.map((f) => ({ path: f.path, type: f.type, size: f.size, updatedAt: f.updated_at })),
    limits: { file: MAX_FILE, site: MAX_SITE, files: MAX_FILES },
    /** Unpublished changes (live sites only). */
    changes,
    drafts: usesDrafts(site),
    owner: ownerName ?? null,
    editors: editors.map((e) => e.username),
    canManage: owner,
  });
}

/** Put a live site's drafts live. */
export async function publishSite(req: Request, env: Env, name: string): Promise<Response> {
  const { site, user } = await editable(req, env, name);
  const { results } = await env.DB.prepare('SELECT path, type, content, size, deleted FROM site_drafts WHERE site = ?').bind(site.name).all<{
    path: string;
    type: string;
    content: ArrayBuffer | number[];
    size: number;
    deleted: number;
  }>();
  if (!results.length) return json({ published: 0 });
  await env.DB.batch([
    ...results.map((d) =>
      d.deleted
        ? env.DB.prepare('DELETE FROM site_files WHERE site = ? AND path = ?').bind(site.name, d.path)
        : env.DB.prepare(
            `INSERT INTO site_files (site, path, type, content, size) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(site, path) DO UPDATE SET type = excluded.type, content = excluded.content, size = excluded.size, updated_at = unixepoch()`,
          ).bind(site.name, d.path, d.type, blobBytes(d.content), d.size),
    ),
    env.DB.prepare('DELETE FROM site_drafts WHERE site = ?').bind(site.name),
  ]);
  await touch(env, site.name);
  await afterPublish(env, site.name, user.id);
  return json({ published: results.length });
}

/** Throw away a live site's drafts. */
export async function discardDrafts(req: Request, env: Env, name: string): Promise<Response> {
  const { site } = await editable(req, env, name);
  await env.DB.prepare('DELETE FROM site_drafts WHERE site = ?').bind(site.name).run();
  return json({});
}

/** People who follow a site hear it changed (follows.ts sets this up). */
export let afterPublish: (env: Env, site: string, by: number) => Promise<void> = async () => {};
export const onPublish = (fn: typeof afterPublish) => (afterPublish = fn);

// --- Editors: people who can edit a site with its owner ---

export async function addEditor(req: Request, env: Env, name: string): Promise<Response> {
  const { site, user } = await editable(req, env, name, true);
  const username = str((await readJson(req)).username).trim().toLowerCase().replace(/^@/, '');
  const other = await env.DB.prepare('SELECT id, username FROM users WHERE username = ?').bind(username).first<{ id: number; username: string }>();
  if (!other) throw new HttpError(404, 'no_such_user', `There's nobody called ${username} on the Bigglenet.`);
  if (other.id === site.owner_id) throw new HttpError(400, 'owner', `${other.username} already owns this site.`);
  const friends = await env.DB.prepare("SELECT 1 FROM friendships WHERE user_id = ? AND friend_id = ? AND status = 'friends'").bind(user.id, other.id).first();
  if (!friends && !user.is_admin) throw new HttpError(403, 'not_friends', `You can only add friends, and ${other.username} isn't one yet.`);
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM site_editors WHERE site = ?').bind(site.name).first<{ n: number }>();
  if ((count?.n ?? 0) >= 10) throw new HttpError(400, 'too_many', 'A site can have up to 10 editors.');
  await env.DB.prepare('INSERT OR IGNORE INTO site_editors (site, user_id) VALUES (?, ?)').bind(site.name, other.id).run();
  await addNotification(env, other.id, 'co-owner', { site: site.name, from: user.username });
  await notify(env, other.id, { type: 'site', name: site.name, status: site.status });
  return json({ editors: await editorNames(env, site.name) });
}

export async function removeEditor(req: Request, env: Env, name: string, username: string): Promise<Response> {
  const user = await requireUser(req, env);
  const site = await getSite(env, name);
  const other = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username.toLowerCase()).first<{ id: number }>();
  if (!other) throw new HttpError(404, 'no_such_user', `There's nobody called ${username}.`);
  // The owner can remove anyone; editors can leave.
  if (other.id !== user.id && site.owner_id !== user.id && !user.is_admin) throw new HttpError(403, 'not_yours', "That isn't your site.");
  await env.DB.prepare('DELETE FROM site_editors WHERE site = ? AND user_id = ?').bind(site.name, other.id).run();
  await notify(env, other.id, { type: 'site', name: site.name, status: site.status });
  return json({ editors: await editorNames(env, site.name) });
}

async function editorNames(env: Env, site: string) {
  const { results } = await env.DB.prepare('SELECT u.username FROM site_editors e JOIN users u ON u.id = e.user_id WHERE e.site = ? ORDER BY e.added_at').bind(site).all<{ username: string }>();
  return results.map((r) => r.username);
}

export async function updateSite(req: Request, env: Env, name: string): Promise<Response> {
  const { user, site, owner } = await editable(req, env, name);
  if (!owner && (await readJson(req.clone())).tld !== undefined) throw new HttpError(403, 'not_yours', 'Only the owner can change the address.');
  const body = await readJson(req);
  const title = str(body.title).trim().slice(0, 80);
  if (title) await env.DB.prepare('UPDATE names SET title = ?, updated_at = unixepoch() WHERE name = ?').bind(title, site.name).run();
  // Switching endings moves the site to its other address.
  const key = body.tld === undefined ? site.name : await moveSite(env, site.name, checkTld(user, body.tld));
  return json({ site: publicSite(await getSite(env, key)) });
}

export async function deleteSite(req: Request, env: Env, name: string): Promise<Response> {
  const { site } = await editable(req, env, name, true);
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
  // The draft, if there is one.
  const draft = await env.DB.prepare('SELECT type, content, deleted FROM site_drafts WHERE site = ? AND path = ?')
    .bind(site.name, path)
    .first<{ type: string; content: ArrayBuffer | number[]; deleted: number }>();
  const file =
    draft && !draft.deleted
      ? draft
      : draft?.deleted
        ? null
        : await env.DB.prepare('SELECT type, content FROM site_files WHERE site = ? AND path = ?')
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

  const others = (await editorFiles(env, site)).files.filter((f) => f.path !== path);
  if (others.length >= MAX_FILES) throw new HttpError(400, 'too_many_files', `A site can have up to ${MAX_FILES} files.`);
  if (others.reduce((n, f) => n + f.size, 0) + bytes.length > MAX_SITE) throw new HttpError(400, 'site_full', 'A site can use up to 5 MB.');

  const table = usesDrafts(site) ? 'site_drafts' : 'site_files';
  await env.DB.prepare(
    `INSERT INTO ${table} (site, path, type, content, size) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(site, path) DO UPDATE SET type = excluded.type, content = excluded.content,
       size = excluded.size, updated_at = unixepoch()${usesDrafts(site) ? ', deleted = 0' : ''}`,
  )
    .bind(site.name, path, type, bytes, bytes.length)
    .run();
  // A draft that's now the same as the published file isn't a change.
  if (usesDrafts(site)) {
    const live = await env.DB.prepare('SELECT content FROM site_files WHERE site = ? AND path = ?').bind(site.name, path).first<{ content: ArrayBuffer | number[] }>();
    if (live && sameBytes(blobBytes(live.content), bytes)) await env.DB.prepare('DELETE FROM site_drafts WHERE site = ? AND path = ?').bind(site.name, path).run();
  } else {
    await touch(env, site.name);
  }
  return json({ path, type, size: bytes.length, draft: usesDrafts(site) });
}

function sameBytes(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export async function deleteFile(req: Request, env: Env, name: string, rawPath: string): Promise<Response> {
  const { site } = await editable(req, env, name);
  const { path } = checkPath(rawPath);
  if (path === 'index.bhtml') throw new HttpError(400, 'needs_index', 'Every site needs an index.bhtml.');
  if (usesDrafts(site)) {
    const live = await env.DB.prepare('SELECT type FROM site_files WHERE site = ? AND path = ?').bind(site.name, path).first<{ type: string }>();
    if (live) {
      // Gone when it's published.
      await env.DB.prepare(
        `INSERT INTO site_drafts (site, path, type, content, size, deleted) VALUES (?, ?, ?, X'', 0, 1)
         ON CONFLICT(site, path) DO UPDATE SET deleted = 1, content = X'', size = 0, updated_at = unixepoch()`,
      )
        .bind(site.name, path, live.type)
        .run();
    } else {
      await env.DB.prepare('DELETE FROM site_drafts WHERE site = ? AND path = ?').bind(site.name, path).run();
    }
    return json({ draft: true });
  }
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
  const m = /^([a-z0-9-]+(?:\.b)?)\.(\d+)\.([A-Za-z0-9_-]+)$/.exec(token);
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
  if (site.owner_id) {
    await notify(env, site.owner_id, { type: 'site', name: site.name, status });
    await addNotification(env, site.owner_id, status === 'live' ? 'site-approved' : 'site-rejected', { site: site.name, note });
  }
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

/** GET /api/sites/:key/manifest: a live site's files, for saving it for offline. */
export async function manifest(req: Request, env: Env, name: string): Promise<Response> {
  await requireUser(req, env);
  const site = await getSite(env, name);
  if (site.status !== 'live') throw new HttpError(404, 'no_such_site', `${siteAddress(site.name)} doesn't exist.`);
  if (site.url) throw new HttpError(400, 'external', `${siteAddress(site.name)} is hosted somewhere else, so it can't be saved for offline.`);
  const { results } = await env.DB.prepare('SELECT path, type, size FROM site_files WHERE site = ? ORDER BY path').bind(site.name).all<{ path: string; type: string; size: number }>();
  return json({ files: results });
}
