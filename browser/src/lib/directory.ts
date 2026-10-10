import { SERVER } from './config';

/** A live site. `created` is when its name was made (seconds). */
export type DirectoryEntry = { name: string; tld?: 'biggle' | 'b'; title: string | null; created?: number };

let cached: { at: number; promise: Promise<DirectoryEntry[]> } | null = null;

/** Every live .biggle site, for Nox's index and the start page. */
export function loadDirectory(): Promise<DirectoryEntry[]> {
  if (cached && Date.now() - cached.at < 30_000) return cached.promise;
  const promise = fetch(`${SERVER}/api/names`, { credentials: 'omit' })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((d: { names: DirectoryEntry[] }) => d.names);
  cached = { at: Date.now(), promise };
  promise.catch(() => (cached = null));
  return promise;
}

/** A live site's address ending, or null if it isn't listed (or the list can't be had). */
export function tldOf(name: string): Promise<'biggle' | 'b' | null> {
  return loadDirectory().then(
    (list) => list.find((s) => s.name === name)?.tld ?? null,
    () => null,
  );
}
