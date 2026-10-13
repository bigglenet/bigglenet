<script lang="ts">
  // biggle://bookmarks: every bookmark, to open, rename, reorder or remove.
  import { t } from '../lib/i18n.svelte';
  import { browser, type Tab } from '../lib/browser.svelte';
  import { bookmarks, type Bookmark } from '../lib/bookmarks.svelte';
  import { isMac } from '../lib/platform';
  import Icon from './Icon.svelte';

  let { tab }: { tab: Tab } = $props();

  let query = $state('');
  let editing = $state<string | null>(null);
  let title = $state('');
  let url = $state('');

  const shown = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return q ? bookmarks.list.filter((b) => `${b.title} ${b.url}`.toLowerCase().includes(q)) : bookmarks.list;
  });

  function open(e: MouseEvent, b: Bookmark) {
    if (e.button === 1 || e.metaKey || e.ctrlKey) browser.newTab(b.url, { activate: false, after: tab.id });
    else browser.go(tab, b.url);
  }

  function edit(b: Bookmark) {
    editing = b.id;
    title = b.title;
    url = b.url;
  }

  function save(e: SubmitEvent, b: Bookmark) {
    e.preventDefault();
    bookmarks.update(b.id, { title, url: url.startsWith('biggle://') ? url : b.url });
    editing = null;
  }
</script>

<div class="page">
  <div class="inner">
    <header>
      <h1>{t('Bookmarks')}</h1>
      <label class="bar-toggle">
        <input type="checkbox" checked={bookmarks.bar} onchange={(e) => bookmarks.showBar(e.currentTarget.checked)} />
        {t('Show the bookmarks bar')}
      </label>
    </header>

    {#if bookmarks.list.length === 0}
      <div class="empty">
        <Icon name="star" size={28} />
        <p>{t('No bookmarks yet.')}</p>
        <p class="muted">{t('Press {isMac} on any page, or click the star in the address bar.', { isMac: isMac ? '⌘D' : 'Ctrl+D' })}</p>
      </div>
    {:else}
      <input class="search" bind:value={query} placeholder={t('Search bookmarks')} aria-label={t('Search bookmarks')} spellcheck="false" />
      <ul>
        {#each shown as b, i (b.id)}
          <li>
            {#if editing === b.id}
              <form class="edit" onsubmit={(e) => save(e, b)}>
                <input bind:value={title} aria-label={t('Name')} maxlength="120" />
                <input bind:value={url} aria-label={t('Address')} spellcheck="false" />
                <div class="edit-actions">
                  <button type="button" class="ghost" onclick={() => (editing = null)}>{t('Cancel')}</button>
                  <button class="primary">{t('Save')}</button>
                </div>
              </form>
            {:else}
              <button class="open" onclick={(e) => open(e, b)} onauxclick={(e) => e.button === 1 && open(e, b)}>
                {#if b.icon}<img src={b.icon} alt="" width="18" height="18" />{:else}<Icon name="globe" size={16} />{/if}
                <span class="text">
                  <span class="title">{b.title}</span>
                  <span class="url">{b.url}</span>
                </span>
              </button>
              {#if !query}
                <button class="icon" aria-label={t('Move up')} title={t('Move up')} disabled={i === 0} onclick={() => bookmarks.move(b.id, -1)}>
                  <Icon name="up" size={15} />
                </button>
                <button class="icon" aria-label={t('Move down')} title={t('Move down')} disabled={i === shown.length - 1} onclick={() => bookmarks.move(b.id, 1)}>
                  <Icon name="down" size={15} />
                </button>
              {/if}
              <button class="icon" aria-label={t('Edit {title}', { title: b.title })} title={t('Edit')} onclick={() => edit(b)}><Icon name="edit" size={15} /></button>
              <button class="icon" aria-label={t('Remove {title}', { title: b.title })} title={t('Remove')} onclick={() => bookmarks.remove(b.id)}>
                <Icon name="trash" size={15} />
              </button>
            {/if}
          </li>
        {/each}
      </ul>
      {#if shown.length === 0}<p class="muted none">{t('No bookmarks match “{query}”.', { query })}</p>{/if}
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
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 20px;
  }
  h1 {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.02em;
  }
  .bar-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--muted);
    font-size: 14px;
    cursor: pointer;
  }
  .search {
    width: 100%;
    height: 40px;
    margin-bottom: 14px;
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
    gap: 2px;
    padding: 6px 8px;
    border-top: 1px solid var(--border);
  }
  li:first-child {
    border-top: 0;
  }
  button {
    font: inherit;
  }
  .open {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px;
    border: 0;
    border-radius: 10px;
    background: none;
    color: var(--text);
    text-align: left;
  }
  .open:hover {
    background: var(--hover);
  }
  .text {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .title,
  .url {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .title {
    font-weight: 600;
    font-size: 14.5px;
  }
  .url {
    color: var(--muted);
    font-size: 12.5px;
  }
  img {
    flex: none;
    border-radius: 4px;
    object-fit: contain;
  }
  .icon {
    flex: none;
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: 8px;
    background: none;
    color: var(--muted);
  }
  .icon:hover:not(:disabled) {
    background: var(--hover);
    color: var(--text);
  }
  .icon:disabled {
    color: var(--faint);
  }
  .edit {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
  }
  .edit input {
    height: 36px;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 14px;
  }
  .edit-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .primary,
  .ghost {
    height: 34px;
    padding: 0 14px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
  }
  .primary {
    border: 0;
    background: var(--accent);
    color: var(--on-accent);
  }
  .ghost {
    border: 1px solid var(--border);
    background: none;
    color: var(--text);
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
</style>
