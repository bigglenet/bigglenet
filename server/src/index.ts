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
//   /api/friends*                    friends
//   /api/chats*                      chats, group chats and calls (chat.biggle)
//   /api/messages/*                  one-to-one messages, the old way
//   /api/requests*                   feature requests and votes
//   /api/sites/:key/visit(s), /guestbook   visit counts and guestbooks (visitors.ts)
//   /api/users/*, /api/me/*, /api/blocks*  profiles, pictures, statuses, blocking (people.ts)
//   /api/notifications*              the notification centre
//   /api/sites/:key/{comments,polls,likes,scores,achievements,contact,walls,stats}  for pages (sitekit.ts)
//   /api/rooms/:site/:room           WebSocket rooms for multiplayer (rooms.ts)
//   /files/:key                      private files, through signed links (files.ts)
//   /api/feed                        what friends have been up to (feed.ts)
//   /api/invites*, /invite/:code     invite links (invites.ts)
//   /api/clubs*                      clubs (clubs.ts)
//   /api/board*                      the board, board.biggle (board.ts)
//   /api/events*                     events, and their reminders (cron, events.ts)
//   /api/collections*                collections of favourite sites (collections.ts)
//   /api/discover*, /api/search, /api/follows*   finding sites in Nox (discover.ts)
//   /api/webrings*                   webrings (webrings.ts)
//   /api/reports, /api/announcement, /api/status, /api/admin/{reports,announcements,dashboard}  (moderation.ts)
//   /api/sync*, /api/me/export, DELETE /api/me   your account's own things (account.ts)
//   /api/me/2fa*, /api/auth/login/2fa    two-factor sign-in (twofactor.ts)
//   /api/passkeys*, /passkey/:id      passkeys (passkeys.ts)
//   /api/push                        web push (push.ts)
//   /api/admin/backups*, /api/admin/restore   nightly backups (backups.ts)
//   /api/live                        WebSocket for live updates
import * as account from './account';
import * as admin from './admin';
import * as auth from './auth';
import * as backups from './backups';
import * as board from './board';
import * as chat from './chat';
import * as clubs from './clubs';
import * as collections from './collections';
import * as discover from './discover';
import * as events from './events';
import { feed } from './feed';
import { directory, gateway, preview, resolveName } from './gateway';
import * as identity from './identity';
import * as notifications from './notifications';
import * as people from './people';
import { connectRoom } from './rooms';
import * as kit from './sitekit';
import { linkPreview } from './previews';
import * as requests from './requests';
import * as google from './google';
import { serveFile } from './files';
import { fail, HttpError, preflight } from './http';
import { langOf, translateError } from './i18n';
import { fetchForImport } from './importer';
import { receive } from './inbox';
import * as invites from './invites';
import * as moderation from './moderation';
import * as passkeys from './passkeys';
import * as push from './push';
import { connect, fixPresence } from './live';
import * as sites from './sites';
import * as social from './social';
import * as twofactor from './twofactor';
import * as visitors from './visitors';
import * as webrings from './webrings';

