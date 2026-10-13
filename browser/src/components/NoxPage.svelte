<script lang="ts">
  // biggle://nox: finding sites. Search names and what pages say; with nothing searched, the
  // rankings (popular, trending, new, updated), tags, and links to This week, webrings and the
  // sites you follow (server/src/discover.ts).
  //   nox?q=…            search
  //   nox?tag=games      sites with a tag
  //   nox/week           This week on the Bigglenet
  //   nox/webrings[/id]  webrings
  //   nox/following      sites you follow
  import { api } from '../lib/api';
  import { browser, type Tab } from '../lib/browser.svelte';
  import { labelName, loadDiscover, tagName, type DiscoverSite } from '../lib/discover';
  import { follows } from '../lib/follows.svelte';
  import { plural, t } from '../lib/i18n.svelte';
  import { looksLikeAddress, noxSearch, parse, siteHome, siteHost } from '../lib/url';
  import Icon from './Icon.svelte';
  import FollowingView from './nox/FollowingView.svelte';
  import WebringsView from './nox/WebringsView.svelte';
  import WeekView from './nox/WeekView.svelte';

  let { tab, path = '' }: { tab: Tab; path?: string } = $props();

  type Order = 'popular' | 'trending' | 'new' | 'updated' | 'name';
  type Found = { site: string; tld: 'biggle' | 'b'; path: string; title: string | null; snippet: string };

  let query = $state('');
  let order = $state<Order>('popular');
  const params = $derived(new URLSearchParams(parse(tab.url)?.search ?? ''));
  const tag = $derived(params.get('tag') ?? '');
  const discover = loadDiscover();

  // Follow the address (back/forward, links). Only reads the tab, so typing isn't overwritten.
  $effect(() => {
    query = params.get('q') ?? '';
  });

  // What pages say, for the search in the address.
  let pages = $state<Found[] | null>(null);
  $effect(() => {
    const q = params.get('q')?.trim() ?? '';
    pages = null;
    if (!q) return;
    let stale = false;
    api<{ results: Found[] }>('GET', `/api/search?q=${encodeURIComponent(q)}`).then(
      (r) => !stale && (pages = r.results),
      () => !stale && (pages = []),
    );
    return () => (stale = true);
  });

  function submit(e: SubmitEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    if (looksLikeAddress(q)) browser.open(tab, q);
    else browser.go(tab, noxSearch(q), 'replace');
  }

  const SORTS: Record<Order, (a: DiscoverSite, b: DiscoverSite) => number> = {
    popular: (a, b) => b.visits - a.visits || b.week - a.week,
    trending: (a, b) => Number(b.labels.includes('trending')) - Number(a.labels.includes('trending')) || b.week - a.week,
    new: (a, b) => b.created - a.created,
    updated: (a, b) => b.updated - a.updated,
    name: (a, b) => a.name.localeCompare(b.name),
  };

  function listed(sites: DiscoverSite[]) {
    const q = (params.get('q') ?? '').trim().toLowerCase().replace(/\.(biggle|b)$/, '');
    if (q) {
      // Exact names first, then names starting with the search, then everything else that matches.
      const rank = (s: DiscoverSite) => (s.name === q ? 0 : s.name.startsWith(q) ? 1 : 2);
      return sites
        .filter((s) => s.name.includes(q) || s.title?.toLowerCase().includes(q) || s.tags.some((x) => tagName(x).toLowerCase() === q))
        .sort((a, b) => rank(a) - rank(b) || b.visits - a.visits);
    }
    return sites.filter((s) => !tag || s.tags.includes(tag)).sort(SORTS[order]);
  }

  const ORDERS: [Order, string][] = [
    ['popular', 'Popular'],
    ['trending', 'Trending'],
    ['new', 'New'],
    ['updated', 'Updated'],
    ['name', 'A–Z'],
  ];
</script>

