// Collections: lists of favourite sites to share. Listed ones show on your profile; any of them
// can be shared with its link (biggle://collections/<id>, a random id nobody can guess).
//
//   GET    /api/collections                  yours
//   POST   /api/collections                  { title, description, listed } → { id }
//   GET    /api/collections/for/:site        yours, and which of them have this site in
//   GET    /api/collections/:id              the collection and its sites
//   PATCH  /api/collections/:id              { title, description, listed }
//   DELETE /api/collections/:id
//   POST   /api/collections/:id/sites        { site, note }
//   DELETE /api/collections/:id/sites/:site
//   PUT    /api/collections/:id/order        { sites }: the new order
import { requireUser, type User } from './auth';
import { record } from './feed';
import { HttpError, json, readJson, SITE_KEY_RE, siteAddress, str } from './http';
import { blockedBetween } from './people';

const MAX_OWNED = 50;
const MAX_SITES = 100;
const MAX_TITLE = 60;
const MAX_DESCRIPTION = 500;
const MAX_NOTE = 200;
const ID_RE = /^[A-Za-z0-9]{10}$/;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

type Collection = { id: string; user_id: number; title: string; description: string | null; listed: number; created_at: number; updated_at: number };

const newId = () => [...crypto.getRandomValues(new Uint8Array(10))].map((b) => ALPHABET[b % ALPHABET.length]).join('');
const cleanTitle = (v: unknown) => str(v).replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE);
const cleanSite = (v: unknown) => str(v).trim().toLowerCase().replace(/^biggle:\/\//, '').replace(/[/?#].*$/, '').replace(/\.biggle$/, '');

async function getCollection(env: Env, raw: string): Promise<Collection> {
  const c = ID_RE.test(raw) ? await env.DB.prepare('SELECT * FROM collections WHERE id = ?').bind(raw).first<Collection>() : null;
  if (!c) throw new HttpError(404, 'no_such_collection', 'That collection doesn’t exist any more.');
  return c;
}

async function mine(env: Env, raw: string, me: User): Promise<Collection> {
  const c = await getCollection(env, raw);
  if (c.user_id !== me.id && !me.is_admin) throw new HttpError(403, 'not_yours', 'That isn’t your collection.');
  return c;
}

const touch = (env: Env, id: string) => env.DB.prepare('UPDATE collections SET updated_at = unixepoch() WHERE id = ?').bind(id);

const card = (c: Collection & { sites?: number }) => ({
  id: c.id,
  title: c.title,
  description: c.description,
  listed: !!c.listed,
  sites: c.sites ?? 0,
  updatedAt: c.updated_at,
});

export async function myCollections(req: Request, env: Env): Promise<Response> {
  const me = await requireUser(req, env);
  const { results } = await env.DB.prepare(
    `SELECT c.*, (SELECT COUNT(*) FROM collection_sites s WHERE s.collection_id = c.id) AS sites
     FROM collections c WHERE c.user_id = ? ORDER BY c.updated_at DESC`,
  )
    .bind(me.id)
    .all<Collection & { sites: number }>();
  return json({ collections: results.map(card) });
}

export async function createCollection(req: Request, env: Env): Promise<Response> {
  const me = await requireUser(req, env);
  const input = await readJson(req);
  const title = cleanTitle(input.title);
  if (!title) throw new HttpError(400, 'no_title', 'Give the collection a name.');
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM collections WHERE user_id = ?').bind(me.id).first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_OWNED) throw new HttpError(400, 'too_many', `You can have up to ${MAX_OWNED} collections.`);
  const id = newId();
  const listed = input.listed !== false;
  await env.DB.prepare('INSERT INTO collections (id, user_id, title, description, listed) VALUES (?, ?, ?, ?, ?)')
    .bind(id, me.id, title, str(input.description).trim().slice(0, MAX_DESCRIPTION) || null, listed ? 1 : 0)
    .run();
  if (listed) await record(env, me.id, 'collection-new', { collection: id, title });
  return json({ id }, 201);
}

export async function collectionsFor(req: Request, env: Env, rawSite: string): Promise<Response> {
  const me = await requireUser(req, env);
  const site = cleanSite(rawSite);
  const { results } = await env.DB.prepare(
    `SELECT c.*, (SELECT COUNT(*) FROM collection_sites s WHERE s.collection_id = c.id) AS sites,
       EXISTS (SELECT 1 FROM collection_sites s WHERE s.collection_id = c.id AND s.site = ?2) AS has
     FROM collections c WHERE c.user_id = ?1 ORDER BY c.updated_at DESC`,
  )
    .bind(me.id, site)
    .all<Collection & { sites: number; has: number }>();
  return json({ collections: results.map((c) => ({ ...card(c), has: !!c.has })) });
}

export async function getCollectionInfo(req: Request, env: Env, raw: string): Promise<Response> {
  const me = await requireUser(req, env);
  const c = await getCollection(env, raw);
  if (c.user_id !== me.id && (await blockedBetween(env, me.id, c.user_id))) throw new HttpError(404, 'no_such_collection', 'That collection doesn’t exist any more.');
  const [sites, owner] = await env.DB.batch([
    env.DB.prepare(
      `SELECT s.site, s.note, s.added_at, n.title, n.status, n.tld FROM collection_sites s JOIN names n ON n.name = s.site
       WHERE s.collection_id = ? ORDER BY s.position, s.added_at`,
    ).bind(c.id),
    env.DB.prepare('SELECT username, avatar_v FROM users WHERE id = ?').bind(c.user_id),
  ]);
  const by = owner.results[0] as { username: string; avatar_v: number | null };
  const isMine = c.user_id === me.id;
  type Row = { site: string; note: string | null; added_at: number; title: string | null; status: string };
  return json({
    collection: { ...card({ ...c, sites: sites.results.length }), by: by.username, avatar: by.avatar_v, createdAt: c.created_at },
    // Sites waiting for approval only show to whoever made the collection.
    sites: (sites.results as Row[])
      .filter((s) => s.status === 'live' || isMine)
      .map((s) => ({ site: s.site, address: siteAddress(s.site), title: s.title, note: s.note, live: s.status === 'live', addedAt: s.added_at })),
    mine: isMine,
  });
}

export async function updateCollection(req: Request, env: Env, raw: string): Promise<Response> {
  const me = await requireUser(req, env);
  const c = await mine(env, raw, me);
  const input = await readJson(req);
  const title = input.title === undefined ? c.title : cleanTitle(input.title);
  if (!title) throw new HttpError(400, 'no_title', 'Give the collection a name.');
  await env.DB.prepare('UPDATE collections SET title = ?, description = ?, listed = ?, updated_at = unixepoch() WHERE id = ?')
    .bind(
      title,
      input.description === undefined ? c.description : str(input.description).trim().slice(0, MAX_DESCRIPTION) || null,
      input.listed === undefined ? c.listed : input.listed ? 1 : 0,
      c.id,
    )
    .run();
  return json({});
}

export async function deleteCollection(req: Request, env: Env, raw: string): Promise<Response> {
  const me = await requireUser(req, env);
  const c = await mine(env, raw, me);
  await env.DB.prepare('DELETE FROM collections WHERE id = ?').bind(c.id).run();
  return json({});
}

export async function addToCollection(req: Request, env: Env, raw: string): Promise<Response> {
  const me = await requireUser(req, env);
  const c = await mine(env, raw, me);
  const input = await readJson(req);
  const site = cleanSite(input.site);
  if (!SITE_KEY_RE.test(site)) throw new HttpError(400, 'bad_site', 'That isn’t a site address.');
  const row = await env.DB.prepare('SELECT name, status, owner_id FROM names WHERE name = ?').bind(site).first<{ name: string; status: string; owner_id: number | null }>();
  if (!row || (row.status !== 'live' && row.owner_id !== me.id)) throw new HttpError(404, 'no_such_site', `${siteAddress(site)} doesn't exist.`);
  const count = await env.DB.prepare('SELECT COUNT(*) AS n, MAX(position) AS last FROM collection_sites WHERE collection_id = ?').bind(c.id).first<{ n: number; last: number | null }>();
  if ((count?.n ?? 0) >= MAX_SITES) throw new HttpError(400, 'too_many', `A collection can have up to ${MAX_SITES} sites.`);
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO collection_sites (collection_id, site, note, position) VALUES (?, ?, ?, ?)')
      .bind(c.id, row.name, str(input.note).trim().slice(0, MAX_NOTE) || null, (count?.last ?? -1) + 1),
    touch(env, c.id),
  ]);
  return json({});
}

export async function removeFromCollection(req: Request, env: Env, raw: string, rawSite: string): Promise<Response> {
  const me = await requireUser(req, env);
  const c = await mine(env, raw, me);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM collection_sites WHERE collection_id = ? AND site = ?').bind(c.id, cleanSite(rawSite)),
    touch(env, c.id),
  ]);
  return json({});
}

export async function reorderCollection(req: Request, env: Env, raw: string): Promise<Response> {
  const me = await requireUser(req, env);
  const c = await mine(env, raw, me);
  const input = await readJson(req);
  const sites = Array.isArray(input.sites) ? input.sites.map(cleanSite).slice(0, MAX_SITES) : [];
  await env.DB.batch([
    ...sites.map((site, i) => env.DB.prepare('UPDATE collection_sites SET position = ? WHERE collection_id = ? AND site = ?').bind(i, c.id, site)),
    touch(env, c.id),
  ]);
  return json({});
}
