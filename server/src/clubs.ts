// Clubs: a group of people with a member list, their own chat and, if they like, a shared site
// every member can edit. Open clubs are listed for anyone to join; closed ones need an invite
// from a member.
//
// Changes reach members as one event message in the club's chat ("joined the club"), which also
// tells their browsers to look again: on Workers Free a request can only make 50 calls (database
// queries and pushes), so clubs are small and nothing is sent to each member twice.
//
//   GET    /api/clubs                       { mine, open }: your clubs, and open ones to join
//   POST   /api/clubs                       { name, description, emoji, open } → { id }
//   GET    /api/clubs/:id                   the club, its members and upcoming events
//   PATCH  /api/clubs/:id                   its owner: { name, description, emoji, open, site }
//   DELETE /api/clubs/:id                   its owner (or an admin)
//   POST   /api/clubs/:id/join              open clubs, or if you were invited
//   POST   /api/clubs/:id/leave
//   POST   /api/clubs/:id/invite            { username }: a member invites a friend
//   DELETE /api/clubs/:id/members/:username its owner takes someone out
import { requireUser, type User } from './auth';
import { areFriends, postMessage } from './chat';
import { record } from './feed';
import { HttpError, json, readJson, siteAddress, str } from './http';
import { notify } from './live';
import { addNotification } from './notifications';
import { blockedBetween, blockedIds } from './people';

const MAX_MEMBERS = 30;
const MAX_OWNED = 10;
const MAX_NAME = 40;
const MAX_DESCRIPTION = 500;

type Club = {
  id: number;
  name: string;
  description: string | null;
  emoji: string | null;
  owner_id: number | null;
  site: string | null;
  open: number;
  created_at: number;
};

const cleanName = (v: unknown) => str(v).replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
const cleanEmoji = (v: unknown) => [...str(v).trim()].slice(0, 2).join('') || null;

async function getClub(env: Env, raw: string): Promise<Club> {
  const club = await env.DB.prepare('SELECT * FROM clubs WHERE id = ?').bind(Number(raw)).first<Club>();
  if (!club) throw new HttpError(404, 'no_such_club', 'That club doesn’t exist any more.');
  return club;
}

const isMember = async (env: Env, clubId: number, userId: number) =>
  !!(await env.DB.prepare('SELECT 1 FROM club_members WHERE club_id = ? AND user_id = ?').bind(clubId, userId).first());

const isInvited = async (env: Env, clubId: number, userId: number) =>
  !!(await env.DB.prepare('SELECT 1 FROM club_invites WHERE club_id = ? AND user_id = ?').bind(clubId, userId).first());

const canManage = (club: Club, me: User) => club.owner_id === me.id || !!me.is_admin;

/** The club's own chat. */
const chatOf = async (env: Env, clubId: number) =>
  (await env.DB.prepare('SELECT id FROM chats WHERE club_id = ?').bind(clubId).first<{ id: number }>())?.id ?? null;

const card = (c: Club & { members: number }) => ({
  id: c.id,
  name: c.name,
  description: c.description,
  emoji: c.emoji,
  open: !!c.open,
  site: c.site,
  members: c.members,
});

export async function listClubs(req: Request, env: Env): Promise<Response> {
  const me = await requireUser(req, env);
  const count = '(SELECT COUNT(*) FROM club_members x WHERE x.club_id = c.id) AS members';
  const [mine, open, invited] = await env.DB.batch([
    env.DB.prepare(`SELECT c.*, ${count} FROM clubs c JOIN club_members m ON m.club_id = c.id AND m.user_id = ? ORDER BY c.name`).bind(me.id),
    env.DB.prepare(
      `SELECT c.*, ${count} FROM clubs c
       WHERE c.open = 1 AND c.id NOT IN (SELECT club_id FROM club_members WHERE user_id = ?)
       ORDER BY members DESC, c.id DESC LIMIT 50`,
    ).bind(me.id),
    env.DB.prepare(
      `SELECT c.*, ${count}, u.username AS from_name FROM club_invites i JOIN clubs c ON c.id = i.club_id LEFT JOIN users u ON u.id = i.from_id
       WHERE i.user_id = ? AND c.id NOT IN (SELECT club_id FROM club_members WHERE user_id = ?)`,
    ).bind(me.id, me.id),
  ]);
  type Row = Club & { members: number; from_name?: string | null };
  return json({
    mine: (mine.results as Row[]).map(card),
    open: (open.results as Row[]).map(card),
    invited: (invited.results as Row[]).map((c) => ({ ...card(c), from: c.from_name ?? null })),
  });
}

