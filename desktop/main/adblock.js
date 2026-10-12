// Ads and trackers are blocked on sites straight from the internet, with uBlock Origin's filter
// lists: the ones uBlock Origin turns on by default (its own, EasyList, EasyPrivacy, Peter Lowe's
// and the malicious-URL list) and its scriptlets.
//
// uBlock Origin itself can't run here: it loads in Electron but blocks nothing, because Electron
// lacks the request-blocking parts of Chrome's extension system (webRequestBlocking for uBlock
// Origin, declarativeNetRequest for uBlock Origin Lite). So the lists run in Ghostery's
// open-source engine, which reads the same filters: blocked requests, hidden elements and
// scriptlets.
import { adsAndTrackingLists, ElectronBlocker } from '@ghostery/adblocker-electron';
import { app, net } from 'electron';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const LISTS = [...adsAndTrackingLists, 'https://malware-filter.gitlab.io/urlhaus-filter/urlhaus-filter-ag-online.txt'];
// The lists change every day or so.
const REFRESH_MS = 24 * 60 * 60 * 1000;

const cacheFile = () => join(app.getPath('userData'), 'adblock-engine.bin');

/** Block ads and trackers in a session, and keep its lists up to date. */
export async function setupAdblock(session) {
  let blocker = null;
  const use = (next) => {
    if (blocker) blocker.disableBlockingInSession(session);
    blocker = next;
    blocker.enableBlockingInSession(session);
  };

  // Last time's lists, straight away.
  let age = Infinity;
  try {
    use(ElectronBlocker.deserialize(new Uint8Array(await readFile(cacheFile()))));
    age = Date.now() - (await stat(cacheFile())).mtimeMs;
  } catch {}

  async function refresh() {
    try {
      const fresh = await ElectronBlocker.fromLists(net.fetch, LISTS, { enableCompression: true });
      await writeFile(cacheFile(), fresh.serialize());
      use(fresh);
    } catch (e) {
      // Offline, probably. Keep what we have and try again later.
      console.warn('Updating the ad-block lists failed:', e?.message ?? e);
    }
  }
  if (age > REFRESH_MS) refresh();
  setInterval(refresh, REFRESH_MS);
}
