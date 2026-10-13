// Events: plan a game night, say who it's for, and people answer going, maybe or no. Everyone
// going (or maybe going) gets a reminder shortly before it starts (remindSoon, run by the cron).
//
//   GET    /api/events                upcoming events you can see, and your recent ones
//   POST   /api/events                { title, description, place, startsAt, endsAt, who, club, invite } → { id }
//   GET    /api/events/:id            the event and who's coming
//   PATCH  /api/events/:id            whoever made it: the same fields
//   DELETE /api/events/:id            whoever made it, the club's owner, or an admin
//   POST   /api/events/:id/answer     { answer: 'going' | 'maybe' | 'no' }
//   POST   /api/events/:id/invite     { usernames }: invite friends
//
// Who can see one: 'friends' (the maker's friends), 'club' (its members), 'invited' (only people
// invited) or 'everyone'. Whoever made it, and anyone invited, can always see it.
import { requireUser, type User } from './auth';
import { areFriends, postMessage } from './chat';
import { record } from './feed';
import { HttpError, json, readJson, str } from './http';
import { addNotification } from './notifications';
import { blockedIds } from './people';

const WHO = ['friends', 'club', 'invited', 'everyone'] as const;
type Who = (typeof WHO)[number];
const ANSWERS = ['going', 'maybe', 'no'] as const;
const MAX_TITLE = 80;
const MAX_DESCRIPTION = 1000;
const MAX_PLACE = 200;
const MAX_INVITES = 10;
/** Reminders go out this long before the start. */
const REMIND_BEFORE = 15 * 60;
/** How many reminders one cron run sends (each is two or three calls; see clubs.ts on the limit). */
const REMIND_BATCH = 10;
/** Events without an end are over two hours after they start. */
const DEFAULT_LENGTH = 2 * 3600;

type Event = {
  id: number;
  user_id: number | null;
  club_id: number | null;
  title: string;
  description: string | null;
  place: string | null;
  starts_at: number;
  ends_at: number | null;
  who: Who;
  created_at: number;
};

const now = () => Math.floor(Date.now() / 1000);
const endOf = (e: Pick<Event, 'starts_at' | 'ends_at'>) => e.ends_at ?? e.starts_at + DEFAULT_LENGTH;

async function getEvent(env: Env, raw: string): Promise<Event> {
  const e = await env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(Number(raw)).first<Event>();
  if (!e) throw new HttpError(404, 'no_such_event', 'That event doesn’t exist any more.');
  return e;
}

const inClub = async (env: Env, clubId: number, userId: number) =>
  !!(await env.DB.prepare('SELECT 1 FROM club_members WHERE club_id = ? AND user_id = ?').bind(clubId, userId).first());

async function canSee(env: Env, e: Event, me: User): Promise<boolean> {
  if (e.user_id === me.id || me.is_admin || e.who === 'everyone') return true;
  if (await env.DB.prepare('SELECT 1 FROM event_people WHERE event_id = ? AND user_id = ?').bind(e.id, me.id).first()) return true;
  if (e.who === 'friends' && e.user_id) return areFriends(env, e.user_id, me.id);
  if (e.who === 'club' && e.club_id) return inClub(env, e.club_id, me.id);
  return false;
}

/** The fields people send, checked. */
async function fields(env: Env, me: User, input: Record<string, unknown>, before?: Event) {
  const title = input.title === undefined && before ? before.title : str(input.title).replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE);
  if (!title) throw new HttpError(400, 'no_title', 'Give the event a name.');
  const startsAt = input.startsAt === undefined && before ? before.starts_at : Math.floor(Number(input.startsAt));
  if (!Number.isFinite(startsAt) || startsAt < now() - 3600 || startsAt > now() + 2 * 365 * 86400) {
    throw new HttpError(400, 'bad_time', 'Pick a time from now on.');
  }
  const endsAt = input.endsAt === undefined && before ? before.ends_at : input.endsAt ? Math.floor(Number(input.endsAt)) : null;
  if (endsAt !== null && (!Number.isFinite(endsAt) || endsAt <= startsAt || endsAt > startsAt + 7 * 86400)) {
    throw new HttpError(400, 'bad_end', 'It has to end after it starts, and within a week.');
  }
  const club = input.club === undefined && before ? before.club_id : input.club ? Number(input.club) : null;
  if (club && (!before || club !== before.club_id) && !(await inClub(env, club, me.id))) throw new HttpError(403, 'not_member', 'You can only plan events for clubs you’re in.');
  let who = (input.who === undefined && before ? before.who : str(input.who) || (club ? 'club' : 'friends')) as Who;
  if (!WHO.includes(who)) who = 'friends';
  if (who === 'club' && !club) throw new HttpError(400, 'no_club', 'Pick the club it’s for.');
  const text = (key: string, max: number, old: string | null | undefined) => (input[key] === undefined && before ? old ?? null : str(input[key]).trim().slice(0, max) || null);
  return {
    title,
    description: text('description', MAX_DESCRIPTION, before?.description),
    place: text('place', MAX_PLACE, before?.place),
    startsAt,
    endsAt,
    who,
    club,
  };
}

