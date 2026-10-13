// Finding sites in Nox (server/src/discover.ts): every site with its visits, tags and labels.
import { api } from './api';
import { t } from './i18n.svelte';

export type Label = 'new' | 'updated' | 'trending';
export type DiscoverSite = {
  name: string;
  tld: 'biggle' | 'b';
  title: string | null;
  created: number;
  updated: number;
  visits: number;
  week: number;
  tags: string[];
  labels: Label[];
};

let cached: { at: number; promise: Promise<{ sites: DiscoverSite[]; tags: string[] }> } | null = null;

export function loadDiscover(): Promise<{ sites: DiscoverSite[]; tags: string[] }> {
  if (cached && Date.now() - cached.at < 30_000) return cached.promise;
  const promise = api<{ sites: DiscoverSite[]; tags: string[] }>('GET', '/api/discover');
  cached = { at: Date.now(), promise };
  promise.catch(() => (cached = null));
  return promise;
}

const TAG_NAMES: Record<string, string> = {
  games: 'Games',
  art: 'Art',
  music: 'Music',
  writing: 'Writing',
  tech: 'Tech',
  fun: 'Fun',
  personal: 'Personal',
  learning: 'Learning',
  news: 'News',
  tools: 'Tools',
  community: 'Community',
  animals: 'Animals',
};
export const tagName = (tag: string) => t(TAG_NAMES[tag] ?? tag);
/** Every tag, in order (the server keeps the same list). */
export const TAG_IDS = Object.keys(TAG_NAMES);

const LABEL_NAMES: Record<Label, string> = { new: 'New', updated: 'Updated', trending: 'Trending' };
export const labelName = (label: Label) => t(LABEL_NAMES[label]);
