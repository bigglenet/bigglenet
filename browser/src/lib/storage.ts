// Backs biggle.storage. Values arrive already JSON-encoded by the page.

const LIMIT = 1_000_000;

const keyFor = (site: string) => `biggle:storage:${site}`;

function read(site: string): Map<string, string> {
  try {
    return new Map(Object.entries(JSON.parse(localStorage.getItem(keyFor(site)) ?? '{}')));
  } catch {
    return new Map();
  }
}

export type StorageReply = { value?: unknown; error?: string };

export function storageOp(site: string, op: unknown, key: unknown, value: unknown): StorageReply {
  const data = read(site);
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
    localStorage.setItem(keyFor(site), json);
  } catch {
    return { error: 'Storage is unavailable' };
  }
  return {};
}