export async function createClub(req: Request, env: Env): Promise<Response> {
  const me = await requireUser(req, env);
  if (!(await env.MESSAGE_LIMIT.limit({ key: `club:${me.id}` })).success) throw new HttpError(429, 'slow_down', 'Slow down a little, then try again.');
  const body = await readJson(req);
  const name = cleanName(body.name);
  if (!name) throw new HttpError(400, 'no_name', 'Give the club a name.');
  const owned = await env.DB.prepare('SELECT COUNT(*) AS n FROM clubs WHERE owner_id = ?').bind(me.id).first<{ n: number }>();
  if ((owned?.n ?? 0) >= MAX_OWNED && !me.is_admin) throw new HttpError(400, 'too_many', `You can run up to ${MAX_OWNED} clubs.`);
  const open = body.open !== false;
  const club = await env.DB.prepare('INSERT INTO clubs (name, description, emoji, owner_id, open) VALUES (?, ?, ?, ?, ?) RETURNING id')
    .bind(name, str(body.description).trim().slice(0, MAX_DESCRIPTION) || null, cleanEmoji(body.emoji), me.id, open ? 1 : 0)
    .first<{ id: number }>();
  const id = club!.id;
  const chat = await env.DB.prepare("INSERT INTO chats (kind, name, created_by, club_id) VALUES ('group', ?, ?, ?) RETURNING id")
    .bind(name, me.id, id)
    .first<{ id: number }>();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO club_members (club_id, user_id) VALUES (?, ?)').bind(id, me.id),
    env.DB.prepare('INSERT INTO chat_members (chat_id, user_id) VALUES (?, ?)').bind(chat!.id, me.id),
  ]);
  await postMessage(env, chat!.id, me, 'started the club', 'event');
  await notify(env, me.id, { type: 'chats' });
  if (open) await record(env, me.id, 'club-new', { club: id, name, emoji: cleanEmoji(body.emoji) });
  return json({ id }, 201);
}

export async function getClubInfo(req: Request, env: Env, raw: string): Promise<Response> {
  const me = await requireUser(req, env);
  const club = await getClub(env, raw);
  const member = await isMember(env, club.id, me.id);
  const invited = !member && (await isInvited(env, club.id, me.id));
  if (!club.open && !member && !invited && !me.is_admin) throw new HttpError(404, 'no_such_club', 'That club doesn’t exist any more.');
  const now = Math.floor(Date.now() / 1000);
  const [members, events, site] = await env.DB.batch([
    env.DB.prepare(
      `SELECT u.id, u.username, u.avatar_v, m.joined_at FROM club_members m JOIN users u ON u.id = m.user_id
       WHERE m.club_id = ? ORDER BY m.joined_at`,
    ).bind(club.id),
    env.DB.prepare(
      `SELECT id, title, starts_at, place,
         (SELECT COUNT(*) FROM event_people p WHERE p.event_id = e.id AND p.answer = 'going') AS going
       FROM events e WHERE club_id = ? AND COALESCE(ends_at, starts_at + 7200) > ? ORDER BY starts_at LIMIT 10`,
    ).bind(club.id, now),
    env.DB.prepare('SELECT name, title, status FROM names WHERE name = ?').bind(club.site ?? ''),
  ]);
  const blocked = await blockedIds(env, me.id);
  type MemberRow = { id: number; username: string; avatar_v: number | null; joined_at: number };
  const people = members.results as MemberRow[];
  const owner = people.find((p) => p.id === club.owner_id)?.username ?? null;
  const s = site.results[0] as { name: string; title: string | null; status: string } | undefined;
  return json({
    club: card({ ...club, members: people.length }),
    owner,
    you: { member, invited, owner: club.owner_id === me.id, canManage: canManage(club, me) },
    members: people.filter((p) => !blocked.has(p.id)).map((p) => ({ username: p.username, avatar: p.avatar_v, joinedAt: p.joined_at })),
    // Only members see where the club talks.
    chat: member ? await chatOf(env, club.id) : null,
    site: s ? { name: s.name, title: s.title, live: s.status === 'live' } : null,
    events: (events.results as { id: number; title: string; starts_at: number; place: string | null; going: number }[]).map((e) => ({
      id: e.id,
      title: e.title,
      startsAt: e.starts_at,
      place: e.place,
      going: e.going,
    })),
  });
}

