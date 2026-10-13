// Sync through your Biggle ID (server/src/account.ts): bookmarks, new tab settings and
// shortcuts, look and language, and per-site settings, the same on all your devices.
//
// Stores register what they keep (registerSync) and say when it changes (syncChanged). A change
// goes up a moment later; when another device changes something, the live connection says so and
// this device takes the newer copy. Each part has its own time, and the newest wins.
// Not account.svelte.ts: stores import this, and that would make an import cycle (account → api → i18n).
import { api, hasSession } from './api';

export type SyncKey = 'bookmarks' | 'start' | 'settings' | 'sites';
type Source = { get(): unknown; set(data: unknown): void };

const ENABLED = 'biggle:sync';
const STAMPS = 'biggle:sync-stamps';
const sources: Partial<Record<SyncKey, Record<string, Source>>> = {};

/** A store's part of a key (the 'settings' key has a few: the look, the language…). */
export function registerSync(key: SyncKey, part: string, source: Source) {
  (sources[key] ??= {})[part] = source;
}

function read<T>(key: string, fallback: T): T {
  try {
    return (JSON.parse(localStorage.getItem(key) ?? 'null') as T) ?? fallback;
  } catch {
    return fallback;
  }
}

class Sync {
  enabled = $state(read<boolean>(ENABLED, true));
  private stamps: Partial<Record<SyncKey, number>> = read(STAMPS, {});
  private applying = false;
  private timers = new Map<SyncKey, ReturnType<typeof setTimeout>>();

  setEnabled(on: boolean) {
    this.enabled = on;
    try {
      localStorage.setItem(ENABLED, JSON.stringify(on));
    } catch {}
    if (on) this.pull();
  }

  /** A store saved: send it up a moment later (several quick changes go as one). */
  changed(key: SyncKey) {
    if (this.applying) return;
    this.stamps[key] = Date.now();
    this.saveStamps();
    if (!this.enabled || !hasSession()) return;
    clearTimeout(this.timers.get(key));
    this.timers.set(
      key,
      setTimeout(() => this.push(key), 1500),
    );
  }

  private data(key: SyncKey) {
    const parts = sources[key] ?? {};
    return Object.fromEntries(Object.entries(parts).map(([part, s]) => [part, s.get()]));
  }

  private async push(key: SyncKey) {
    if (!this.enabled || !hasSession()) return;
    try {
      await api('PUT', `/api/sync/${key}`, { data: this.data(key), updatedAt: this.stamps[key] ?? Date.now() });
    } catch {}
  }

  /** Take what's newer on the server; send up what's newer here. */
  async pull() {
    if (!this.enabled || !hasSession()) return;
    let items: Partial<Record<SyncKey, { data: Record<string, unknown>; updatedAt: number }>>;
    try {
      items = (await api<{ items: typeof items }>('GET', '/api/sync')).items;
    } catch {
      return;
    }
    for (const key of Object.keys(sources) as SyncKey[]) {
      const remote = items[key];
      const local = this.stamps[key] ?? 0;
      if (remote && remote.updatedAt > local) {
        this.applying = true;
        try {
          for (const [part, source] of Object.entries(sources[key] ?? {})) {
            if (remote.data && part in remote.data) source.set(remote.data[part]);
          }
        } catch {}
        this.applying = false;
        this.stamps[key] = remote.updatedAt;
      } else if (!remote || local > remote.updatedAt) {
        // The first device, or changes made while offline.
        if (!this.stamps[key]) this.stamps[key] = Date.now();
        await this.push(key);
      }
    }
    this.saveStamps();
  }

  private saveStamps() {
    try {
      localStorage.setItem(STAMPS, JSON.stringify(this.stamps));
    } catch {}
  }
}

export const sync = new Sync();
export const syncChanged = (key: SyncKey) => sync.changed(key);
