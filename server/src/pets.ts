// Pets. Everyone can have one, on their new tab page. A pet eats one snack for every different
// site its owner visits each day (visitors.ts calls feedPet), grows as it eats, and shows on
// their profile. It never dies: left alone, it just gets hungry and misses them.
//
//   GET    /api/pet     your pet, or null
//   PUT    /api/pet     { name, kind, colour }  adopt one, or rename it or change its look
//   DELETE /api/pet     let it go (to adopt another)
import { requireUser } from './auth';
import { HttpError, json, readJson, str } from './http';

const KINDS = ['blob', 'cat', 'chick', 'dino', 'ghost'];
const COLOURS = ['#ff8a5b', '#ffc93c', '#7bd389', '#4cc9f0', '#9b8cff', '#ff6fb5', '#b8b8c8', '#a1887f'];
/** How many snacks it takes to reach each stage. */
const STAGES = [
  { stage: 'egg', at: 0 },
  { stage: 'baby', at: 1 },
  { stage: 'kid', at: 10 },
  { stage: 'grown', at: 30 },
  { stage: 'legend', at: 100 },
] as const;

const today = () => Math.floor(Date.now() / 86_400_000);

type Row = { name: string; kind: string; colour: string; snacks: number; fed_day: number | null; fed_today: number; last_site: string | null; born_at: number };

export type PetView = {
  name: string;
  kind: string;
  colour: string;
  snacks: number;
  stage: (typeof STAGES)[number]['stage'];
  /** Snacks to go until it grows again (null once it's a legend). */
  next: number | null;
  mood: 'egg' | 'stuffed' | 'happy' | 'hungry' | 'lonely';
  /** Snacks it's had today. */
  today: number;
  born: number;
  /** Only for its owner: the site its last snack came from. */
  lastSite?: string | null;
};

const COLUMNS = 'name, kind, colour, snacks, fed_day, fed_today, last_site, born_at';

function view(p: Row, mine: boolean): PetView {
  const day = today();
  let index = 0;
  while (index + 1 < STAGES.length && p.snacks >= STAGES[index + 1].at) index++;
  const eaten = p.fed_day === day ? p.fed_today : 0;
  const mood = p.snacks === 0 ? 'egg' : eaten >= 3 ? 'stuffed' : eaten > 0 ? 'happy' : p.fed_day !== null && day - p.fed_day >= 3 ? 'lonely' : 'hungry';
  return {
    name: p.name,
    kind: p.kind,
    colour: p.colour,
    snacks: p.snacks,
    stage: STAGES[index].stage,
    next: index < STAGES.length - 1 ? STAGES[index + 1].at - p.snacks : null,
    mood,
    today: eaten,
    born: p.born_at,
    ...(mine ? { lastSite: p.last_site } : {}),
  };
}

/** Someone's pet, as their profile shows it to `mine` (themselves) or anyone else. */
export async function petOf(env: Env, userId: number, mine: boolean): Promise<PetView | null> {
  const row = await env.DB.prepare(`SELECT ${COLUMNS} FROM pets WHERE user_id = ?`).bind(userId).first<Row>();
  return row ? view(row, mine) : null;
}

/** A first visit today to `site`: one snack. */
export async function feedPet(env: Env, userId: number, site: string) {
  await env.DB.prepare(
    'UPDATE pets SET snacks = snacks + 1, fed_today = CASE WHEN fed_day = ?1 THEN fed_today + 1 ELSE 1 END, fed_day = ?1, last_site = ?2 WHERE user_id = ?3',
  )
    .bind(today(), site, userId)
    .run();
}

export async function myPet(req: Request, env: Env): Promise<Response> {
  const me = await requireUser(req, env);
  return json({ pet: await petOf(env, me.id, true) });
}

export async function savePet(req: Request, env: Env): Promise<Response> {
  const me = await requireUser(req, env);
  const input = await readJson(req);
  const name = str(input.name).replace(/\s+/g, ' ').trim();
  if (!name || [...name].length > 20) throw new HttpError(400, 'bad_name', 'Give your pet a name (up to 20 letters).');
  const kind = str(input.kind);
  const colour = str(input.colour);
  if (!KINDS.includes(kind) || !COLOURS.includes(colour)) throw new HttpError(400, 'bad_pet', 'Pick one of the pets and colours.');
  const row = await env.DB.prepare(
    `INSERT INTO pets (user_id, name, kind, colour) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET name = excluded.name, kind = excluded.kind, colour = excluded.colour
     RETURNING ${COLUMNS}`,
  )
    .bind(me.id, name, kind, colour)
    .first<Row>();
  return json({ pet: view(row!, true) });
}

export async function letGo(req: Request, env: Env): Promise<Response> {
  const me = await requireUser(req, env);
  await env.DB.prepare('DELETE FROM pets WHERE user_id = ?').bind(me.id).run();
  return json({});
}