export { Live } from './live';
export { Room } from './rooms';

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
  ['PATCH', /^\/api\/admin\/names\/([^/]+)$/, admin.setTld],
  ['DELETE', /^\/api\/admin\/names\/([^/]+)$/, admin.deleteName],
  ['GET', /^\/api\/admin\/users$/, admin.listUsers],
  ['PATCH', /^\/api\/admin\/users\/([^/]+)$/, admin.setTrusted],
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
  ['POST', /^\/api\/sites\/([^/]+)\/publish$/, sites.publishSite],
  ['POST', /^\/api\/sites\/([^/]+)\/discard$/, sites.discardDrafts],
  ['POST', /^\/api\/sites\/([^/]+)\/editors$/, sites.addEditor],
  ['DELETE', /^\/api\/sites\/([^/]+)\/editors\/([^/]+)$/, sites.removeEditor],
  ['GET', /^\/api\/sites\/([^/]+)\/comments$/, kit.comments],
  ['POST', /^\/api\/sites\/([^/]+)\/comments$/, kit.comment],
  ['DELETE', /^\/api\/comments\/(\d+)$/, kit.uncomment],
  ['GET', /^\/api\/sites\/([^/]+)\/polls\/([^/]+)$/, kit.poll],
  ['POST', /^\/api\/sites\/([^/]+)\/polls\/([^/]+)$/, kit.vote],
  ['GET', /^\/api\/sites\/([^/]+)\/likes$/, kit.likes],
  ['POST', /^\/api\/sites\/([^/]+)\/likes$/, kit.likes],
  ['DELETE', /^\/api\/sites\/([^/]+)\/likes$/, kit.likes],
  ['GET', /^\/api\/sites\/([^/]+)\/scores\/([^/]+)$/, kit.scores],
  ['POST', /^\/api\/sites\/([^/]+)\/scores\/([^/]+)$/, kit.submitScore],
  ['POST', /^\/api\/sites\/([^/]+)\/achievements$/, kit.achieve],
  ['POST', /^\/api\/sites\/([^/]+)\/contact$/, kit.contact],
  ['GET', /^\/api\/sites\/([^/]+)\/walls\/([^/]+)$/, kit.wall],
  ['POST', /^\/api\/sites\/([^/]+)\/walls\/([^/]+)$/, kit.wall],
  ['DELETE', /^\/api\/sites\/([^/]+)\/walls\/([^/]+)$/, kit.wall],
  ['GET', /^\/api\/sites\/([^/]+)\/stats$/, kit.stats],
  ['GET', /^\/api\/rooms\/([^/]+)\/([^/]+)$/, connectRoom],
  ['GET', /^\/api\/online$/, kit.online],
  ['POST', /^\/api\/sites\/([^/]+)\/preview$/, sites.previewToken],
  ['GET', /^\/api\/sites\/([^/]+)\/files\/(.+)$/, sites.readFile],
  ['PUT', /^\/api\/sites\/([^/]+)\/files\/(.+)$/, sites.writeFile],
  ['DELETE', /^\/api\/sites\/([^/]+)\/files\/(.+)$/, sites.deleteFile],
  ['GET', /^\/api\/sites\/([^/]+)\/manifest$/, sites.manifest],
  ['POST', /^\/api\/sites\/([^/]+)\/visit$/, visitors.visit],
  ['GET', /^\/api\/sites\/([^/]+)\/visits$/, visitors.visits],
  ['GET', /^\/api\/sites\/([^/]+)\/guestbook$/, visitors.guestbook],
  ['POST', /^\/api\/sites\/([^/]+)\/guestbook$/, visitors.sign],
  ['DELETE', /^\/api\/guestbook\/(\d+)$/, visitors.unsign],

  ['POST', /^\/api\/import\/fetch$/, fetchForImport],

  ['GET', /^\/api\/requests$/, requests.list],
  ['POST', /^\/api\/requests$/, requests.create],
  ['POST', /^\/api\/requests\/(\d+)\/vote$/, requests.vote],
  ['DELETE', /^\/api\/requests\/(\d+)\/vote$/, requests.vote],
  ['PATCH', /^\/api\/requests\/(\d+)$/, requests.update],
  ['DELETE', /^\/api\/requests\/(\d+)$/, requests.remove],

  ['GET', /^\/api\/chats$/, chat.listChats],
  ['POST', /^\/api\/chats$/, chat.createChat],
  ['PATCH', /^\/api\/chats\/(\d+)$/, chat.renameChat],
  ['POST', /^\/api\/chats\/(\d+)\/members$/, chat.addMembers],
  ['DELETE', /^\/api\/chats\/(\d+)\/members\/me$/, chat.leaveChat],
  ['GET', /^\/api\/chats\/(\d+)\/messages$/, chat.listMessages],
  ['POST', /^\/api\/chats\/(\d+)\/messages$/, chat.sendMessage],
  ['GET', /^\/api\/chats\/(\d+)\/messages\/(\d+)$/, chat.getMessage],
  ['PATCH', /^\/api\/chats\/(\d+)\/messages\/(\d+)$/, chat.editMessage],
  ['DELETE', /^\/api\/chats\/(\d+)\/messages\/(\d+)$/, chat.deleteMessage],
  ['POST', /^\/api\/chats\/(\d+)\/messages\/(\d+)\/reactions$/, chat.react],
  ['POST', /^\/api\/chats\/(\d+)\/files$/, chat.uploadFile],
  ['POST', /^\/api\/chats\/(\d+)\/typing$/, chat.typing],
  ['POST', /^\/api\/chats\/(\d+)\/together$/, chat.together],
  ['POST', /^\/api\/chats\/(\d+)\/read$/, chat.markRead],
  ['POST', /^\/api\/chats\/(\d+)\/call$/, chat.call],
  ['POST', /^\/api\/chats\/(\d+)\/signal$/, chat.signal],

  ['GET', /^\/api\/friends$/, social.listFriends],
  ['PUT', /^\/api\/friends\/([^/]+)\/nickname$/, social.setNickname],
  ['POST', /^\/api\/friends$/, social.addFriend],
  ['POST', /^\/api\/friends\/([^/]+)\/accept$/, social.acceptFriend],
  ['DELETE', /^\/api\/friends\/([^/]+)$/, social.removeFriend],
  ['GET', /^\/api\/messages\/([^/]+)$/, social.listMessages],
  ['POST', /^\/api\/messages\/([^/]+)$/, social.sendMessage],
  ['POST', /^\/api\/messages\/([^/]+)\/read$/, social.markRead],

  ['GET', /^\/api\/users\/([^/]+)$/, people.profile],
  ['PATCH', /^\/api\/me\/profile$/, people.updateProfile],
  ['PUT', /^\/api\/me\/activity$/, people.setActivity],
  ['PUT', /^\/api\/me\/avatar$/, people.setAvatar],
  ['DELETE', /^\/api\/me\/avatar$/, people.removeAvatar],
  ['GET', /^\/api\/avatars\/([^/]+)$/, people.avatar],
  ['GET', /^\/api\/blocks$/, people.listBlocks],
  ['POST', /^\/api\/blocks$/, people.block],
  ['DELETE', /^\/api\/blocks\/([^/]+)$/, people.unblock],

  ['GET', /^\/api\/link-preview$/, linkPreview],

  ['GET', /^\/api\/notifications$/, notifications.list],
  ['POST', /^\/api\/notifications\/read$/, notifications.markRead],

  ['GET', /^\/api\/feed$/, feed],

  ['GET', /^\/api\/invites$/, invites.myInvite],
  ['POST', /^\/api\/invites\/new$/, invites.newInvite],
  ['GET', /^\/api\/invites\/([^/]+)$/, invites.inviteInfo],
  ['GET', /^\/invite\/([^/]+)$/, invites.inviteLink],

  ['GET', /^\/api\/clubs$/, clubs.listClubs],
  ['POST', /^\/api\/clubs$/, clubs.createClub],
  ['GET', /^\/api\/clubs\/(\d+)$/, clubs.getClubInfo],
  ['PATCH', /^\/api\/clubs\/(\d+)$/, clubs.updateClub],
  ['DELETE', /^\/api\/clubs\/(\d+)$/, clubs.deleteClub],
  ['POST', /^\/api\/clubs\/(\d+)\/join$/, clubs.joinClub],
  ['POST', /^\/api\/clubs\/(\d+)\/leave$/, clubs.leaveClub],
  ['POST', /^\/api\/clubs\/(\d+)\/invite$/, clubs.inviteToClub],
  ['DELETE', /^\/api\/clubs\/(\d+)\/members\/([^/]+)$/, clubs.removeFromClub],

  ['GET', /^\/api\/board$/, board.boards],
  ['GET', /^\/api\/board\/threads\/(\d+)$/, board.thread],
  ['POST', /^\/api\/board\/threads\/(\d+)$/, board.reply],
  ['PATCH', /^\/api\/board\/threads\/(\d+)$/, board.updateThread],
  ['DELETE', /^\/api\/board\/threads\/(\d+)$/, board.deleteThread],
  ['PATCH', /^\/api\/board\/posts\/(\d+)$/, board.editPost],
  ['DELETE', /^\/api\/board\/posts\/(\d+)$/, board.deletePost],
  ['GET', /^\/api\/board\/([a-z]+)$/, board.threads],
  ['POST', /^\/api\/board\/([a-z]+)$/, board.startThread],

  ['GET', /^\/api\/events$/, events.listEvents],
  ['POST', /^\/api\/events$/, events.createEvent],
  ['GET', /^\/api\/events\/(\d+)$/, events.getEventInfo],
  ['PATCH', /^\/api\/events\/(\d+)$/, events.updateEvent],
  ['DELETE', /^\/api\/events\/(\d+)$/, events.deleteEvent],
  ['POST', /^\/api\/events\/(\d+)\/answer$/, events.answerEvent],
  ['POST', /^\/api\/events\/(\d+)\/invite$/, events.inviteToEvent],

  ['GET', /^\/api\/collections$/, collections.myCollections],
  ['POST', /^\/api\/collections$/, collections.createCollection],
  ['GET', /^\/api\/collections\/for\/([^/]+)$/, collections.collectionsFor],
  ['GET', /^\/api\/collections\/([A-Za-z0-9]+)$/, collections.getCollectionInfo],
  ['PATCH', /^\/api\/collections\/([A-Za-z0-9]+)$/, collections.updateCollection],
  ['DELETE', /^\/api\/collections\/([A-Za-z0-9]+)$/, collections.deleteCollection],
  ['POST', /^\/api\/collections\/([A-Za-z0-9]+)\/sites$/, collections.addToCollection],
  ['DELETE', /^\/api\/collections\/([A-Za-z0-9]+)\/sites\/([^/]+)$/, collections.removeFromCollection],
  ['PUT', /^\/api\/collections\/([A-Za-z0-9]+)\/order$/, collections.reorderCollection],

  ['GET', /^\/api\/discover$/, discover.discover],
  ['GET', /^\/api\/discover\/today$/, discover.siteOfTheDay],
  ['GET', /^\/api\/discover\/week$/, discover.thisWeek],
  ['GET', /^\/api\/search$/, discover.search],
  ['GET', /^\/api\/follows$/, discover.follows],
  ['POST', /^\/api\/follows$/, discover.follow],
  ['DELETE', /^\/api\/follows\/([^/]+)$/, discover.unfollow],
  ['PUT', /^\/api\/sites\/([^/]+)\/tags$/, discover.setTags],
  ['PUT', /^\/api\/admin\/site-of-day$/, discover.pickSiteOfTheDay],

  ['GET', /^\/api\/webrings$/, webrings.listRings],
  ['POST', /^\/api\/webrings$/, webrings.createRing],
  ['GET', /^\/api\/webrings\/(\d+)$/, webrings.getRingInfo],
  ['PATCH', /^\/api\/webrings\/(\d+)$/, webrings.updateRing],
  ['DELETE', /^\/api\/webrings\/(\d+)$/, webrings.deleteRing],
  ['POST', /^\/api\/webrings\/(\d+)\/sites$/, webrings.joinRing],
  ['DELETE', /^\/api\/webrings\/(\d+)\/sites\/([^/]+)$/, webrings.leaveRing],
  ['GET', /^\/api\/webrings\/(\d+)\/around\/([^/]+)$/, webrings.around],

  ['POST', /^\/api\/reports$/, moderation.report],
  ['GET', /^\/api\/admin\/reports$/, moderation.reports],
  ['POST', /^\/api\/admin\/reports\/(\d+)$/, moderation.handleReport],
  ['GET', /^\/api\/announcement$/, moderation.announcement],
  ['POST', /^\/api\/admin\/announcements$/, moderation.announce],
  ['DELETE', /^\/api\/admin\/announcements$/, moderation.endAnnouncement],
  ['GET', /^\/api\/admin\/dashboard$/, moderation.dashboard],
  ['GET', /^\/api\/status$/, moderation.status],

  ['GET', /^\/api\/sync$/, account.getSync],
  ['PUT', /^\/api\/sync\/([a-z]+)$/, account.putSync],
  ['GET', /^\/api\/me\/export$/, account.exportData],
  ['DELETE', /^\/api\/me$/, account.deleteAccount],

  ['GET', /^\/api\/me\/2fa$/, twofactor.twoFactorStatus],
  ['POST', /^\/api\/me\/2fa\/setup$/, twofactor.setupTwoFactor],
  ['POST', /^\/api\/me\/2fa\/enable$/, twofactor.enableTwoFactor],
  ['DELETE', /^\/api\/me\/2fa$/, twofactor.disableTwoFactor],
  ['POST', /^\/api\/auth\/login\/2fa$/, twofactor.secondStep],

  ['GET', /^\/api\/passkeys$/, passkeys.listPasskeys],
  ['DELETE', /^\/api\/passkeys\/([A-Za-z0-9_-]+)$/, passkeys.removePasskey],
  ['POST', /^\/api\/passkeys\/register\/start$/, passkeys.registerStart],
  ['POST', /^\/api\/passkeys\/register\/finish$/, passkeys.registerFinish],
  ['POST', /^\/api\/passkeys\/login\/start$/, passkeys.loginStart],
  ['POST', /^\/api\/passkeys\/login\/finish$/, passkeys.loginFinish],
  ['POST', /^\/api\/passkeys\/poll$/, passkeys.poll],
  ['GET', /^\/api\/passkeys\/requests\/([A-Za-z0-9_-]+)$/, passkeys.requestOptions],
  ['GET', /^\/passkey\/([A-Za-z0-9_-]+)$/, passkeys.passkeyPage],

  ['GET', /^\/api\/push$/, push.pushKey],
  ['POST', /^\/api\/push$/, push.subscribe],
  ['DELETE', /^\/api\/push$/, push.unsubscribe],

  ['GET', /^\/api\/admin\/backups$/, backups.listBackups],
  ['GET', /^\/api\/admin\/backups\/(\d+)\/download$/, backups.downloadBackup],
  ['POST', /^\/api\/admin\/backups\/(\d+)\/restore$/, backups.restoreBackup],
  ['POST', /^\/api\/admin\/restore$/, backups.undoRestore],

  ['GET', /^\/api\/live$/, connect],
];

