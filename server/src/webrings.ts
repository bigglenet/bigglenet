// Webrings, like the old web: sites linked in a circle. Each site in a ring shows
// <biggle-webring ring="3"> with links to the site before it, the one after it, and a random one.
// Anyone can start a ring; whoever runs a site can add it to one; a ring's owner can take sites out.
//
//   GET    /api/webrings                     every ring
//   POST   /api/webrings                     { name, description } → { id }
//   GET    /api/webrings/:id                 the ring and its sites
//   PATCH  /api/webrings/:id                 its owner: { name, description }
//   DELETE /api/webrings/:id                 its owner (or an admin)
//   POST   /api/webrings/:id/sites           { site }: one you run
//   DELETE /api/webrings/:id/sites/:site     the ring's owner, or whoever runs the site
//   GET    /api/webrings/:id/around/:site    the ring as one of its sites sees it (for the tag)
import { requireUser, type User } from './auth';
import { HttpError, json, readJson, siteAddress, str } from './http';
import { isEditor } from './sites';

const MAX_NAME = 50;
const MAX_DESCRIPTION = 300;
const MAX_SITES = 100;
const MAX_OWNED = 10;

type Ring = { id: number; name: string; description: string | null; owner_id: number | null; created_at: number };

async function getRing(env: Env, raw: string): Promise<Ring> {
  const ring = await env.DB.prepare('SELECT * FROM webrings WHERE id = ?').bind(Number(raw)).first<Ring>();
  if (!ring) throw new HttpError(404, 'no_such_ring', 'That webring doesn’t exist any more.');
  return ring;
}

