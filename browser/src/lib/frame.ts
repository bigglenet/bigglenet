// Answers the things a page can ask the browser for (biggle.storage, biggle.sites(), biggle.idToken(),
// biggle.copy()). Shared by browser tabs and the site editor's preview.
import { api, ApiError, errorText } from './api';
import { loadDirectory } from './directory';
import { siteHost } from './url';
import { storageOp } from './storage';

type Reply = (msg: Record<string, unknown>) => void;

export function answerCall(site: string, msg: Record<string, unknown>, reply: Reply) {
  const args = Array.isArray(msg.args) ? msg.args : [];
  const method = String(msg.method);
  const done = (result: Record<string, unknown>) => reply({ type: 'result', id: msg.id, ...result });

  if (method.startsWith('storage.')) {
    done(storageOp(site, method.slice('storage.'.length), args[0], args[1]));
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
  } else {
    done({ error: `biggle has no ${method}()` });
  }
}
