// Buttons and stamps. Every site has an 88×31 button, like the old web's: its own button.png
// (or .gif, .jpg, .webp) if it has one, otherwise one made from its name. People collect a site's
// stamp from the ⋯ menu, and their profile shows the buttons of the stamps they collected.
//
//   GET    /site/:name/.button      the site's button (served by gateway.ts)
//   GET    /api/stamps              the sites whose stamps you've collected
//   POST   /api/stamps/:site        collect one
//   DELETE /api/stamps/:site        give one back
import { requireUser } from './auth';
import { blobBytes, CORS, HttpError, json, siteAddress } from './http';

const BUTTON_FILES = ['button.png', 'button.gif', 'button.jpg', 'button.webp'];
const MAX_STAMPS = 1000;

// Colours for made-up buttons, picked by the site's name.
const COLOURS = ['#ff5e3a', '#2563eb', '#2d6a4f', '#d6336c', '#7048e8', '#0f766e', '#b45309', '#1e3a5f'];

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The site's button, as a response. */
export async function siteButton(env: Env, site: { name: string; url: string | null }): Promise<Response> {
  const headers = { ...CORS, 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' };
  if (!site.url) {
    const own = await env.DB.prepare(`SELECT type, content FROM site_files WHERE site = ? AND path IN (${BUTTON_FILES.map(() => '?').join(', ')}) LIMIT 1`)
      .bind(site.name, ...BUTTON_FILES)
      .first<{ type: string; content: ArrayBuffer | number[] }>();
    if (own) return new Response(blobBytes(own.content), { headers: { ...headers, 'Content-Type': own.type } });
  }
  let hash = 0;
  for (const c of site.name) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  const colour = COLOURS[hash % COLOURS.length];
  const label = site.name.length > 12 ? `${site.name.slice(0, 11)}…` : site.name;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="88" height="31" viewBox="0 0 88 31">
<rect width="88" height="31" fill="${colour}"/>
<rect x="1" y="1" width="86" height="29" fill="none" stroke="#fff" stroke-opacity=".55"/>
<rect x="2" y="2" width="84" height="27" fill="none" stroke="#000" stroke-opacity=".25"/>
<text x="44" y="14" fill="#fff" font-family="Verdana, Geneva, sans-serif" font-size="${label.length > 9 ? 8 : 10}" font-weight="700" text-anchor="middle">${escape(label)}</text>
<text x="44" y="25" fill="#fff" fill-opacity=".8" font-family="Verdana, Geneva, sans-serif" font-size="7" text-anchor="middle">${site.name.endsWith('.b') ? '' : '.biggle'}</text>
</svg>`;
  return new Response(svg, { headers: { ...headers, 'Content-Type': 'image/svg+xml', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" } });
}

export async function myStamps(req: Request, env: Env): Promise<Response> {
  const me = await requireUser(req, env);
  const { results } = await env.DB.prepare('SELECT site FROM stamps WHERE user_id = ? ORDER BY created_at DESC').bind(me.id).all<{ site: string }>();
  return json({ stamps: results.map((r) => r.site) });
}

export async function collectStamp(req: Request, env: Env, raw: string): Promise<Response> {
  const me = await requireUser(req, env);
  const site = raw.toLowerCase();
  const row = await env.DB.prepare('SELECT status FROM names WHERE name = ?').bind(site).first<{ status: string }>();
  if (!row || row.status !== 'live') throw new HttpError(404, 'no_such_site', `${siteAddress(site)} doesn't exist.`);
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM stamps WHERE user_id = ?').bind(me.id).first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_STAMPS) throw new HttpError(400, 'too_many', 'That’s the most stamps one person can collect.');
  await env.DB.prepare('INSERT OR IGNORE INTO stamps (user_id, site) VALUES (?, ?)').bind(me.id, site).run();
  return json({ collected: true, count: (count?.n ?? 0) + 1 });
}

export async function returnStamp(req: Request, env: Env, raw: string): Promise<Response> {
  const me = await requireUser(req, env);
  await env.DB.prepare('DELETE FROM stamps WHERE user_id = ? AND site = ?').bind(me.id, raw.toLowerCase()).run();
  return json({});
}

/** A person's collected stamps, newest first, for their profile. */
export async function stampsOf(env: Env, userId: number): Promise<{ site: string; title: string | null }[]> {
  const { results } = await env.DB.prepare(
    "SELECT s.site, n.title FROM stamps s JOIN names n ON n.name = s.site WHERE s.user_id = ? AND n.status = 'live' ORDER BY s.created_at DESC LIMIT 200",
  )
    .bind(userId)
    .all<{ site: string; title: string | null }>();
  return results;
}