{#if path === 'week'}
  <WeekView {tab} />
{:else if path === 'following'}
  <FollowingView {tab} />
{:else if path === 'webrings' || path.startsWith('webrings/')}
  <WebringsView {tab} id={Number(path.split('/')[1]) || null} />
{:else}
<div class="start">
  <div class="inner">
    <h1>Nox</h1>
    <p class="muted">{t('Search the Bigglenet.')}</p>

    <form class="search" onsubmit={submit}>
      <input bind:value={query} placeholder={t('Search sites and what they say, or type an address')} aria-label={t('Search')} spellcheck="false" />
      <button type="submit">{t('Go')}</button>
    </form>

    <nav class="more" aria-label={t('More of Nox')}>
      <button onclick={() => browser.go(tab, 'biggle://nox/week')}><Icon name="star" size={15} /> {t('This week')}</button>
      <button onclick={() => browser.go(tab, 'biggle://nox/webrings')}><Icon name="reload" size={15} /> {t('Webrings')}</button>
      <button onclick={() => browser.go(tab, 'biggle://nox/following')}>
        <Icon name="bell" size={15} /> {t('Following')}
        {#if follows.changed}<span class="dot" title={plural(follows.changed, '{n} changed', '{n} changed')}></span>{/if}
      </button>
    </nav>

    <section>
      {#await discover}
        <p class="muted">{t('Loading…')}</p>
      {:then { sites, tags }}
        {@const matched = listed(sites)}
        {#if params.get('q')}
          {#if matched.length}<h2>{t('Sites')}</h2>{/if}
        {:else}
          <div class="tags" role="group" aria-label={t('Tags')}>
            <button class:on={!tag} onclick={() => browser.go(tab, 'biggle://nox', 'replace')}>{t('Everything')}</button>
            {#each tags as x (x)}
              <button class:on={tag === x} onclick={() => browser.go(tab, `biggle://nox?tag=${x}`, 'replace')}>{tagName(x)}</button>
            {/each}
          </div>
          <div class="index-head">
            <h2>{tag ? tagName(tag) : t('Every site on the Bigglenet')} · {matched.length}</h2>
            <div class="order" role="radiogroup" aria-label={t('Order')}>
              {#each ORDERS as [value, label] (value)}
                <button role="radio" aria-checked={order === value} class:on={order === value} onclick={() => (order = value)}>{t(label)}</button>
              {/each}
            </div>
          </div>
        {/if}
        {#if matched.length === 0}
          {#if !params.get('q')}<p class="muted left">{t('No sites here yet.')}</p>{/if}
        {:else}
          <ul class="sites">
            {#each matched as site (site.name)}
              <li>
                <button onclick={() => browser.go(tab, siteHome(site.name, site.tld))}>
                  <span class="tile">{site.name[0].toUpperCase()}</span>
                  <span class="text">
                    <span class="name">
                      {siteHost(site.name, site.tld)}
                      {#if follows.has(site.name)}<Icon name="bell" size={12} />{/if}
                    </span>
                    {#if site.title}<span class="title">{site.title}</span>{/if}
                    <span class="meta">
                      {#each site.labels as l (l)}<span class="label {l}">{labelName(l)}</span>{/each}
                      {#if order === 'popular' || order === 'trending'}<span class="count">{plural(order === 'popular' ? site.visits : site.week, '{n} visit', '{n} visits')}</span>{/if}
                    </span>
                  </span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
        {#if params.get('q')}
          <h2 class="pages-head">{t('Pages')}</h2>
          {#if pages === null}
            <p class="muted left">{t('Looking through pages…')}</p>
          {:else if pages.length === 0}
            <p class="muted left">{matched.length ? t('No pages say that.') : t('Nothing on the Bigglenet matches that.')}</p>
          {:else}
            <ol class="pages">
              {#each pages as p (p.site + p.path)}
                <li>
                  <button onclick={() => browser.go(tab, siteHome(p.site, p.tld) + (p.path === 'index.bhtml' ? '' : p.path))}>
                    <span class="page-title">{p.title || siteHost(p.site, p.tld)}</span>
                    <span class="page-url">{siteHost(p.site, p.tld)}/{p.path === 'index.bhtml' ? '' : p.path}</span>
                    <span class="snippet">{p.snippet}</span>
                  </button>
                </li>
              {/each}
            </ol>
          {/if}
        {/if}
      {:catch}
        <p class="muted">{t('Can’t reach the Biggle server right now.')}</p>
      {/await}
    </section>
  </div>
</div>
{/if}

<style>
  .start {
    height: 100%;
    overflow: auto;
    background: var(--surface);
  }
  .inner {
    max-width: 640px;
    margin: 0 auto;
    padding: 12vh 20px 48px;
  }
  h1 {
    margin: 0;
    text-align: center;
    font-size: 46px;
    line-height: 1.05;
    letter-spacing: -0.04em;
  }
  .muted {
    margin: 10px 0 0;
    text-align: center;
    color: var(--muted);
  }

  .search {
    display: flex;
    gap: 8px;
    margin-top: 28px;
    padding: 6px;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--card);
    box-shadow: 0 6px 24px -12px rgb(0 0 0 / 0.25);
  }
  .search:focus-within {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .search input {
    flex: 1;
    min-width: 0;
    padding: 0 12px;
    border: 0;
    outline: 0;
    background: none;
    color: var(--text);
    font: inherit;
    font-size: 16px;
  }
  .search button {
    padding: 10px 18px;
    border: 0;
    border-radius: 11px;
    background: var(--accent);
    color: var(--on-accent);
    font: inherit;
    font-weight: 600;
  }

  .index-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }
  .index-head h2 {
    margin: 0;
  }
  .order {
    display: flex;
    gap: 2px;
    padding: 3px;
    border-radius: 10px;
    background: var(--hover);
  }
  .order button {
    padding: 4px 10px;
    border: 0;
    border-radius: 7px;
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
  }
  .order button.on {
    background: var(--card);
    color: var(--text);
  }
  section {
    margin-top: 40px;
  }
  h2 {
    margin: 0 0 12px;
    font-size: 13px;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .sites {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .sites button {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--card);
    color: var(--text);
    font: inherit;
    text-align: left;
  }
  .sites button:hover {
    border-color: var(--accent);
  }
  .tile {
    flex: none;
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: 11px;
    background: var(--accent);
    color: var(--on-accent);
    font-weight: 700;
    font-size: 18px;
  }
  .text {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .name {
    font-weight: 600;
  }
  .title {
    color: var(--muted);
    font-size: 13px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .more {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
    margin-top: 14px;
  }
  .more button {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 12px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--card);
    color: var(--text);
    font: inherit;
    font-size: 13.5px;
    font-weight: 600;
  }
  .more button:hover {
    border-color: var(--accent);
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--danger);
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 18px;
  }
  .tags button {
    padding: 5px 11px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
  }
  .tags button.on {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--on-accent);
  }
  .left {
    text-align: left;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    margin-top: 3px;
  }
  .meta:empty {
    display: none;
  }
  .label {
    padding: 1px 7px;
    border-radius: 999px;
    background: var(--accent-soft);
    font-size: 11px;
    font-weight: 700;
  }
  .label.trending {
    background: color-mix(in srgb, #f08c00 22%, transparent);
  }
  .label.new {
    background: color-mix(in srgb, var(--online) 22%, transparent);
  }
  .count {
    color: var(--muted);
    font-size: 11.5px;
  }
  .name {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .pages-head {
    margin-top: 32px;
  }
  .pages {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .pages button {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 12px;
    border: 0;
    border-radius: 12px;
    background: none;
    color: var(--text);
    font: inherit;
    text-align: left;
  }
  .pages button:hover {
    background: var(--hover);
  }
  .page-title {
    font-weight: 600;
    font-size: 16px;
  }
  .page-url {
    color: var(--online);
    font-size: 12.5px;
  }
  .snippet {
    color: var(--muted);
    font-size: 13.5px;
    line-height: 1.45;
  }
</style>
