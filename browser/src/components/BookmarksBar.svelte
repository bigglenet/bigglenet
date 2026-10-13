<script lang="ts">
  // The bookmarks bar under the address bar. ⇧⌘B (Ctrl+Shift+B) or Settings shows and hides it.
  import { t } from '../lib/i18n.svelte';
  import { browser } from '../lib/browser.svelte';
  import { bookmarks, type Bookmark } from '../lib/bookmarks.svelte';
  import Icon from './Icon.svelte';

  function open(e: MouseEvent, b: Bookmark) {
    const tab = browser.active;
    // ⌘-click, Ctrl-click and the middle button open it in a new tab, like links.
    if (e.button === 1 || e.metaKey || e.ctrlKey) browser.newTab(b.url, { activate: false, after: tab?.id });
    else if (tab) browser.go(tab, b.url);
  }
</script>

<nav class="bar" aria-label={t('Bookmarks')}>
  {#each bookmarks.list as b (b.id)}
    <button
      class="mark"
      title="{b.title}&#10;{b.url}"
      onclick={(e) => open(e, b)}
      onauxclick={(e) => e.button === 1 && open(e, b)}
    >
      {#if b.icon}
        <img src={b.icon} alt="" width="16" height="16" />
      {:else}
        <Icon name="globe" size={14} />
      {/if}
      <span>{b.title}</span>
    </button>
  {/each}
  <button class="all" title={t('All bookmarks')} onclick={() => browser.shortcut('bookmarks')}>
    <Icon name="star" size={14} /> {t('All')}
  </button>
</nav>

<style>
  .bar {
    display: flex;
    align-items: center;
    gap: 2px;
    height: 32px;
    padding: 0 8px;
    background: var(--toolbar);
    border-bottom: 1px solid var(--border);
    overflow-x: auto;
    scrollbar-width: none;
  }
  .bar::-webkit-scrollbar {
    display: none;
  }
  button {
    flex: none;
    display: flex;
    align-items: center;
    gap: 6px;
    max-width: 180px;
    height: 26px;
    padding: 0 9px;
    border: 0;
    border-radius: 7px;
    background: none;
    color: var(--text);
    font: inherit;
    font-size: 12.5px;
  }
  button:hover {
    background: var(--hover);
  }
  span {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  img {
    flex: none;
    border-radius: 3px;
    object-fit: contain;
  }
  .all {
    margin-left: auto;
    color: var(--muted);
  }
</style>
