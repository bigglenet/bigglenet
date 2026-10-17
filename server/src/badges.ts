// Badges people earn by doing things on the Bigglenet: making sites, making friends, signing
// guestbooks, coming back day after day… They're worked out when someone's profile is looked
// at, and kept once earned (user_badges). The browser has their names and pictures
// (browser/src/lib/badges.ts); a winner of the weekly challenge gets theirs from challenges.ts.

/** Every badge there is, in the order they're shown. */
export const BADGES = ['first-site', 'five-sites', 'friends-10', 'guestbooks-50', 'streak-7', 'stamps-25', 'remixer', 'remixed', 'club-founder', 'challenge-winner', 'early-bird'] as const;
export type Badge = (typeof BADGES)[number];

// Joined before this (1 January 2027): an early bird.
const EARLY = 1798761600;
const DAY = 86400;

/** Note that someone used the Bigglenet today (for streaks). */
export async function sawToday(env: Env, userId: number) {
  await env.DB.prepare('INSERT OR IGNORE INTO user_days (user_id, day) VALUES (?, ?)').bind(userId, Math.floor(Date.now() / 1000 / DAY)).run();
}

/** Days in a row up to today (or yesterday, if they haven't been on yet today). */
function streak(days: number[]): number {
  const have = new Set(days);
  let day = Math.floor(Date.now() / 1000 / DAY);
  if (!have.has(day)) day--;
  let n = 0;
  while (have.has(day - n)) n++;
  return n;
}

export async function award(env: Env, userId: number, badge: Badge) {
  await env.DB.prepare('INSERT OR IGNORE INTO user_badges (user_id, badge) VALUES (?, ?)').bind(userId, badge).run();
}

/**
 * Someone's badges, newest first, with any they've just earned. Those are kept (and come back as
 * `fresh`, to celebrate) only when it's them looking, so they're the first to see it.
 */
export async function badgesOf(env: Env, userId: number, joined: number, theirs = false): Promise<{ badges: { badge: Badge; at: number }[]; fresh: Badge[] }> {
  const [kept, counts, days] = await env.DB.batch([
    env.DB.prepare('SELECT badge, earned_at FROM user_badges WHERE user_id = ?').bind(userId),
    env.DB.prepare(
      `SELECT (SELECT COUNT(*) FROM names WHERE owner_id = ?1 AND status = 'live') AS sites,
         (SELECT COUNT(*) FROM friendships WHERE user_id = ?1 AND status = 'friends') AS friends,
         (SELECT COUNT(*) FROM guestbook WHERE user_id = ?1) AS guestbooks,
         (SELECT COUNT(*) FROM stamps WHERE user_id = ?1) AS stamps,
         (SELECT COUNT(*) FROM names WHERE owner_id = ?1 AND remix_of IS NOT NULL) AS remixes,
         (SELECT COUNT(*) FROM names r JOIN names o ON o.name = r.remix_of WHERE o.owner_id = ?1 AND r.owner_id != ?1) AS remixed,
         (SELECT COUNT(*) FROM clubs WHERE owner_id = ?1) AS clubs`,
    ).bind(userId),
    env.DB.prepare('SELECT day FROM user_days WHERE user_id = ? AND day > ? ORDER BY day DESC').bind(userId, Math.floor(Date.now() / 1000 / DAY) - 60),
  ]);
  const c = counts.results[0] as Record<string, number>;
  const earned: Partial<Record<Badge, boolean>> = {
    'first-site': c.sites >= 1,
    'five-sites': c.sites >= 5,
    'friends-10': c.friends >= 10,
    'guestbooks-50': c.guestbooks >= 50,
    'streak-7': streak((days.results as { day: number }[]).map((d) => d.day)) >= 7,
    'stamps-25': c.stamps >= 25,
    remixer: c.remixes >= 1,
    remixed: c.remixed >= 1,
    'club-founder': c.clubs >= 1,
    'early-bird': joined < EARLY,
  };
  const have = new Map((kept.results as { badge: Badge; earned_at: number }[]).map((b) => [b.badge, b.earned_at]));
  const fresh = BADGES.filter((b) => earned[b] && !have.has(b));
  const now = Math.floor(Date.now() / 1000);
  if (fresh.length && theirs) {
    await env.DB.batch(fresh.map((b) => env.DB.prepare('INSERT OR IGNORE INTO user_badges (user_id, badge, earned_at) VALUES (?, ?, ?)').bind(userId, b, now)));
  }
  for (const b of fresh) have.set(b, now);
  const badges = BADGES.filter((b) => have.has(b))
    .map((badge) => ({ badge, at: have.get(badge)! }))
    .sort((a, b) => b.at - a.at);
  return { badges, fresh: theirs ? fresh : [] };
}
