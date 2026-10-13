// Nightly backups, and restoring one. Every night (cron, 03:00 UTC) the database is exported
// (D1's export API) into the FILES bucket as SQL, keeping two weeks of them. Each backup also
// remembers its D1 Time Travel bookmark, so an admin can put the database back to that moment
// with one click (Time Travel goes back 7 days on Workers Free; older backups can still be
// downloaded and imported with wrangler).
//
//   GET  /api/admin/backups                 the backups, and whether backups are set up
//   POST /api/admin/backups                 take one now
//   GET  /api/admin/backups/:id/download    the SQL file
//   POST /api/admin/backups/:id/restore     put the database back to then → { undo }
//   POST /api/admin/restore                 { bookmark }: undo a restore
//
// Needs CF_API_TOKEN (D1 edit) and CF_ACCOUNT_ID secrets, and D1_DATABASE_ID (wrangler.jsonc).
import { requireAdmin } from './auth';
import { HttpError, json, readJson, str } from './http';

const KEEP = 14;
const POLL_MS = 2000;
const MAX_POLLS = 120;

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

type Export = { at_bookmark?: string; status?: string; error?: string; result?: { filename?: string; signed_url?: string } };

/** Take a backup (the cron at night, or an admin now). */
export async function runBackup(env: Env): Promise<void> {
  if (!configured(env)) return;
  const row = await env.DB.prepare("INSERT INTO backups (status) VALUES ('running') RETURNING id").first<{ id: number }>();
  const id = row!.id;
  try {
    let job = await cloudflare<Export>(env, '/export', { method: 'POST', body: JSON.stringify({ output_format: 'polling' }) });
    for (let i = 0; job.status !== 'complete' && i < MAX_POLLS; i++) {
      if (job.status === 'error') throw new Error(job.error || 'The export failed.');
      await new Promise((r) => setTimeout(r, POLL_MS));
      job = await cloudflare<Export>(env, '/export', { method: 'POST', body: JSON.stringify({ output_format: 'polling', current_bookmark: job.at_bookmark }) });
    }
    const url = job.result?.signed_url;
    if (job.status !== 'complete' || !url) throw new Error('The export took too long.');
    const dump = await fetch(url);
    if (!dump.ok || !dump.body) throw new Error(`Couldn’t download the export (${dump.status}).`);
    const key = `backups/${new Date().toISOString().replace(/[:.]/g, '-')}.sql`;
    const length = Number(dump.headers.get('Content-Length'));
    // Streamed straight into storage when we know how big it is.
    const stored = length
      ? await env.FILES.put(key, dump.body.pipeThrough(new FixedLengthStream(length)), { httpMetadata: { contentType: 'application/sql' } })
      : await env.FILES.put(key, await dump.arrayBuffer(), { httpMetadata: { contentType: 'application/sql' } });
    await env.DB.prepare("UPDATE backups SET status = 'done', key = ?, size = ?, bookmark = ? WHERE id = ?").bind(key, stored?.size ?? null, job.at_bookmark ?? null, id).run();
    // Two weeks of them.
    const { results: old } = await env.DB.prepare("SELECT id, key FROM backups WHERE status = 'done' ORDER BY id DESC LIMIT -1 OFFSET ?").bind(KEEP).all<{ id: number; key: string }>();
    if (old.length) {
      await env.FILES.delete(old.map((o) => o.key));
      await env.DB.batch(old.map((o) => env.DB.prepare('DELETE FROM backups WHERE id = ?').bind(o.id)));
    }
    await env.DB.prepare("DELETE FROM backups WHERE status != 'done' AND created_at < unixepoch() - 7 * 86400").run();
  } catch (e) {
    await env.DB.prepare("UPDATE backups SET status = 'failed', error = ? WHERE id = ?").bind(String((e as Error).message ?? e).slice(0, 300), id).run();
  }
}

export async function listBackups(req: Request, env: Env): Promise<Response> {
  await requireAdmin(req, env);
  const { results } = await env.DB.prepare('SELECT id, size, status, error, bookmark IS NOT NULL AS restorable, created_at FROM backups ORDER BY id DESC LIMIT 30').all();
  return json({ configured: configured(env), backups: results });
}

export async function backupNow(req: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
  await requireAdmin(req, env);
  if (!configured(env)) throw new HttpError(503, 'not_set_up', 'Backups aren’t set up yet: they need an API token (CF_API_TOKEN and CF_ACCOUNT_ID).');
  const running = await env.DB.prepare("SELECT 1 FROM backups WHERE status = 'running' AND created_at > unixepoch() - 600").first();
  if (running) throw new HttpError(409, 'running', 'A backup is already running.');
  // It takes a while; it carries on after this answer.
  const job = runBackup(env);
  if (ctx) ctx.waitUntil(job);
  else await job;
  return json({ started: true }, 202);
}

export async function downloadBackup(req: Request, env: Env, raw: string): Promise<Response> {
  await requireAdmin(req, env);
  const b = await env.DB.prepare("SELECT key FROM backups WHERE id = ? AND status = 'done'").bind(Number(raw)).first<{ key: string }>();
  const object = b ? await env.FILES.get(b.key) : null;
  if (!object) throw new HttpError(404, 'not_found', 'That backup isn’t there any more.');
  return new Response(object.body, {
    headers: {
      'Content-Type': 'application/sql',
      'Content-Disposition': `attachment; filename="${b!.key.split('/').pop()}"`,
      'Access-Control-Allow-Origin': '*',
    },
  });
}

/** Put the database back to a backup's moment. Answers with a bookmark to undo it. */
export async function restoreBackup(req: Request, env: Env, raw: string): Promise<Response> {
  await requireAdmin(req, env);
  if (!configured(env)) throw new HttpError(503, 'not_set_up', 'Restoring needs the API token (CF_API_TOKEN and CF_ACCOUNT_ID).');
  const b = await env.DB.prepare("SELECT bookmark FROM backups WHERE id = ? AND status = 'done'").bind(Number(raw)).first<{ bookmark: string | null }>();
  if (!b?.bookmark) throw new HttpError(404, 'not_restorable', 'That backup can’t be restored with one click. Download it and import it with wrangler instead.');
  return restoreTo(env, b.bookmark);
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
