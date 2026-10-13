// Sites you follow (server/src/discover.ts). One that changed since you last visited it has a dot
// (`changed`); visiting it clears the dot.
import { api } from './api';
import { t } from './i18n.svelte';

export type Followed = { site: string; tld: 'biggle' | 'b'; title: string | null; updated: number; changed: boolean };

class Follows {
  list = $state<Followed[]>([]);
  loaded = $state(false);

  /** How many changed since you looked. */
  readonly changed = $derived(this.list.filter((f) => f.changed).length);

  async refresh() {
    try {
      this.list = (await api<{ follows: Followed[] }>('GET', '/api/follows')).follows;
      this.loaded = true;
    } catch {}
  }

  has(site: string) {
    return this.list.some((f) => f.site === site);
  }

  async toggle(site: string, say?: (text: string) => void) {
    if (this.has(site)) {
      await api('DELETE', `/api/follows/${encodeURIComponent(site)}`);
      this.list = this.list.filter((f) => f.site !== site);
      say?.(t('Stopped following'));
    } else {
      await api('POST', '/api/follows', { site });
      await this.refresh();
      say?.(t('Following. You’ll see a dot when it changes.'));
    }
  }

  /** You're on it now, so it's seen (the server already knows, from the visit). */
  seen(site: string) {
    const f = this.list.find((x) => x.site === site);
    if (f?.changed) f.changed = false;
  }

  reset() {
    this.list = [];
    this.loaded = false;
  }
}

export const follows = new Follows();
