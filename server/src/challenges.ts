// The weekly challenge: admins set a theme ("make a site about your pet"), people enter one of
// their sites, and everyone signed in votes for one entry (not their own). When it ends, the
// entry with the most votes wins: it's the site of the day, its owner gets a badge, and friends
// see it in their feeds. The cron names winners (index.ts scheduled → finishChallenges).
//
//   GET    /api/challenge                the current challenge, its entries and past winners
//   POST   /api/challenge                admins: start one { title, about, days }
//   POST   /api/challenge/:id/enter      { site }: enter one of your live sites (one per person)
//   DELETE /api/challenge/:id/enter      take your entry out
//   POST   /api/challenge/:id/vote       { site }: vote (again to change it)
import { requireAdmin, requireUser } from './auth';
import { award } from './badges';
import { record } from './feed';
import { HttpError, json, readJson, siteAddress, str } from './http';
import { addNotification } from './notifications';
import { today } from './visitors';

type Challenge = { id: number; title: string; about: string | null; starts_at: number; ends_at: number; winner: string | null; finished: number };

const now = () => Math.floor(Date.now() / 1000);

export async function current(req: Request, env: Env): Promise<Response> {
  const me = await requireUser(req, env);
  const c = await env.DB.prepare('SELECT * FROM challenges WHERE starts_at <= ? ORDER BY id DESC LIMIT 1').bind(now()).first<Challenge>();
  const [entries, mine, past] = await env.DB.batch([
    env.DB.prepare(
      `SELECT e.site, n.title, u.username, (SELECT COUNT(*) FROM challenge_votes v WHERE v.challenge_id = e.challenge_id AND v.site = e.site) AS votes
       FROM challenge_entries e JOIN names n ON n.name = e.site JOIN users u ON u.id = e.user_id
       WHERE e.challenge_id = ? AND n.status = 'live' ORDER BY votes DESC, e.created_at`,
    ).bind(c?.id ?? 0),
    env.DB.prepare(
      `SELECT (SELECT site FROM challenge_entries WHERE challenge_id = ?1 AND user_id = ?2) AS entry,
         (SELECT site FROM challenge_votes WHERE challenge_id = ?1 AND user_id = ?2) AS vote`,
    ).bind(c?.id ?? 0, me.id),
    env.DB.prepare(
      `SELECT c.id, c.title, c.ends_at, c.winner, n.title AS site_title FROM challenges c LEFT JOIN names n ON n.name = c.winner
       WHERE c.finished = 1 AND c.id != ? ORDER BY c.id DESC LIMIT 10`,
    ).bind(c?.id ?? 0),
  ]);
  const you = mine.results[0] as { entry: string | null; vote: string | null };
  return json({
    challenge: c
      ? { id: c.id, title: c.title, about: c.about, startsAt: c.starts_at, endsAt: c.ends_at, over: !!c.finished || c.ends_at <= now(), winner: c.winner }
      : null,
    entries: (entries.results as { site: string; title: string | null; username: string; votes: number }[]).map((e) => ({ ...e, mine: e.username === me.username })),
    you,
    past: (past.results as { id: number; title: string; ends_at: number; winner: string | null; site_title: string | null }[]).map((p) => ({
      id: p.id,
      title: p.title,
      endedAt: p.ends_at,
      winner: p.winner,
      winnerTitle: p.site_title,
    })),
  });
}

export async function start(req: Request, env: Env): Promise<Response> {
  const me = await requireAdmin(req, env);
  const body = await readJson(req);
  const title = str(body.title).trim().slice(0, 100);
  const about = str(body.about).trim().slice(0, 1000) || null;
  const days = Math.min(Math.max(Math.round(Number(body.days) || 7), 1), 30);
  if (!title) throw new HttpError(400, 'no_title', 'Give the challenge a theme.');
  const running = await env.DB.prepare('SELECT 1 FROM challenges WHERE finished = 0').first();
  if (running) throw new HttpError(409, 'running', 'A challenge is already on. Wait for it to end.');
  const id = (
    await env.DB.prepare('INSERT INTO challenges (title, about, starts_at, ends_at, created_by) VALUES (?, ?, ?, ?, ?) RETURNING id')
      .bind(title, about, now(), now() + days * 86400, me.id)
      .first<{ id: number }>()
  )!.id;
  return json({ id }, 201);
}

/** A challenge that's on, or a clear "no". */
async function open(env: Env, raw: string): Promise<Challenge> {
  const c = await env.DB.prepare('SELECT * FROM challenges WHERE id = ?').bind(Number(raw)).first<Challenge>();
  if (!c) throw new HttpError(404, 'no_such_challenge', 'That challenge doesn’t exist.');
  if (c.finished || c.ends_at <= now()) throw new HttpError(400, 'over', 'That challenge is over.');
  return c;
}

