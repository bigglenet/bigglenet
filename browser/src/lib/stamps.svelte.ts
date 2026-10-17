// Stamps you've collected from sites (server/src/stamps.ts): from a site's ⋯ menu, shown on your
// profile as the sites' 88×31 buttons.
import { api } from './api';
import { browser } from './browser.svelte';
import { t } from './i18n.svelte';

class Stamps {
  list = $state<string[]>([]);

  async refresh() {
    try {
      this.list = (await api<{ stamps: string[] }>('GET', '/api/stamps')).stamps;
    } catch {}
  }

  has(site: string) {
    return this.list.includes(site);
  }

  async collect(site: string) {
    if (this.has(site)) return browser.say(t('You already have this site’s stamp.'));
    try {
      const r = await api<{ count: number }>('POST', `/api/stamps/${encodeURIComponent(site)}`);
      this.list = [site, ...this.list];
      browser.say(t('Stamp collected! You have {n}. They’re on your profile.', { n: r.count }));
    } catch (e) {
      browser.say((e as Error).message);
    }
  }

  async giveBack(site: string) {
    await api('DELETE', `/api/stamps/${encodeURIComponent(site)}`);
    this.list = this.list.filter((s) => s !== site);
  }

  reset() {
    this.list = [];
  }
}

export const stamps = new Stamps();
