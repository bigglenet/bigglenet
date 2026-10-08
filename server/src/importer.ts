// Fetching files for the site importer. Web pages can't read other websites themselves, so the
// app asks the Biggle server for each file of the site it's copying, one request per file.
import { requireUser } from './auth';
import { CORS, HttpError, readJson, str } from './http';
import { MAX_FILE } from './sites';

const TIMEOUT_MS = 15_000;

export async function fetchForImport(req: Request, env: Env): Promise<Response> {
  const user = await requireUser(req, env);
  if (!(await env.IMPORT_LIMIT.limit({ key: String(user.id) })).success) {
    throw new HttpError(429, 'slow_down', 'Importing too fast. Wait a minute and try again.');
  }
  let url: URL;
  try {
    url = new URL(str((await readJson(req)).url));
  } catch {
    throw new HttpError(400, 'bad_url', "That isn't a web address.");
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new HttpError(400, 'bad_url', 'Only http and https addresses can be imported.');
  if (url.hostname === new URL(req.url).hostname) throw new HttpError(400, 'bad_url', "That's already on the Bigglenet.");

  let res: Response;
  try {
    res = await fetch(url, {
      // Ask the way the person's own browser would, so sites send what they'd send them.
      headers: { 'User-Agent': req.headers.get('User-Agent') ?? 'Mozilla/5.0 (compatible; Bigglenet)', Accept: '*/*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new HttpError(502, 'unreachable', `Couldn't reach ${url.host}.`);
  }
  if (!res.ok) {
    res.body?.cancel();
    throw new HttpError(502, 'remote_error', res.status === 404 ? "It isn't there (404)." : `${url.host} answered with an error (${res.status}).`);
  }
  const tooBig = () => new HttpError(413, 'too_large', "It's over 1 MB.");
  if (Number(res.headers.get('Content-Length') ?? 0) > MAX_FILE) {
    res.body?.cancel();
    throw tooBig();
  }

  const chunks: Uint8Array[] = [];
  let size = 0;
  if (res.body) {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_FILE) {
        reader.cancel().catch(() => {});
        throw tooBig();
      }
      chunks.push(value);
    }
  }
  const body = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    body.set(c, at);
    at += c.length;
  }

  return new Response(body, {
    headers: {
      ...CORS,
      'Access-Control-Expose-Headers': 'X-Biggle-Error, X-Final-Url',
      'Content-Type': res.headers.get('Content-Type') ?? 'application/octet-stream',
      'X-Final-Url': res.url || url.href,
      'Cache-Control': 'no-store',
      'Content-Security-Policy': 'sandbox',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
