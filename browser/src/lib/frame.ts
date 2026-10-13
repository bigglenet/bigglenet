// Answers the things a page can ask the browser for: biggle.storage, biggle.sites(), idToken(),
// copy(), visits(), rooms, leaderboards, achievements, and the Bigglenet tags (<biggle-guestbook>,
// <biggle-comments>, <biggle-poll>, <biggle-like>, <biggle-wall>, <biggle-contact>…). Shared by
// browser tabs and the site editor's preview. The site is always the browser's own idea of it,
// never what the page says.
import { api, ApiError, errorText } from './api';
import { loadDirectory } from './directory';
import { t } from './i18n.svelte';
import { renderEmbed } from './loader';
import { report } from './report.svelte';
import { RoomLink } from './rooms';
import { signing } from './signing.svelte';
import { storageOp } from './storage';
import { parse, siteHost } from './url';

type Reply = (msg: Record<string, unknown>) => void;

/** What a page's questions are answered for: one page of one site, in one tab. */
export type PageScope = {
  site: string;
  /** The page's path, for comments ("/blog/post.bhtml"). */
  path: string;
  private?: boolean;
  /** The site editor's preview: looks, but can't post anything. */
  preview?: boolean;
  /** Tell the page something it didn't ask for (things happening in its rooms). */
  push: (msg: Record<string, unknown>) => void;
  /** Something to tell the person (an achievement). */
  say?: (text: string) => void;
  rooms: Map<number, RoomLink>;
};

let nextRoom = 1;

export function newScope(site: string, path: string, push: PageScope['push'], opts: Partial<PageScope> = {}): PageScope {
  return { site, path, push, rooms: new Map(), ...opts };
}

/** The page is gone: leave its rooms. */
export function closeScope(scope: PageScope) {
  for (const r of scope.rooms.values()) r.close();
  scope.rooms.clear();
}

/**
 * A click in a page also counts as one in the browser around it, for a few seconds. Posting,
 * voting, liking or taking something down needs one, so a page can't do it behind your back.
 */
const clicked = () => !('userActivation' in navigator) || navigator.userActivation.isActive;

const NAME = /^[a-z0-9_-]{1,40}$/i;

