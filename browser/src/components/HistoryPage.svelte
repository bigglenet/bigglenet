<script lang="ts">
  // biggle://history: tabs you closed (to bring back), and the sites you've been to, by day.
  import { browser, type ClosedTab, type Tab } from '../lib/browser.svelte';
  import { pageHistory, type Visit } from '../lib/history.svelte';
  import { isMac } from '../lib/platform';
  import Icon from './Icon.svelte';

  let { tab }: { tab: Tab } = $props();

  const PAGE = 200;
  let query = $state('');
  let limit = $state(PAGE);
  let clearing = $state(false);

  const matching = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return q ? pageHistory.visits.filter((v) => `${v.title} ${v.url}`.toLowerCase().includes(q)) : pageHistory.visits;
  });

  /** The visits shown, grouped by day. */
  const days = $derived.by(() => {
    const groups: { label: string; visits: Visit[] }[] = [];
    for (const v of matching.slice(0, limit)) {
      const label = dayLabel(v.at);
      if (groups.at(-1)?.label !== label) groups.push({ label, visits: [] });
      groups.at(-1)!.visits.push(v);
    }
    return groups;
  });

  function dayLabel(at: number): string {
    const d = new Date(at);
    const today = new Date();
    const yesterday = new Date(Date.now() - 86_400_000);
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
  }

  const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const host = (url: string) => url.replace(/^biggle:\/\//, '').replace(/\/$/, '');

  function open(e: MouseEvent, url: string) {
    if (e.button === 1 || e.metaKey || e.ctrlKey) browser.newTab(url, { activate: false, after: tab.id });
    else browser.go(tab, url);
  }

  function reopen(c: ClosedTab) {
    browser.reopenClosed(c);
  }
</script>

<div class="page">
  <div class="inner">
    <header>
      <h1>History</h1>
      {#if pageHistory.visits.length}
        {#if clearing}
          <span class="confirm">
            Clear all history? <button class="danger" onclick={() => ((clearing = false), pageHistory.clear())}>Clear it</button>
            <button class="ghost" onclick={() => (clearing = false)}>Keep it</button>
          </span>
        {:else}
          <button class="ghost" onclick={() => (clearing = true)}><Icon name="trash" size={14} /> Clear history</button>
        {/if}
      {/if}
    </header>

    {#if browser.closed.length}
      <section>
        <h2>Recently closed tabs <span class="hint">{isMac ? '⇧⌘T' : 'Ctrl+Shift+T'} brings back the last one</span></h2>
        <ul>
          {#each [...browser.closed].reverse() as c (c.closedAt + c.url)}
            <li>
              <span class="time">{time(c.closedAt)}</span>
              <button class="open" onclick={() => reopen(c)} title="Reopen this tab">
                <span class="title">{c.title}</span>
                <span class="url">{host(c.url)}</span>
              </button>
              <button class="icon" aria-label="Reopen {c.title}" title="Reopen" onclick={() => reopen(c)}><Icon name="reload" size={15} /></button>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if pageHistory.visits.length === 0}
      <div class="empty">
        <Icon name="clock" size={28} />
        <p>No history yet.</p>
        <p class="muted">Sites you visit show up here. History stays on this device.</p>
      </div>
    {:else}
      <input class="search" bind:value={query} oninput={() => (limit = PAGE)} placeholder="Search history" aria-label="Search history" spellcheck="false" />
      {#each days as day (day.label)}
        <section>
          <h2>{day.label}</h2>
          <ul>
            {#each day.visits as v (v.at + v.url)}
              <li>
                <span class="time">{time(v.at)}</span>
                <button class="open" onclick={(e) => open(e, v.url)} onauxclick={(e) => e.button === 1 && open(e, v.url)} title={v.url}>
                  <span class="title">{v.title}</span>
                  <span class="url">{host(v.url)}</span>
                </button>
                <button class="icon" aria-label="Remove {v.title} from history" title="Remove from history" onclick={() => pageHistory.remove(v)}>
                  <Icon name="close" size={15} />
                </button>
              </li>
            {/each}
          </ul>
        </section>
      {/each}
      {#if matching.length > limit}
        <button class="ghost more" onclick={() => (limit += PAGE)}>Show more</button>
      {:else if matching.length === 0}
        <p class="muted none">Nothing in your history matches “{query}”.</p>
      {/if}
    {/if}
  </div>
</div>

<style>
  .page {
    height: 100%;
    overflow: auto;
    background: var(--surface);
  }
  .inner {
    max-width: 720px;
    margin: 0 auto;
    padding: 40px 20px 64px;
  }
  header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 20px;
  }
  h1 {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.02em;
  }
  h2 {
    margin: 0 0 8px 4px;
    font-size: 13px;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .hint {
    margin-left: 6px;
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
  }
  section {
    margin-bottom: 22px;
  }
  .search {
    width: 100%;
    height: 40px;
    margin-bottom: 18px;
    padding: 0 14px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--card);
    color: var(--text);
    font: inherit;
  }
  .search:focus {
    outline: 0;
    border-color: var(--accent);
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--card);
    overflow: hidden;
  }
  li {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px 4px 14px;
    border-top: 1px solid var(--border);
  }
  li:first-child {
    border-top: 0;
  }
  button {
    font: inherit;
  }
  .time {
    flex: none;
    width: 52px;
    color: var(--muted);
    font-size: 12.5px;
    font-variant-numeric: tabular-nums;
  }
  .open {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 9px 8px;
    border: 0;
    border-radius: 10px;
    background: none;
    color: var(--text);
    text-align: left;
  }
  .open:hover {
    background: var(--hover);
  }
  .title {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 14.5px;
  }
  .url {
    flex: none;
    max-width: 45%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--muted);
    font-size: 12.5px;
  }
  .icon {
    flex: none;
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border: 0;
    border-radius: 8px;
    background: none;
    color: var(--muted);
  }
  .icon:hover {
    background: var(--hover);
    color: var(--text);
  }
  .ghost,
  .danger {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 12px;
    border-radius: 9px;
    font-size: 13.5px;
    font-weight: 600;
  }
  .ghost {
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--text);
  }
  .danger {
    border: 0;
    background: var(--danger);
    color: #fff;
  }
  .confirm {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
  }
  .more {
    display: flex;
    margin: 0 auto;
  }
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 48px 20px;
    border: 1px dashed var(--border);
    border-radius: 16px;
    color: var(--muted);
    text-align: center;
  }
  .empty p {
    margin: 0;
    color: var(--text);
  }
  .empty p.muted,
  .muted {
    color: var(--muted);
  }
  .none {
    margin: 14px 4px;
  }
  @media (max-width: 560px) {
    .url {
      display: none;
    }
  }
</style>
