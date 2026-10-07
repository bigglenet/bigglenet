// Answers the things a page can ask the browser for (biggle.storage, biggle.sites(),
// biggle.copy()). Shared by browser tabs and the site editor's preview.
import { loadDirectory } from './directory';
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
  } else if (method === 'sites') {
    loadDirectory().then(
      (sites) => done({ value: sites }),
      () => done({ error: "Can't reach the Bigglenet right now." }),
    );
  } else {
    done({ error: `biggle has no ${method}()` });
  }
}
