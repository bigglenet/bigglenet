// The Bigglenet server. The Biggle browser's own files (the PWA) are static assets;
// this Worker only runs for /api/* and /site/*.
//
//   /api/names, /api/resolve/:name   Biggle DNS
//   /site/:name/*path                site files, fetched from the site's host
//   /api/auth/*, /api/me             Biggle ID
//   /api/admin/*                     names and users (admins only)
//   /api/friends*, /api/messages/*   friends and direct messages
//   /api/live                        WebSocket for live updates
import * as admin from './admin';
import * as auth from './auth';
import { directory, gateway, resolveName } from './gateway';
import { fail, HttpError, preflight } from './http';
import { connect } from './live';
import * as social from './social';

export { Live } from './live';

type Handler = (req: Request, env: Env, ...params: string[]) => Promise<Response>;

const routes: [method: string, path: RegExp, handler: Handler][] = [
  ['GET', /^\/api\/names$/, directory],
  ['GET', /^\/api\/resolve\/([^/]+)$/, resolveName],

  ['POST', /^\/api\/auth\/signup$/, auth.signup],
  ['POST', /^\/api\/auth\/login$/, auth.login],
  ['POST', /^\/api\/auth\/logout$/, auth.logout],
  ['GET', /^\/api\/me$/, auth.me],

  ['GET', /^\/api\/admin\/names$/, admin.listNames],
  ['PUT', /^\/api\/admin\/names\/([^/]+)$/, admin.setName],
  ['DELETE', /^\/api\/admin\/names\/([^/]+)$/, admin.deleteName],
  ['GET', /^\/api\/admin\/users$/, admin.listUsers],

  ['GET', /^\/api\/friends$/, social.listFriends],
  ['POST', /^\/api\/friends$/, social.addFriend],
  ['POST', /^\/api\/friends\/([^/]+)\/accept$/, social.acceptFriend],
  ['DELETE', /^\/api\/friends\/([^/]+)$/, social.removeFriend],
  ['GET', /^\/api\/messages\/([^/]+)$/, social.listMessages],
  ['POST', /^\/api\/messages\/([^/]+)$/, social.sendMessage],
  ['POST', /^\/api\/messages\/([^/]+)\/read$/, social.markRead],

  ['GET', /^\/api\/live$/, connect],
];

export default {
  async fetch(req, env): Promise<Response> {
    if (req.method === 'OPTIONS') return preflight();
    const { pathname, search } = new URL(req.url);

    const site = pathname.match(/^\/site\/([^/]+)(\/.*)?$/);
    if (site) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return fail(405, 'method_not_allowed', 'Sites are read-only.');
      return gateway(req, env, site[1], site[2] ?? '', search);
    }

    let pathMatched = false;
    for (const [method, pattern, handler] of routes) {
      const m = pathname.match(pattern);
      if (!m) continue;
      pathMatched = true;
      if (method !== req.method) continue;
      try {
        const params = m.slice(1).map((p) => {
          try {
            return decodeURIComponent(p);
          } catch {
            throw new HttpError(400, 'bad_path', "That address isn't valid.");
          }
        });
        return await handler(req, env, ...params);
      } catch (e) {
        if (e instanceof HttpError) return fail(e.status, e.code, e.message);
        console.error(e);
        return fail(500, 'server_error', 'Something went wrong on the Biggle server.');
      }
    }
    if (pathMatched) return fail(405, 'method_not_allowed', "That method isn't allowed here.");
    return fail(404, 'not_found', 'Nothing here.');
  },
} satisfies ExportedHandler<Env>;