type Listed = Event & { maker: string | null; club_name: string | null; going: number; mine: string | null };

const card = (e: Listed) => ({
  id: e.id,
  title: e.title,
  place: e.place,
  startsAt: e.starts_at,
  endsAt: e.ends_at,
  who: e.who,
  maker: e.maker,
  club: e.club_id ? { id: e.club_id, name: e.club_name } : null,
  going: e.going,
  answer: e.mine,
});

const LISTED = `SELECT e.*, u.username AS maker, c.name AS club_name,
    (SELECT COUNT(*) FROM event_people p WHERE p.event_id = e.id AND p.answer = 'going') AS going,
    (SELECT answer FROM event_people p WHERE p.event_id = e.id AND p.user_id = ?1) AS mine
  FROM events e LEFT JOIN users u ON u.id = e.user_id LEFT JOIN clubs c ON c.id = e.club_id`;

export async function listEvents(req: Request, env: Env): Promise<Response> {
  const me = await requireUser(req, env);
  const t = now();
  const [upcoming, recent] = await env.DB.batch([
    env.DB.prepare(
      `${LISTED}
       WHERE COALESCE(e.ends_at, e.starts_at + ${DEFAULT_LENGTH}) > ?2 AND (
         e.user_id = ?1 OR e.who = 'everyone'
         OR EXISTS (SELECT 1 FROM event_people p WHERE p.event_id = e.id AND p.user_id = ?1)
         OR (e.who = 'friends' AND e.user_id IN (SELECT friend_id FROM friendships WHERE user_id = ?1 AND status = 'friends'))
         OR (e.who = 'club' AND e.club_id IN (SELECT club_id FROM club_members WHERE user_id = ?1)))
       ORDER BY e.starts_at LIMIT 100`,
    ).bind(me.id, t),
    env.DB.prepare(
      `${LISTED}
       WHERE COALESCE(e.ends_at, e.starts_at + ${DEFAULT_LENGTH}) <= ?2 AND e.starts_at > ?2 - 30 * 86400
         AND (e.user_id = ?1 OR EXISTS (SELECT 1 FROM event_people p WHERE p.event_id = e.id AND p.user_id = ?1 AND p.answer IN ('going', 'maybe')))
       ORDER BY e.starts_at DESC LIMIT 20`,
    ).bind(me.id, t),
  ]);
  const blocked = await blockedIds(env, me.id);
  const visible = (rows: Listed[]) => rows.filter((e) => !e.user_id || !blocked.has(e.user_id)).map(card);
  return json({ upcoming: visible(upcoming.results as Listed[]), recent: visible(recent.results as Listed[]) });
}

