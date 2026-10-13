// Settings for each site, kept in this browser: dark mode for sites that don't have one (or for
// every site), and (desktop app) the permissions you've given sites straight from the internet.
// Zoom is in zoom.svelte.ts. biggle://settings/sites lists them all.

import { registerSync, syncChanged } from './sync.svelte';

const KEY = 'biggle:site-settings';
type Saved = { darkAll: boolean; sites: Record<string, { dark?: boolean }> };

function load(): Saved {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Saved> | null;
    return { darkAll: !!saved?.darkAll, sites: saved?.sites && typeof saved.sites === 'object' ? saved.sites : {} };
  } catch {
    return { darkAll: false, sites: {} };
  }
}

class SiteSettings {
  #saved = load();
  /** Every site, made dark. */
  darkAll = $state(this.#saved.darkAll);
  sites = $state(this.#saved.sites);

  /** Whether a site (by key) is shown dark. */
  dark(site: string): boolean {
    return this.sites[site]?.dark ?? this.darkAll;
  }

  setDark(site: string, on: boolean) {
    this.sites[site] = { ...this.sites[site], dark: on };
    this.save();
  }

  setDarkAll(on: boolean) {
    this.darkAll = on;
    // Sites set one way on their own keep their setting only if it differs.
    for (const [site, s] of Object.entries(this.sites)) if (s.dark === on) delete this.sites[site].dark;
    this.save();
  }

  forget(site: string) {
    delete this.sites[site];
    this.save();
  }

  /** The settings from another device (sync). */
  replace(data: unknown) {
    const d = data as Partial<Saved> | null;
    this.darkAll = !!d?.darkAll;
    this.sites = d?.sites && typeof d.sites === 'object' ? d.sites : {};
    this.save();
  }

  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ darkAll: this.darkAll, sites: this.sites }));
    } catch {}
    syncChanged('sites');
  }
}

export const siteSettings = new SiteSettings();

registerSync('sites', 'sites', {
  get: () => ({ darkAll: siteSettings.darkAll, sites: $state.snapshot(siteSettings.sites) }),
  set: (data) => siteSettings.replace(data),
});