export function answerCall(scope: PageScope, msg: Record<string, unknown>, reply: Reply) {
  const site = scope.site;
  const args = Array.isArray(msg.args) ? msg.args : [];
  const method = String(msg.method);
  const done = (result: Record<string, unknown>) => reply({ type: 'result', id: msg.id, ...result });
  const at = `/api/sites/${encodeURIComponent(site)}`;
  const ask = (p: Promise<unknown>) =>
    p.then(
      (value) => done({ value }),
      (e) => done({ error: errorText(e) }),
    );
  const needsClick = (what: string) => {
    if (scope.preview) {
      done({ error: t('This is a preview. Try it on your site itself.') });
      return true;
    }
    if (!clicked()) {
      done({ error: t('{what} only happens when someone clicks.', { what }) });
      return true;
    }
    return false;
  };

  if (method.startsWith('storage.')) {
    done(storageOp(site, method.slice('storage.'.length), args[0], args[1], scope.private));
  } else if (method === 'copy') {
    navigator.clipboard.writeText(String(args[0] ?? '')).then(
      () => done({}),
      () => done({ error: "Couldn't copy that." }),
    );
  } else if (method === 'idToken') {
    // Signed out: null. The token only works for this page's own site.
    api<{ token: string }>('POST', '/api/identity/token', { site }).then(
      (r) => done({ value: r.token }),
      (e) => done(e instanceof ApiError && e.status === 401 ? { value: null } : { error: errorText(e) }),
    );
  } else if (method === 'sites' || method === 'newSites') {
    loadDirectory().then(
      (sites) => {
        let list = sites.map((s) => ({ ...s, tld: s.tld ?? 'biggle', address: siteHost(s.name, s.tld) }));
        if (method === 'newSites') list = list.sort((a, b) => (b.created ?? 0) - (a.created ?? 0)).slice(0, Math.min(20, Number(args[0]) || 5));
        done({ value: list });
      },
      () => done({ error: "Can't reach the Bigglenet right now." }),
    );
  } else if (method === 'visits') {
    ask(api('GET', `${at}/visits`));
  } else if (method === 'online') {
    ask(api('GET', '/api/online'));
  } else if (method === 'status') {
    // Someone's public status, for <biggle-status>.
    const name = String(args[0] ?? '');
    if (!/^[a-z0-9_]{2,24}$/.test(name)) return done({ error: t('That isn’t a username.') });
    ask(api<{ status: unknown; avatar: number | null }>('GET', `/api/users/${name}`).then((p) => ({ status: p.status, avatar: p.avatar })));
  } else if (method === 'guestbook.list') {
    const before = Number(args[0]) > 0 ? `?before=${Number(args[0])}` : '';
    ask(api('GET', `${at}/guestbook${before}`));
  } else if (method === 'guestbook.sign') {
    if (needsClick(t('Signing'))) return;
    signing.ask(site, 'guestbook').then((note) => done({ value: note }));
  } else if (method === 'guestbook.delete') {
    if (needsClick(t('Taking notes down'))) return;
    ask(api('DELETE', `/api/guestbook/${Number(args[0])}`));
  } else if (method === 'comments.list') {
    const before = Number(args[0]) > 0 ? `&before=${Number(args[0])}` : '';
    ask(api('GET', `${at}/comments?path=${encodeURIComponent(scope.path)}${before}`));
  } else if (method === 'comments.add') {
    if (needsClick(t('Commenting'))) return;
    signing.ask(site, 'comment', scope.path).then((c) => done({ value: c }));
  } else if (method === 'comments.delete') {
    if (needsClick(t('Taking comments down'))) return;
    ask(api('DELETE', `/api/comments/${Number(args[0])}`));
  } else if (method === 'contact') {
    if (needsClick(t('Sending a message'))) return;
    signing.ask(site, 'contact').then((r) => done({ value: r }));
  } else if (method === 'poll.get' || method === 'poll.vote') {
    const poll = String(args[0] ?? '');
    if (!NAME.test(poll)) return done({ error: t('A poll needs an id: letters, numbers, - or _.') });
    if (method === 'poll.get') return void ask(api('GET', `${at}/polls/${poll}`));
    if (needsClick(t('Voting'))) return;
    ask(api('POST', `${at}/polls/${poll}`, { choice: Number(args[1]), options: Number(args[2]) }));
  } else if (method === 'likes.get') {
    ask(api('GET', `${at}/likes`));
  } else if (method === 'likes.set') {
    if (needsClick(t('Liking'))) return;
    ask(api(args[0] ? 'POST' : 'DELETE', `${at}/likes`));
  } else if (method === 'scores.top' || method === 'scores.submit') {
    const board = String(args[0] ?? '');
    if (!NAME.test(board)) return done({ error: t('A leaderboard needs a name: letters, numbers, - or _.') });
    const opts = (args[method === 'scores.top' ? 1 : 2] ?? {}) as { order?: string; limit?: number };
    const order = opts.order === 'asc' ? 'asc' : 'desc';
    if (method === 'scores.top') return void ask(api('GET', `${at}/scores/${board}?order=${order}&limit=${Math.min(100, Number(opts.limit) || 10)}`));
    if (scope.preview) return done({ error: t('This is a preview. Try it on your site itself.') });
    ask(api('POST', `${at}/scores/${board}`, { score: Number(args[1]), order }));
  } else if (method === 'achieve') {
    if (scope.preview) return done({ value: { new: false } });
    const [key, title, description] = args;
    api<{ new: boolean; title: string }>('POST', `${at}/achievements`, { key, title, description }).then(
      (r) => {
        if (r.new) scope.say?.(t('🏆 Achievement unlocked on {site}: {title}', { site: siteHost(site), title: r.title }));
        done({ value: { new: r.new } });
      },
      (e) => done({ error: errorText(e) }),
    );
  } else if (method === 'report') {
    // A comment or guestbook note someone wants admins to see. The browser asks why.
    const kind = args[0] === 'note' ? 'note' : args[0] === 'comment' ? 'comment' : null;
    const id = Number(args[1]);
    if (!kind || !Number.isInteger(id)) return done({ error: t('That can’t be reported.') });
    if (needsClick(t('Reporting'))) return;
    report.open(kind, id, kind === 'note' ? t('a guestbook note on {site}', { site: siteHost(site) }) : t('a comment on {site}', { site: siteHost(site) }));
    done({ value: true });
  } else if (method === 'webring') {
    // Where this site is in a webring: the sites before and after it, and a random one.
    const ring = Number(args[0]);
    if (!Number.isInteger(ring) || ring < 1) return done({ error: t('Say which webring: <biggle-webring ring="3">.') });
    ask(api('GET', `/api/webrings/${ring}/around/${encodeURIComponent(site)}`));
  } else if (method === 'wall.get') {
    const wall = String(args[0] ?? '');
    if (!NAME.test(wall)) return done({ error: t('A wall needs an id: letters, numbers, - or _.') });
    ask(api('GET', `${at}/walls/${wall}`));
  } else if (method === 'wall.add') {
    const wall = String(args[0] ?? '');
    if (!NAME.test(wall) || scope.preview) return done({ error: t('Drawing doesn’t work here.') });
    ask(api('POST', `${at}/walls/${wall}`, args[1] && typeof args[1] === 'object' ? args[1] : {}));
  } else if (method === 'wall.clear') {
    const wall = String(args[0] ?? '');
    if (!NAME.test(wall) || needsClick(t('Clearing the wall'))) return;
    ask(api('DELETE', `${at}/walls/${wall}`));
  } else if (method === 'room.join') {
    const name = String(args[0] ?? '');
    if (!/^[a-z0-9_-]{1,40}$/i.test(name)) return done({ error: t('A room needs a name: letters, numbers, - or _.') });
    if (scope.rooms.size >= 5) return done({ error: t('A page can be in up to 5 rooms.') });
    const id = nextRoom++;
    // Walls have their own rooms, kept apart from the page's.
    const link = new RoomLink(site, name.startsWith('wall-') ? `wall:${name.slice(5)}` : `page:${name}`, (event) => scope.push({ type: 'room', id, event }));
    scope.rooms.set(id, link);
    link.open().then(
      (hello) => done({ value: { id, ...hello } }),
      (e) => {
        scope.rooms.delete(id);
        done({ error: errorText(e) });
      },
    );
  } else if (method === 'room.leave') {
    const id = Number(args[0]);
    scope.rooms.get(id)?.close();
    scope.rooms.delete(id);
    done({});
  } else if (method === 'embed') {
    const u = parse(String(args[0] ?? ''));
    if (u?.kind !== 'site') return done({ error: t('Embeds show .biggle and .b pages.') });
    renderEmbed(u).then(
      (srcdoc) => done(srcdoc ? { value: srcdoc } : { error: t('Couldn’t load that page.') }),
      () => done({ error: t('Couldn’t load that page.') }),
    );
  } else {
    done({ error: `biggle has no ${method}()` });
  }
}

/** A message the page sent to one of its rooms (fire and forget, for games). */
export function roomSend(scope: PageScope, id: unknown, data: unknown) {
  const link = scope.rooms.get(Number(id));
  if (!link) return;
  const json = JSON.stringify(data ?? null);
  if (json.length <= 15_000) link.send(data);
}
