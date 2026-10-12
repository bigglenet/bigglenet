// Answers the things a page can ask the browser for (biggle.storage, biggle.sites(), biggle.idToken(),
// biggle.copy(), biggle.visits() and <biggle-guestbook>). Shared by browser tabs and the site
// editor's preview.
import { api, ApiError, errorText } from './api';
import { loadDirectory } from './directory';
import { signing, type GuestbookNote } from './signing.svelte';
import { siteHost } from './url';
import { storageOp } from './storage';

/**
 * A click in a page also counts as one in the browser around it, for a few seconds. Signing a
 * guestbook or taking a note down needs one, so a page can't do it behind your back.
 */
const clicked = () => !('userActivation' in navigator) || navigator.userActivation.isActive;

type Reply = (msg: Record<string, unknown>) => void;

export function answerCall(site: string, msg: Record<string, unknown>, reply: Reply, opts: { private?: boolean } = {}) {
  const args = Array.isArray(msg.args) ? msg.args : [];
  const method = String(msg.method);
  const done = (result: Record<string, unknown>) => reply({ type: 'result', id: msg.id, ...result });

  if (method.startsWith('storage.')) {
    done(storageOp(site, method.slice('storage.'.length), args[0], args[1], opts.private));
  } else if (method === 'copy') {
    // A click in the page also activates the browser around it, so we're allowed to copy.
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
  } else if (method === 'sites') {
    loadDirectory().then(
      (sites) => done({ value: sites.map((s) => ({ ...s, tld: s.tld ?? 'biggle', address: siteHost(s.name, s.tld) })) }),
      () => done({ error: "Can't reach the Bigglenet right now." }),
    );
  } else if (method === 'visits') {
    api('GET', `/api/sites/${encodeURIComponent(site)}/visits`).then(
      (value) => done({ value }),
      (e) => done({ error: errorText(e) }),
    );
  } else if (method === 'guestbook.list') {
    const before = Number(args[0]) > 0 ? `?before=${Number(args[0])}` : '';
    api('GET', `/api/sites/${encodeURIComponent(site)}/guestbook${before}`).then(
      (value) => done({ value }),
      (e) => done({ error: errorText(e) }),
    );
  } else if (method === 'guestbook.sign') {
    if (!clicked()) return done({ error: 'The guestbook opens when someone clicks to sign it.' });
    signing.ask(site).then((note: GuestbookNote | null) => done({ value: note }));
  } else if (method === 'guestbook.delete') {
    if (!clicked()) return done({ error: 'Notes are only taken down with a click.' });
    api('DELETE', `/api/guestbook/${Number(args[0])}`).then(
      () => done({}),
      (e) => done({ error: errorText(e) }),
    );
  } else {
    done({ error: `biggle has no ${method}()` });
  }
}