async function handle(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (req.method === 'OPTIONS') return preflight();
  const { pathname, search } = new URL(req.url);

  // A backup runs on after the answer, so it needs the context.
  if (pathname === '/api/admin/backups' && req.method === 'POST') {
    try {
      return await backups.backupNow(req, env, ctx);
    } catch (e) {
      if (e instanceof HttpError) return fail(e.status, e.code, e.message);
      throw e;
    }
  }

  const file = pathname.match(/^\/files\/(.+)$/);
  if (file && req.method === 'GET') {
    try {
      return await serveFile(req, env, file[1]);
    } catch (e) {
      if (e instanceof HttpError) return fail(e.status, e.code, e.message);
      throw e;
    }
  }

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
}

export default {
  // Errors come back in the asker's language (i18n.ts).
  async fetch(req, env, ctx): Promise<Response> {
    return translateError(await handle(req, env, ctx), langOf(req));
  },

  async email(message, env) {
    await receive(message, env);
  },

  // Every minute (wrangler.jsonc), taking turns so each run stays within the Workers limits
  // (clubs.ts): event reminders, then reading changed sites for search. At 03:00 UTC, the
  // nightly backup instead, and at 03:31 a check of who's really online.
  async scheduled(controller, env, ctx) {
    const at = new Date(controller.scheduledTime);
    const minute = at.getUTCMinutes();
    if (at.getUTCHours() === 3 && minute === 0) ctx.waitUntil(backups.runBackup(env));
    else if (at.getUTCHours() === 3 && minute === 31) ctx.waitUntil(fixPresence(env));
    else ctx.waitUntil(minute % 2 === 0 ? events.remindSoon(env) : discover.indexSome(env));
  },
} satisfies ExportedHandler<Env>;
