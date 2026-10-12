// Backs biggle.storage. Values arrive already JSON-encoded by the page. Private tabs keep theirs
// in memory only, so it's gone when Bigglenet closes.

const LIMIT = 1_000_000;

const keyFor = (site: string) => `biggle:storage:${site}`;
const privateStore = new Map<string, string>();
const getItem = (key: string, priv: boolean) => (priv ? (privateStore.get(key) ?? null) : localStorage.getItem(key));
const setItem = (key: string, value: string, priv: boolean) => (priv ? privateStore.set(key, value) : localStorage.setItem(key, value));

function read(site: string, priv: boolean): Map<string, string> {
  try {
    return new Map(Object.entries(JSON.parse(getItem(keyFor(site), priv) ?? '{}')));
  } catch {
    return new Map();
  }
}

// A page's own localStorage. Pages run sandboxed where they can't keep one, so the page script
// keeps a stand-in and sends its contents here whenever it changes.
const localKey = (site: string) => `biggle:local:${site}`;

export function readLocal(site: string, priv = false): Record<string, string> {
  try {
    return JSON.parse(getItem(localKey(site), priv) ?? '{}');
  } catch {
    return {};
  }
}

export function saveLocal(site: string, entries: unknown, priv = false) {
  if (!entries || typeof entries !== 'object' || !Object.values(entries).every((v) => typeof v === 'string')) return;
  const json = JSON.stringify(entries);
  if (json.length > LIMIT) return;
  try {
    setItem(localKey(site), json, priv);
  } catch {}
}

/** How much a site keeps in this browser (bytes), and forgetting it all (Site settings). */
export function siteDataSize(site: string): number {
  return (localStorage.getItem(keyFor(site))?.length ?? 0) + (localStorage.getItem(localKey(site))?.length ?? 0);
}
export function clearSiteData(site: string) {
  localStorage.removeItem(keyFor(site));
  localStorage.removeItem(localKey(site));
}

export type StorageReply = { value?: unknown; error?: string };

export function storageOp(site: string, op: unknown, key: unknown, value: unknown, priv = false): StorageReply {
  const data = read(site, priv);
  switch (op) {
    case 'get':
      return { value: typeof key === 'string' ? data.get(key) : undefined };
    case 'keys':
      return { value: [...data.keys()] };
    case 'set':
      if (typeof key !== 'string' || typeof value !== 'string') return { error: 'Invalid storage value' };
      data.set(key, value);
      break;
    case 'remove':
      if (typeof key === 'string') data.delete(key);
      break;
    case 'clear':
      data.clear();
      break;
    default:
      return { error: 'Unknown storage operation' };
  }
  const json = JSON.stringify(Object.fromEntries(data));
  if (json.length > LIMIT) return { error: 'biggle.storage is full (1 MB per site)' };
  try {
    setItem(keyFor(site), json, priv);
  } catch {
    return { error: 'Storage is unavailable' };
  }
  return {};
}