export async function updateClub(req: Request, env: Env, raw: string): Promise<Response> {
  const me = await requireUser(req, env);
  const club = await getClub(env, raw);
  if (!canManage(club, me)) throw new HttpError(403, 'not_yours', 'Only the club’s owner can change it.');
  const body = await readJson(req);
  const name = body.name === undefined ? club.name : cleanName(body.name);
  if (!name) throw new HttpError(400, 'no_name', 'Give the club a name.');
  let site = club.site;
  if (body.site !== undefined) {
    // The club's site: one of the owner's own sites (or none). Every member can then edit it.
    site = str(body.site).trim().toLowerCase().replace(/\.biggle$/, '') || null;
    if (site) {
      const row = await env.DB.prepare('SELECT owner_id FROM names WHERE name = ?').bind(site).first<{ owner_id: number | null }>();
      if (!row) throw new HttpError(404, 'no_such_site', `${siteAddress(site)} doesn't exist.`);
      if (row.owner_id !== me.id && !me.is_admin) throw new HttpError(403, 'not_yours', 'Pick one of your own sites.');
    }
  }
  await env.DB.prepare('UPDATE clubs SET name = ?, description = ?, emoji = ?, open = ?, site = ? WHERE id = ?')
    .bind(
      name,
      body.description === undefined ? club.description : str(body.description).trim().slice(0, MAX_DESCRIPTION) || null,
      body.emoji === undefined ? club.emoji : cleanEmoji(body.emoji),
      body.open === undefined ? club.open : body.open ? 1 : 0,
      site,
      club.id,
    )
    .run();
  // One message in the club's chat says what changed (and has everyone's browser look again).
  const said = [];
  if (name !== club.name) said.push(`renamed the club “${name}”`);
  if (site !== club.site) said.push(site ? `made ${siteAddress(site)} the club’s site` : 'stopped sharing a site with the club');
  const chat = await chatOf(env, club.id);
  if (chat && name !== club.name) await env.DB.prepare('UPDATE chats SET name = ? WHERE id = ?').bind(name, chat).run();
  if (chat && said.length) await postMessage(env, chat, me, said.join(' and '), 'event');
  return json({});
}

export async function deleteClub(req: Request, env: Env, raw: string): Promise<Response> {
  const me = await requireUser(req, env);
  const club = await getClub(env, raw);
  if (!canManage(club, me)) throw new HttpError(403, 'not_yours', 'Only the club’s owner can delete it.');
  const ids = await memberIdsOf(env, club.id);
  // Its chat and events go with it.
  await env.DB.prepare('DELETE FROM clubs WHERE id = ?').bind(club.id).run();
  await Promise.all(ids.map((id) => notify(env, id, { type: 'chats' })));
  return json({});
}

export async function joinClub(req: Request, env: Env, raw: string): Promise<Response> {
  const me = await requireUser(req, env);
  const club = await getClub(env, raw);
  if (await isMember(env, club.id, me.id)) return json({});
  if (!club.open && !(await isInvited(env, club.id, me.id))) throw new HttpError(403, 'closed', 'You need an invite from a member to join this club.');
  if (club.owner_id && (await blockedBetween(env, me.id, club.owner_id))) throw new HttpError(403, 'blocked', 'You can’t join this club.');
  await addMember(env, club, me);
  return json({});
}

async function addMember(env: Env, club: Club, user: { id: number; username: string }) {
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM club_members WHERE club_id = ?').bind(club.id).first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_MEMBERS) throw new HttpError(400, 'full', `A club can have up to ${MAX_MEMBERS} members.`);
  const chat = await chatOf(env, club.id);
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO club_members (club_id, user_id) VALUES (?, ?)').bind(club.id, user.id),
    env.DB.prepare('DELETE FROM club_invites WHERE club_id = ? AND user_id = ?').bind(club.id, user.id),
    ...(chat ? [env.DB.prepare('INSERT OR IGNORE INTO chat_members (chat_id, user_id) VALUES (?, ?)').bind(chat, user.id)] : []),
  ]);
  if (chat) await postMessage(env, chat, user as User, 'joined the club', 'event');
  else await notify(env, user.id, { type: 'chats' });
  if (club.open) await record(env, user.id, 'club-joined', { club: club.id, name: club.name, emoji: club.emoji });
}

