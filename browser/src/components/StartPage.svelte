<script lang="ts">
  import { browser, type Tab } from '../lib/browser.svelte';
  import { loadDirectory } from '../lib/directory';
  import Icon from './Icon.svelte';

  let { tab }: { tab: Tab } = $props();

  let query = $state('');
  const directory = loadDirectory();

  function submit(e: SubmitEvent) {
    e.preventDefault();
    if (query.trim()) browser.open(tab, query);
  }
</script>

<div class="start">
  <div class="inner">
    <h1 class="brand"><span class="logo-word" aria-hidden="true"></span><span class="sr-only">bigglenet</span></h1>

    <form class="search" onsubmit={submit}>
      <input bind:value={query} placeholder="Go to a .biggle address" aria-label="Address" spellcheck="false" />
      <button type="submit">Go</button>
    </form>

    <button class="home" onclick={() => browser.go(tab, 'biggle://home.biggle/')}>
      <span class="home-mark"><span class="logo-mark" aria-hidden="true"></span></span>
      <span class="home-text">
        <strong>home.biggle</strong>
        <span>New here? Start with the Bigglenet's homepage.</span>
      </span>
      <Icon name="forward" />
    </button>

    <section>
      <h2>Sites on the Bigglenet</h2>
      {#await directory}
        <p class="muted">Loading…</p>
      {:then sites}
        {#if sites.length === 0}
          <p class="muted">No sites yet.</p>
        {:else}
          <ul class="sites">
            {#each sites.filter((s) => s.name !== 'home') as site (site.name)}
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

  .brand {
    display: flex;
    justify-content: center;
    margin: 0 0 36px;
  }
  .brand .logo-word {
    height: 92px;
  }

  .search {
    display: flex;
    gap: 8px;
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

  .home {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 14px;
    margin-top: 16px;
    padding: 14px 18px 14px 14px;
    border: 0;
    border-radius: 16px;
    background: var(--accent);
    color: var(--on-accent);
    font: inherit;
    text-align: left;
  }
  .home:hover {
    opacity: 0.92;
  }
  .home-mark {
    flex: none;
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: var(--on-accent);
    color: var(--accent);
  }
  .home-mark .logo-mark {
    height: 26px;
  }
  .home-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .home-text span {
    opacity: 0.75;
    font-size: 14px;
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
  .muted {
    color: var(--muted);
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