export async function enter(req: Request, env: Env, raw: string): Promise<Response> {
  const me = await requireUser(req, env);
  const c = await open(env, raw);
  if (req.method === 'DELETE') {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM challenge_votes WHERE challenge_id = ? AND site = (SELECT site FROM challenge_entries WHERE challenge_id = ? AND user_id = ?)').bind(c.id, c.id, me.id),
      env.DB.prepare('DELETE FROM challenge_entries WHERE challenge_id = ? AND user_id = ?').bind(c.id, me.id),
    ]);
    return json({});
  }
  const site = str((await readJson(req)).site).trim().toLowerCase().replace(/\.biggle$/, '');
  const row = await env.DB.prepare('SELECT owner_id, status FROM names WHERE name = ?').bind(site).first<{ owner_id: number | null; status: string }>();
  if (!row || row.owner_id !== me.id) throw new HttpError(403, 'not_yours', 'Enter one of your own sites.');
  if (row.status !== 'live') throw new HttpError(400, 'not_live', `${siteAddress(site)} isn’t live yet. Enter it once an admin approves it.`);
  const taken = await env.DB.prepare('SELECT 1 FROM challenge_entries WHERE challenge_id = ? AND site = ? AND user_id != ?').bind(c.id, site, me.id).first();
  if (taken) throw new HttpError(409, 'entered', 'That site is already in.');
  await env.DB.batch([
    // One entry each: a new one replaces the old (and its votes).
    env.DB.prepare('DELETE FROM challenge_votes WHERE challenge_id = ? AND site = (SELECT site FROM challenge_entries WHERE challenge_id = ? AND user_id = ? AND site != ?)').bind(c.id, c.id, me.id, site),
    env.DB.prepare('INSERT INTO challenge_entries (challenge_id, site, user_id) VALUES (?, ?, ?) ON CONFLICT(challenge_id, user_id) DO UPDATE SET site = excluded.site, created_at = unixepoch()').bind(c.id, site, me.id),
  ]);
  return json({ entered: site }, 201);
}

export async function vote(req: Request, env: Env, raw: string): Promise<Response> {
  const me = await requireUser(req, env);
  const c = await open(env, raw);
  const site = str((await readJson(req)).site).trim().toLowerCase();
  const entry = await env.DB.prepare('SELECT user_id FROM challenge_entries WHERE challenge_id = ? AND site = ?').bind(c.id, site).first<{ user_id: number }>();
  if (!entry) throw new HttpError(404, 'not_entered', 'That site isn’t in this challenge.');
  if (entry.user_id === me.id) throw new HttpError(400, 'own_site', 'You can’t vote for your own site.');
  await env.DB.prepare('INSERT INTO challenge_votes (challenge_id, user_id, site) VALUES (?, ?, ?) ON CONFLICT(challenge_id, user_id) DO UPDATE SET site = excluded.site')
    .bind(c.id, me.id, site)
    .run();
  return json({ voted: site });
}

/** Cron: name the winner of a challenge that's ended (one each run, to keep within the limits). */
export async function finishChallenges(env: Env) {
  const c = await env.DB.prepare('SELECT * FROM challenges WHERE finished = 0 AND ends_at <= ? ORDER BY ends_at LIMIT 1').bind(now()).first<Challenge>();
  if (!c) return;
  const top = await env.DB.prepare(
    `SELECT e.site, e.user_id, (SELECT COUNT(*) FROM challenge_votes v WHERE v.challenge_id = e.challenge_id AND v.site = e.site) AS votes
     FROM challenge_entries e JOIN names n ON n.name = e.site WHERE e.challenge_id = ? AND n.status = 'live'
     ORDER BY votes DESC, e.created_at LIMIT 1`,
  )
    .bind(c.id)
    .first<{ site: string; user_id: number; votes: number }>();
  const winner = top && top.votes > 0 ? top : null;
  await env.DB.prepare('UPDATE challenges SET finished = 1, winner = ? WHERE id = ?').bind(winner?.site ?? null, c.id).run();
  if (!winner) return;
  await env.DB.prepare('INSERT INTO site_of_day (day, site) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET site = excluded.site').bind(today(), winner.site).run();
  await award(env, winner.user_id, 'challenge-winner');
  await addNotification(env, winner.user_id, 'challenge-won', { site: winner.site, title: c.title });
  await record(env, winner.user_id, 'challenge-won', { title: c.title }, winner.site);
}