async function removeMember(env: Env, club: Club, user: { id: number; username: string }, message: string) {
  const chat = await chatOf(env, club.id);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM club_members WHERE club_id = ? AND user_id = ?').bind(club.id, user.id),
    ...(chat ? [env.DB.prepare('DELETE FROM chat_members WHERE chat_id = ? AND user_id = ?').bind(chat, user.id)] : []),
  ]);
  // They're out of the chat now, so they hear separately; everyone left hears through it.
  await notify(env, user.id, { type: 'chats' });
  if (club.site) await notify(env, user.id, { type: 'site', name: club.site, status: 'live' });
  if (chat) await postMessage(env, chat, user as User, message, 'event');
}

export async function leaveClub(req: Request, env: Env, raw: string): Promise<Response> {
  const me = await requireUser(req, env);
  const club = await getClub(env, raw);
  if (!(await isMember(env, club.id, me.id))) return json({});
  const others = (await memberIdsOf(env, club.id)).filter((id) => id !== me.id);
  if (!others.length) {
    // The last one out: the club ends.
    await env.DB.prepare('DELETE FROM clubs WHERE id = ?').bind(club.id).run();
    await notify(env, me.id, { type: 'chats' });
    return json({ deleted: true });
  }
  await removeMember(env, club, me, 'left the club');
  // The owner leaving hands the club to whoever has been in it longest.
  if (club.owner_id === me.id) {
    const next = await env.DB.prepare('SELECT user_id FROM club_members WHERE club_id = ? ORDER BY joined_at LIMIT 1').bind(club.id).first<{ user_id: number }>();
    await env.DB.prepare('UPDATE clubs SET owner_id = ? WHERE id = ?').bind(next?.user_id ?? null, club.id).run();
  }
  return json({});
}

export async function inviteToClub(req: Request, env: Env, raw: string): Promise<Response> {
  const me = await requireUser(req, env);
  const club = await getClub(env, raw);
  if (!(await isMember(env, club.id, me.id))) throw new HttpError(403, 'not_member', 'Only members can invite people.');
  if (!(await env.MESSAGE_LIMIT.limit({ key: `club-invite:${me.id}` })).success) throw new HttpError(429, 'slow_down', 'Slow down a little, then try again.');
  const username = str((await readJson(req)).username).trim().toLowerCase().replace(/^@/, '');
  const other = await env.DB.prepare('SELECT id, username FROM users WHERE username = ?').bind(username).first<{ id: number; username: string }>();
  if (!other) throw new HttpError(404, 'no_such_user', `There's nobody called ${username} on the Bigglenet.`);
  if (!(await areFriends(env, me.id, other.id))) throw new HttpError(403, 'not_friends', `You can only invite friends, and ${other.username} isn't one yet.`);
  if (await isMember(env, club.id, other.id)) return json({ already: true });
  await env.DB.prepare('INSERT OR IGNORE INTO club_invites (club_id, user_id, from_id) VALUES (?, ?, ?)').bind(club.id, other.id, me.id).run();
  await addNotification(env, other.id, 'club-invite', { club: club.id, name: club.name, from: me.username });
  return json({});
}

export async function removeFromClub(req: Request, env: Env, raw: string, username: string): Promise<Response> {
  const me = await requireUser(req, env);
  const club = await getClub(env, raw);
  if (!canManage(club, me)) throw new HttpError(403, 'not_yours', 'Only the club’s owner can take people out.');
  const other = await env.DB.prepare('SELECT id, username FROM users WHERE username = ?').bind(username.toLowerCase()).first<{ id: number; username: string }>();
  if (!other || !(await isMember(env, club.id, other.id))) throw new HttpError(404, 'not_member', `${username} isn't in this club.`);
  if (other.id === club.owner_id) throw new HttpError(400, 'owner', 'The owner can leave the club, but not be taken out of it.');
  await removeMember(env, club, other, 'was taken out of the club');
  return json({});
}

async function memberIdsOf(env: Env, clubId: number): Promise<number[]> {
  const { results } = await env.DB.prepare('SELECT user_id FROM club_members WHERE club_id = ?').bind(clubId).all<{ user_id: number }>();
  return results.map((r) => r.user_id);
}

/** Is `userId` in a club whose site this is? (Then they can edit it, like an editor.) */
export async function inSiteClub(env: Env, site: string, userId: number): Promise<boolean> {
  return !!(await env.DB.prepare('SELECT 1 FROM clubs c JOIN club_members m ON m.club_id = c.id WHERE c.site = ? AND m.user_id = ? LIMIT 1').bind(site, userId).first());
}
