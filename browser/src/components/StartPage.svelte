<script lang="ts">
  import { account } from '../lib/account.svelte';
  import { browser, type Tab } from '../lib/browser.svelte';
  import { loadDirectory } from '../lib/directory';
  import { BACKDROPS, startSettings as settings } from '../lib/startpage.svelte';
  import Icon from './Icon.svelte';
  import StartCustomize from './StartCustomize.svelte';

  let { tab }: { tab: Tab } = $props();

  let query = $state('');
  let customizing = $state(false);
  const directory = loadDirectory();
  const wash = $derived(BACKDROPS.find((b) => b.id === settings.backdrop)?.color ?? null);

  // The clock, when it's switched on.
  let now = $state(new Date());
  $effect(() => {
    if (!settings.shown.clock) return;
    const timer = setInterval(() => (now = new Date()), 10_000);
    return () => clearInterval(timer);
  });
  const time = $derived(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  const greeting = $derived(now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening');

  function submit(e: SubmitEvent) {
    e.preventDefault();
    browser.open(tab, query);
  }
</script>

<div class="frame">
  <div class="start" class:washed={wash} style:--wash={wash}>
    <div class="inner">
      <h1 class="brand"><span class="logo-word" aria-hidden="true"></span><span class="sr-only">bigglenet</span></h1>

      {#if settings.shown.clock}
        <div class="clock">
          <time>{time}</time>
          <p>{greeting}{account.user ? `, ${account.user.username}` : ''}.</p>
        </div>
      {/if}

      {#if settings.shown.search}
        <form class="search" onsubmit={submit}>
          <input bind:value={query} placeholder="Search with Nox or go to a .biggle address" aria-label="Search with Nox" spellcheck="false" />
          <button type="submit">Nox</button>
        </form>
      {/if}

      {#if settings.shown.shortcuts && settings.shortcuts.length}
        <ul class="shortcuts" aria-label="My shortcuts">
          {#each settings.shortcuts as shortcut, i (shortcut.url + i)}
            <li>
              <button onclick={() => browser.go(tab, shortcut.url)} title={shortcut.url}>
                <span class="tile">{shortcut.name[0]?.toUpperCase() ?? '?'}</span>
                <span class="shortcut-name">{shortcut.name}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}

      {#if settings.shown.featured}
        <button class="home" onclick={() => browser.go(tab, 'biggle://home.biggle/')}>
          <span class="home-mark"><span class="logo-mark" aria-hidden="true"></span></span>
          <span class="home-text">
            <strong>home.biggle</strong>
            <span>New here? Start with the Bigglenet's homepage.</span>
          </span>
          <Icon name="forward" />
        </button>
        <button class="make" onclick={() => browser.go(tab, 'biggle://sites')}>
          <span class="make-plus"><Icon name="plus" size={18} /></span>
          <span class="home-text">
            <strong>Make your own site</strong>
            <span>Pick a name and a look. No code needed.</span>
          </span>
          <Icon name="forward" />
        </button>
      {/if}

      {#if settings.shown.sites}
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
      {/if}
    </div>
  </div>

  <button class="customize" onclick={() => (customizing = !customizing)} aria-expanded={customizing}>
    <Icon name="settings" size={16} />
    <span>Customize</span>
  </button>
  {#if customizing}
    <StartCustomize onclose={() => (customizing = false)} />
  {/if}
</div>

<style>
  .frame {
    position: relative;
    height: 100%;
  }
  .start {
    height: 100%;
    overflow: auto;
    background: var(--surface);
  }
  /* A chosen background: its colour washed over the page's own, so it suits light and dark. */
  .start.washed {
    background: linear-gradient(160deg, color-mix(in srgb, var(--wash) 32%, var(--surface)), var(--surface) 75%);
  }

  .customize {
    position: absolute;
    right: 18px;
    bottom: 18px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 14px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--card);
    color: var(--text);
    font: inherit;
    font-size: 13.5px;
    font-weight: 600;
    box-shadow: 0 6px 18px -10px rgb(0 0 0 / 0.35);
  }
  .customize:hover {
    border-color: var(--accent);
  }

  .clock {
    margin: -12px 0 28px;
    text-align: center;
  }
  .clock time {
    display: block;
    font-size: 56px;
    font-weight: 700;
    letter-spacing: -0.03em;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .clock p {
    margin: 8px 0 0;
    color: var(--muted);
    font-size: 16px;
  }

  .shortcuts {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
    gap: 8px;
    margin: 20px 0 0;
    padding: 0;
    list-style: none;
  }
  .shortcuts button {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 14px 6px 12px;
    border: 0;
    border-radius: 14px;
    background: none;
    color: var(--text);
    font: inherit;
  }
  .shortcuts button:hover {
    background: var(--hover);
  }
  .shortcut-name {
    max-width: 100%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 13px;
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
  .make {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 14px;
    margin-top: 10px;
    padding: 14px 18px 14px 14px;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--card);
    color: var(--text);
    font: inherit;
    text-align: left;
  }
  .make:hover {
    border-color: var(--accent);
  }
  .make-plus {
    flex: none;
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: var(--accent-soft);
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