const cleanName = (v: unknown) => str(v).replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
const siteParam = (raw: unknown) => str(raw).trim().toLowerCase().replace(/^biggle:\/\//, '').replace(/[/?#].*$/, '').replace(/\.biggle$/, '');

/** Whoever runs a site: its owner, an editor (or club member) or an admin. */
async function runs(env: Env, site: string, me: User): Promise<boolean> {
  const row = await env.DB.prepare('SELECT owner_id FROM names WHERE name = ?').bind(site).first<{ owner_id: number | null }>();
  if (!row) return false;
  return row.owner_id === me.id || !!me.is_admin || isEditor(env, site, me.id);
}

/** Every site you run, in one query (a ring can have a hundred sites; see clubs.ts on limits). */
async function sitesYouRun(env: Env, me: User): Promise<Set<string>> {
  const { results } = await env.DB.prepare(
    `SELECT name FROM names WHERE owner_id = ?1
     UNION SELECT site FROM site_editors WHERE user_id = ?1
     UNION SELECT c.site FROM clubs c JOIN club_members m ON m.club_id = c.id WHERE m.user_id = ?1 AND c.site IS NOT NULL`,
  )
    .bind(me.id)
    .all<{ name: string }>();
  return new Set(results.map((r) => r.name));
}

/** A ring's live sites, in order round the circle. */
async function ringSites(env: Env, ringId: number) {
  const { results } = await env.DB.prepare(
    `SELECT w.site, n.tld, n.title FROM webring_sites w JOIN names n ON n.name = w.site
     WHERE w.ring_id = ? AND n.status = 'live' ORDER BY w.added_at, w.site`,
  )
    .bind(ringId)
    .all<{ site: string; tld: string; title: string | null }>();
  return results;
}

export async function listRings(req: Request, env: Env): Promise<Response> {
  await requireUser(req, env);
  const { results } = await env.DB.prepare(
    `SELECT r.id, r.name, r.description, u.username AS owner,
       (SELECT COUNT(*) FROM webring_sites w JOIN names n ON n.name = w.site WHERE w.ring_id = r.id AND n.status = 'live') AS sites
     FROM webrings r LEFT JOIN users u ON u.id = r.owner_id ORDER BY sites DESC, r.id DESC LIMIT 200`,
  ).all();
  return json({ rings: results });
}

export async function createRing(req: Request, env: Env): Promise<Response> {
  const me = await requireUser(req, env);
  const input = await readJson(req);
  const name = cleanName(input.name);
  if (!name) throw new HttpError(400, 'no_name', 'Give the webring a name.');
  const owned = await env.DB.prepare('SELECT COUNT(*) AS n FROM webrings WHERE owner_id = ?').bind(me.id).first<{ n: number }>();
  if ((owned?.n ?? 0) >= MAX_OWNED && !me.is_admin) throw new HttpError(400, 'too_many', `You can run up to ${MAX_OWNED} webrings.`);
  const ring = await env.DB.prepare('INSERT INTO webrings (name, description, owner_id) VALUES (?, ?, ?) RETURNING id')
    .bind(name, str(input.description).trim().slice(0, MAX_DESCRIPTION) || null, me.id)
    .first<{ id: number }>();
  return json({ id: ring!.id }, 201);
}

export async function getRingInfo(req: Request, env: Env, raw: string): Promise<Response> {
  const me = await requireUser(req, env);
  const ring = await getRing(env, raw);
  const owner = ring.owner_id ? await env.DB.prepare('SELECT username FROM users WHERE id = ?').bind(ring.owner_id).first<{ username: string }>() : null;
  const sites = await ringSites(env, ring.id);
  const mine = ring.owner_id === me.id || !!me.is_admin;
  const yours = await sitesYouRun(env, me);
  return json({
    ring: { id: ring.id, name: ring.name, description: ring.description, owner: owner?.username ?? null, createdAt: ring.created_at },
    sites: sites.map((s) => ({ site: s.site, address: siteAddress(s.site), title: s.title, canRemove: mine || yours.has(s.site) })),
    mine,
  });
}

export async function updateRing(req: Request, env: Env, raw: string): Promise<Response> {
  const me = await requireUser(req, env);
  const ring = await getRing(env, raw);
  if (ring.owner_id !== me.id && !me.is_admin) throw new HttpError(403, 'not_yours', 'Only the webring’s owner can change it.');
  const input = await readJson(req);
  const name = input.name === undefined ? ring.name : cleanName(input.name);
  if (!name) throw new HttpError(400, 'no_name', 'Give the webring a name.');
  await env.DB.prepare('UPDATE webrings SET name = ?, description = ? WHERE id = ?')
    .bind(name, input.description === undefined ? ring.description : str(input.description).trim().slice(0, MAX_DESCRIPTION) || null, ring.id)
    .run();
  return json({});
}

export async function deleteRing(req: Request, env: Env, raw: string): Promise<Response> {
  const me = await requireUser(req, env);
  const ring = await getRing(env, raw);
  if (ring.owner_id !== me.id && !me.is_admin) throw new HttpError(403, 'not_yours', 'Only the webring’s owner can delete it.');
  await env.DB.prepare('DELETE FROM webrings WHERE id = ?').bind(ring.id).run();
  return json({});
}

export async function joinRing(req: Request, env: Env, raw: string): Promise<Response> {
  const me = await requireUser(req, env);
  const ring = await getRing(env, raw);
  const site = siteParam((await readJson(req)).site);
  if (!(await runs(env, site, me))) throw new HttpError(403, 'not_yours', 'You can only add sites you run.');
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM webring_sites WHERE ring_id = ?').bind(ring.id).first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_SITES) throw new HttpError(400, 'full', `A webring can have up to ${MAX_SITES} sites.`);
  await env.DB.prepare('INSERT OR IGNORE INTO webring_sites (ring_id, site, added_by) VALUES (?, ?, ?)').bind(ring.id, site, me.id).run();
  return json({});
}

export async function leaveRing(req: Request, env: Env, raw: string, rawSite: string): Promise<Response> {
  const me = await requireUser(req, env);
  const ring = await getRing(env, raw);
  const site = siteParam(rawSite);
  if (ring.owner_id !== me.id && !me.is_admin && !(await runs(env, site, me))) throw new HttpError(403, 'not_yours', 'Only the webring’s owner or the site’s owner can do that.');
  await env.DB.prepare('DELETE FROM webring_sites WHERE ring_id = ? AND site = ?').bind(ring.id, site).run();
  return json({});
}

/** The ring from one site: the one before it, the one after it, and a random other one. */
export async function around(req: Request, env: Env, raw: string, rawSite: string): Promise<Response> {
  await requireUser(req, env);
  const ring = await getRing(env, raw);
  const site = siteParam(rawSite);
  const sites = await ringSites(env, ring.id);
  const i = sites.findIndex((s) => s.site === site);
  const shown = (s: (typeof sites)[number] | undefined) => (s ? { site: s.site, address: siteAddress(s.site), title: s.title } : null);
  const others = sites.filter((s) => s.site !== site);
  return json({
    ring: { id: ring.id, name: ring.name, sites: sites.length },
    member: i !== -1,
    prev: i === -1 || sites.length < 2 ? null : shown(sites[(i - 1 + sites.length) % sites.length]),
    next: i === -1 || sites.length < 2 ? null : shown(sites[(i + 1) % sites.length]),
    random: shown(others[Math.floor(Math.random() * others.length)]),
  });
}
