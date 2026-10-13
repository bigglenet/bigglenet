// Backups, without any paid storage. D1 keeps every moment of the last 7 days (Time Travel, free
// on Workers Free), so each night (cron, 03:00 UTC) that moment is marked as a restore point an
// admin can put the database back to. A copy to keep comes from D1's export: an admin asks for
// one and gets a link to download it, straight from Cloudflare.
//
//   GET  /api/admin/backups                 restore points, and whether backups are set up
//   POST /api/admin/backups/export          { bookmark? } one step of making a copy → { done, bookmark, url }
//   POST /api/admin/backups/:id/restore     put the database back to then → { undo }
//   POST /api/admin/restore                 { bookmark }: undo a restore
//
// Needs CF_API_TOKEN (D1 edit) and CF_ACCOUNT_ID secrets, and D1_DATABASE_ID (wrangler.jsonc).
import { requireAdmin } from './auth';
import { HttpError, json, readJson, str } from './http';

// Time Travel goes back this far on Workers Free.
const DAYS = 7;

const configured = (env: Env) => !!env.CF_API_TOKEN && !!env.CF_ACCOUNT_ID && !!env.D1_DATABASE_ID;

async function cloudflare<T>(env: Env, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/d1/database/${env.D1_DATABASE_ID}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, 'Content-Type': 'application/json', ...init.headers },
  });
  const body = (await res.json().catch(() => ({}))) as { success?: boolean; result?: T; errors?: { message: string }[] };
  if (!res.ok || !body.success) throw new Error(body.errors?.map((e) => e.message).join('; ') || `Cloudflare said ${res.status}`);
  return body.result as T;
}

/** The nightly restore point (cron). */
export async function markRestorePoint(env: Env): Promise<void> {
  if (!configured(env)) return;
  try {
    const { bookmark } = await cloudflare<{ bookmark: string }>(env, '/time_travel/bookmark');
    await env.DB.batch([
      env.DB.prepare('INSERT INTO restore_points (bookmark) VALUES (?)').bind(bookmark),
      // Older ones can't be gone back to any more.
      env.DB.prepare('DELETE FROM restore_points WHERE created_at < unixepoch() - ?').bind(DAYS * 86400),
    ]);
  } catch (e) {
    console.error('restore point failed', e);
  }
}

export async function listBackups(req: Request, env: Env): Promise<Response> {
  await requireAdmin(req, env);
  const { results } = await env.DB.prepare('SELECT id, created_at FROM restore_points WHERE created_at > unixepoch() - ? ORDER BY id DESC')
    .bind(DAYS * 86400)
    .all();
  return json({ configured: configured(env), days: DAYS, points: results });
}

type Export = { at_bookmark?: string; status?: string; error?: string; result?: { filename?: string; signed_url?: string } };

/**
 * A copy of the database, made by D1 in the background. The admin's browser asks again with the
 * bookmark it got until the copy is done, then downloads it from the link (it works for a while).
 */
export async function exportStep(req: Request, env: Env): Promise<Response> {
  await requireAdmin(req, env);
  if (!configured(env)) throw new HttpError(503, 'not_set_up', 'Backups aren’t set up yet: they need an API token (CF_API_TOKEN and CF_ACCOUNT_ID).');
  const bookmark = str((await readJson(req)).bookmark);
  let job: Export;
  try {
    job = await cloudflare<Export>(env, '/export', { method: 'POST', body: JSON.stringify({ output_format: 'polling', ...(bookmark ? { current_bookmark: bookmark } : {}) }) });
  } catch (e) {
    throw new HttpError(502, 'export_failed', `Couldn’t make a copy: ${(e as Error).message}`);
  }
  if (job.status === 'error') throw new HttpError(502, 'export_failed', `Couldn’t make a copy: ${job.error ?? ''}`);
  const url = job.status === 'complete' ? job.result?.signed_url : undefined;
  return json({ done: !!url, bookmark: job.at_bookmark ?? bookmark, url: url ?? null, filename: job.result?.filename ?? null });
}

/** Put the database back to a restore point. Answers with a bookmark to undo it. */
export async function restoreBackup(req: Request, env: Env, raw: string): Promise<Response> {
  await requireAdmin(req, env);
  if (!configured(env)) throw new HttpError(503, 'not_set_up', 'Restoring needs the API token (CF_API_TOKEN and CF_ACCOUNT_ID).');
  const point = await env.DB.prepare('SELECT bookmark FROM restore_points WHERE id = ? AND created_at > unixepoch() - ?').bind(Number(raw), DAYS * 86400).first<{ bookmark: string }>();
  if (!point) throw new HttpError(404, 'not_restorable', 'That moment is too long ago to go back to.');
  return restoreTo(env, point.bookmark);
}

export async function undoRestore(req: Request, env: Env): Promise<Response> {
  await requireAdmin(req, env);
  const bookmark = str((await readJson(req)).bookmark);
  if (!bookmark) throw new HttpError(400, 'no_bookmark', 'Which moment?');
  return restoreTo(env, bookmark);
}

async function restoreTo(env: Env, bookmark: string): Promise<Response> {
  try {
    const r = await cloudflare<{ previous_bookmark?: string; bookmark?: string }>(env, `/time_travel/restore?bookmark=${encodeURIComponent(bookmark)}`, { method: 'POST' });
    return json({ undo: r.previous_bookmark ?? null });
  } catch (e) {
    throw new HttpError(502, 'restore_failed', `Couldn’t restore: ${(e as Error).message}`);
  }
}