export async function createEvent(req: Request, env: Env): Promise<Response> {
  const me = await requireUser(req, env);
  if (!(await env.MESSAGE_LIMIT.limit({ key: `event:${me.id}` })).success) throw new HttpError(429, 'slow_down', 'Slow down a little, then try again.');
  const input = await readJson(req);
  const f = await fields(env, me, input);
  const made = await env.DB.prepare(
    'INSERT INTO events (user_id, club_id, title, description, place, starts_at, ends_at, who) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
  )
    .bind(me.id, f.club, f.title, f.description, f.place, f.startsAt, f.endsAt, f.who)
    .first<{ id: number }>();
  const id = made!.id;
  // Whoever plans it is going.
  await env.DB.prepare("INSERT INTO event_people (event_id, user_id, answer) VALUES (?, ?, 'going')").bind(id, me.id).run();
  const usernames = Array.isArray(input.invite) ? input.invite.map((u) => str(u)) : [];
  if (usernames.length) await invite(env, me, { id, title: f.title }, usernames);
  // A club's members hear about it in the club's chat; friends see it in their feeds.
  if (f.club) {
    const chat = await env.DB.prepare('SELECT id FROM chats WHERE club_id = ?').bind(f.club).first<{ id: number }>();
    if (chat) await postMessage(env, chat.id, me, `planned “${f.title}”: biggle://events/${id}`, 'event');
  }
  if (f.who === 'friends' || f.who === 'everyone') await record(env, me.id, 'event-new', { event: id, title: f.title, startsAt: f.startsAt });
  return json({ id }, 201);
}

async function invite(env: Env, me: User, e: { id: number; title: string }, usernames: string[]) {
  const names = [...new Set(usernames.map((u) => u.trim().toLowerCase().replace(/^@/, '')).filter(Boolean))].slice(0, MAX_INVITES);
  for (const username of names) {
    const other = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first<{ id: number }>();
    if (!other || other.id === me.id) continue;
    if (!(await areFriends(env, me.id, other.id))) throw new HttpError(403, 'not_friends', `You can only invite friends, and ${username} isn't one yet.`);
    const added = await env.DB.prepare('INSERT OR IGNORE INTO event_people (event_id, user_id, invited_by) VALUES (?, ?, ?) RETURNING user_id')
      .bind(e.id, other.id, me.id)
      .first();
    if (added) await addNotification(env, other.id, 'event-invite', { event: e.id, title: e.title, from: me.username });
  }
}

export async function getEventInfo(req: Request, env: Env, raw: string): Promise<Response> {
  const me = await requireUser(req, env);
  const e = await getEvent(env, raw);
  if (!(await canSee(env, e, me))) throw new HttpError(404, 'no_such_event', 'That event doesn’t exist any more.');
  const [people, extra] = await env.DB.batch([
    env.DB.prepare(
      `SELECT u.id, u.username, u.avatar_v, p.answer FROM event_people p JOIN users u ON u.id = p.user_id
       WHERE p.event_id = ? ORDER BY p.updated_at`,
    ).bind(e.id),
    env.DB.prepare('SELECT (SELECT username FROM users WHERE id = ?1) AS maker, (SELECT name FROM clubs WHERE id = ?2) AS club_name, (SELECT owner_id FROM clubs WHERE id = ?2) AS club_owner')
      .bind(e.user_id ?? 0, e.club_id ?? 0),
  ]);
  const blocked = await blockedIds(env, me.id);
  type P = { id: number; username: string; avatar_v: number | null; answer: string | null };
  const list = (people.results as P[]).filter((p) => !blocked.has(p.id));
  const mine = list.find((p) => p.username === me.username);
  const x = extra.results[0] as { maker: string | null; club_name: string | null; club_owner: number | null };
  const by = (answer: string | null) => list.filter((p) => p.answer === answer).map((p) => ({ username: p.username, avatar: p.avatar_v }));
  return json({
    event: {
      id: e.id,
      title: e.title,
      description: e.description,
      place: e.place,
      startsAt: e.starts_at,
      endsAt: e.ends_at,
      who: e.who,
      maker: x.maker,
      club: e.club_id ? { id: e.club_id, name: x.club_name } : null,
      over: endOf(e) <= now(),
    },
    going: by('going'),
    maybe: by('maybe'),
    no: by('no'),
    invited: by(null),
    you: {
      answer: mine?.answer ?? null,
      canEdit: e.user_id === me.id || !!me.is_admin,
      canDelete: e.user_id === me.id || !!me.is_admin || (!!x.club_owner && x.club_owner === me.id),
    },
  });
}

