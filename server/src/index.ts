// The Bigglenet server. The Biggle browser's own files (the PWA) are static assets;
// this Worker only runs for /api/* and /site/*.
//
//   /api/names, /api/resolve/:name   Biggle DNS
//   /site/:name/*path                site files, from the site's host or the database
//   /preview/:token/*path            a site waiting for approval, for its owner and admins
//   /api/sites*                      the Biggle site editor
//   /api/import/fetch                fetching a site that's being imported
//   /api/auth/*, /api/me             Biggle ID
//   /api/identity/*                  telling a site's own server who is signed in
//   email to JOIN_ADDRESS             confirming an email address (inbox.ts)
//   /api/admin/*                     names and users (admins only)
//   /api/friends*, /api/messages/*   friends and direct messages
//   /api/live                        WebSocket for live updates
import * as admin from './admin';
import * as auth from './auth';
import { directory, gateway, preview, resolveName } from './gateway';
import * as identity from './identity';
import * as google from './google';
import { fail, HttpError, preflight } from './http';
import { fetchForImport } from './importer';
import { receive } from './inbox';
import { connect } from './live';
import * as sites from './sites';
import * as social from './social';

export { Live } from './live';

type Handler = (req: Request, env: Env, ...params: string[]) => Promise<Response>;

const routes: [method: string, path: RegExp, handler: Handler][] = [
  ['GET', /^\/api\/names$/, directory],
  ['GET', /^\/api\/resolve\/([^/]+)$/, resolveName],

  ['POST', /^\/api\/auth\/signup$/, auth.signupOld],
  ['POST', /^\/api\/auth\/signup\/start$/, auth.signupStart],
  ['POST', /^\/api\/auth\/signup\/finish$/, auth.signupFinish],
  ['POST', /^\/api\/auth\/login$/, auth.login],
  ['POST', /^\/api\/auth\/email\/start$/, auth.emailStart],
  ['POST', /^\/api\/auth\/email\/finish$/, auth.emailFinish],
  ['POST', /^\/api\/auth\/reset\/start$/, auth.resetStart],
  ['POST', /^\/api\/auth\/reset\/finish$/, auth.resetFinish],
  ['POST', /^\/api\/auth\/code\/status$/, auth.codeStatus],
  ['GET', /^\/api\/auth\/options$/, google.options],
  ['POST', /^\/api\/auth\/google\/start$/, google.start],
  ['GET', /^\/api\/auth\/google\/callback$/, google.callback],
  ['POST', /^\/api\/auth\/google\/poll$/, google.poll],
  ['POST', /^\/api\/auth\/google\/finish$/, google.finish],
  ['POST', /^\/api\/auth\/logout$/, auth.logout],
  ['GET', /^\/api\/me$/, auth.me],
  ['POST', /^\/api\/identity\/token$/, identity.issue],
  ['GET', /^\/api\/identity\/verify$/, identity.verify],

  ['GET', /^\/api\/admin\/names$/, admin.listNames],
  ['PUT', /^\/api\/admin\/names\/([^/]+)$/, admin.setName],
  ['DELETE', /^\/api\/admin\/names\/([^/]+)$/, admin.deleteName],
  ['GET', /^\/api\/admin\/users$/, admin.listUsers],
  ['GET', /^\/api\/admin\/reviews$/, sites.reviewList],
  ['POST', /^\/api\/admin\/sites\/([^/]+)\/approve$/, sites.approveSite],
  ['POST', /^\/api\/admin\/sites\/([^/]+)\/reject$/, sites.rejectSite],

  ['GET', /^\/api\/sites$/, sites.mySites],
  ['POST', /^\/api\/sites$/, sites.createSite],
  ['GET', /^\/api\/sites\/available\/([^/]+)$/, sites.checkAvailable],
  ['GET', /^\/api\/sites\/([^/]+)$/, sites.getSiteInfo],
  ['PATCH', /^\/api\/sites\/([^/]+)$/, sites.updateSite],
  ['DELETE', /^\/api\/sites\/([^/]+)$/, sites.deleteSite],
  ['POST', /^\/api\/sites\/([^/]+)\/submit$/, sites.submitSite],
  ['POST', /^\/api\/sites\/([^/]+)\/preview$/, sites.previewToken],
  ['GET', /^\/api\/sites\/([^/]+)\/files\/(.+)$/, sites.readFile],
  ['PUT', /^\/api\/sites\/([^/]+)\/files\/(.+)$/, sites.writeFile],
  ['DELETE', /^\/api\/sites\/([^/]+)\/files\/(.+)$/, sites.deleteFile],

  ['POST', /^\/api\/import\/fetch$/, fetchForImport],

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

    const site = pathname.match(/^\/(site|preview)\/([^/]+)(\/.*)?$/);
    if (site) {
      const handler = site[1] === 'site' ? gateway : preview;
      return handler(req, env, site[2], site[3] ?? '', search);
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

  async email(message, env) {
    await receive(message, env);
  },
} satisfies ExportedHandler<Env>;
