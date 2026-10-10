import { SERVER } from './config';

/**
 * A live site. `name` is its key: "hello" for hello.biggle, "hello.b" for hello.b. `created` is
 * when its name was made (seconds).
 */
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