export async function updateEvent(req: Request, env: Env, raw: string): Promise<Response> {
  const me = await requireUser(req, env);
  const e = await getEvent(env, raw);
  if (e.user_id !== me.id && !me.is_admin) throw new HttpError(403, 'not_yours', 'Only whoever planned it can change it.');
  const f = await fields(env, me, await readJson(req), e);
  await env.DB.batch([
    env.DB.prepare('UPDATE events SET title = ?, description = ?, place = ?, starts_at = ?, ends_at = ?, who = ?, club_id = ? WHERE id = ?')
      .bind(f.title, f.description, f.place, f.startsAt, f.endsAt, f.who, f.club, e.id),
    // A new time means a new reminder.
    ...(f.startsAt !== e.starts_at ? [env.DB.prepare('UPDATE event_people SET reminded = 0 WHERE event_id = ?').bind(e.id)] : []),
  ]);
  return json({});
}

export async function deleteEvent(req: Request, env: Env, raw: string): Promise<Response> {
  const me = await requireUser(req, env);
  const e = await getEvent(env, raw);
  const clubOwner = e.club_id ? (await env.DB.prepare('SELECT owner_id FROM clubs WHERE id = ?').bind(e.club_id).first<{ owner_id: number | null }>())?.owner_id : null;
  if (e.user_id !== me.id && !me.is_admin && clubOwner !== me.id) throw new HttpError(403, 'not_yours', 'Only whoever planned it can call it off.');
  await env.DB.prepare('DELETE FROM events WHERE id = ?').bind(e.id).run();
  return json({});
}

export async function answerEvent(req: Request, env: Env, raw: string): Promise<Response> {
  const me = await requireUser(req, env);
  const e = await getEvent(env, raw);
  if (!(await canSee(env, e, me))) throw new HttpError(404, 'no_such_event', 'That event doesn’t exist any more.');
  if (endOf(e) <= now()) throw new HttpError(400, 'over', 'That event is over.');
  const answer = str((await readJson(req)).answer) as (typeof ANSWERS)[number];
  if (!ANSWERS.includes(answer)) throw new HttpError(400, 'bad_answer', 'Going, maybe or no?');
  await env.DB.prepare(
    `INSERT INTO event_people (event_id, user_id, answer) VALUES (?, ?, ?)
     ON CONFLICT(event_id, user_id) DO UPDATE SET answer = excluded.answer, updated_at = unixepoch()`,
  )
    .bind(e.id, me.id, answer)
    .run();
  return json({ answer });
}

export async function inviteToEvent(req: Request, env: Env, raw: string): Promise<Response> {
  const me = await requireUser(req, env);
  const e = await getEvent(env, raw);
  if (!(await canSee(env, e, me))) throw new HttpError(404, 'no_such_event', 'That event doesn’t exist any more.');
  if (e.who === 'invited' && e.user_id !== me.id) throw new HttpError(403, 'not_yours', 'Only whoever planned it can invite people to this one.');
  if (!(await env.MESSAGE_LIMIT.limit({ key: `event-invite:${me.id}` })).success) throw new HttpError(429, 'slow_down', 'Slow down a little, then try again.');
  const body = await readJson(req);
  await invite(env, me, e, Array.isArray(body.usernames) ? body.usernames.map((u) => str(u)) : []);
  return json({});
}

/**
 * The cron, every minute: remind people going (or maybe going) to events starting in the next
 * quarter of an hour. A few at a time, so one run stays within the Workers limits.
 */
export async function remindSoon(env: Env) {
  const t = now();
  const { results } = await env.DB.prepare(
    `SELECT p.event_id, p.user_id, e.title, e.starts_at FROM event_people p JOIN events e ON e.id = p.event_id
     WHERE p.reminded = 0 AND p.answer IN ('going', 'maybe') AND e.starts_at > ? AND e.starts_at <= ?
     ORDER BY e.starts_at LIMIT ?`,
  )
    .bind(t, t + REMIND_BEFORE, REMIND_BATCH)
    .all<{ event_id: number; user_id: number; title: string; starts_at: number }>();
  if (!results.length) return;
  await env.DB.batch(results.map((r) => env.DB.prepare('UPDATE event_people SET reminded = 1 WHERE event_id = ? AND user_id = ?').bind(r.event_id, r.user_id)));
  for (const r of results) await addNotification(env, r.user_id, 'event-soon', { event: r.event_id, title: r.title, startsAt: r.starts_at });
}
