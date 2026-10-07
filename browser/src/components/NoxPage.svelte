<script lang="ts">
  import { browser, type Tab } from '../lib/browser.svelte';
  import { loadDirectory, type DirectoryEntry } from '../lib/directory';
  import { looksLikeAddress, noxSearch } from '../lib/url';

  let { tab }: { tab: Tab } = $props();

  let query = $state('');
  const directory = loadDirectory();

  function qFromTab() {
    const i = tab.url.indexOf('?');
    if (i === -1) return '';
    return new URLSearchParams(tab.url.slice(i + 1)).get('q') ?? '';
  }

  // Follow the address (back/forward, links). Only reads the tab, so typing isn't overwritten.
  $effect(() => {
    query = qFromTab();
  });

  function submit(e: SubmitEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    if (looksLikeAddress(q)) browser.open(tab, q);
    else browser.go(tab, noxSearch(q), 'replace');
  }

  function results(sites: DirectoryEntry[]) {
    const q = query.trim().toLowerCase().replace(/\.biggle$/, '');
    if (!q) return sites;
    // Exact names first, then names starting with the search, then everything else that matches.
    const rank = (s: DirectoryEntry) => (s.name === q ? 0 : s.name.startsWith(q) ? 1 : 2);
    return sites
      .filter((s) => s.name.includes(q) || s.title?.toLowerCase().includes(q))
      .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  }
</script>

<div class="start">
  <div class="inner">
    <h1>Nox</h1>
    <p class="muted">Search the Bigglenet.</p>

    <form class="search" onsubmit={submit}>
      <input bind:value={query} placeholder="Search names or type an address" aria-label="Search" spellcheck="false" />
      <button type="submit">Go</button>
    </form>

    <section>
      <h2>Results</h2>
      {#await directory}
        <p class="muted">Loading…</p>
      {:then sites}
        {@const matched = results(sites)}
        {#if matched.length === 0}
          <p class="muted">No results.</p>
        {:else}
          <ul class="sites">
            {#each matched as site (site.name)}
              <li>
                <button onclick={() => browser.go(tab, `biggle://${site.name}.biggle/`)}>
                  <span class="tile">{site.name[0].toUpperCase()}</span>
                  <span class="text">
                    <span class="name">{site.name}.biggle</span>
                    {#if site.title}<span class="title">{site.title}</span>{/if}
                  </span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      {:catch}
        <p class="muted">Can't reach the Biggle server right now.</p>
      {/await}
    </section>
  </div>
</div>

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
</style>
