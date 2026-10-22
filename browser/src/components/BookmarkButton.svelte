<script lang="ts">
  // The star in the address bar: bookmarks the page (⌘D / Ctrl+D does the same), then offers to
  // rename or remove it.
  import { t } from '../lib/i18n.svelte';
  import { browser } from '../lib/browser.svelte';
  import { bookmarks, type Bookmark } from '../lib/bookmarks.svelte';
  import { overlays } from '../lib/overlays.svelte';
  import Icon from './Icon.svelte';

  const tab = $derived(browser.active);
  const marked = $derived(tab ? bookmarks.find(tab.url) : undefined);

  let open = $state<Bookmark | null>(null);
  let added = $state(false);
  let name = $state('');
  let root = $state<HTMLElement>();
  let field = $state<HTMLInputElement>();
  // On a narrow screen the panel may start off the left edge: moved right that far.
  let panel = $state<HTMLElement>();
  let nudge = $state(0);
  $effect(() => {
    if (!panel) return;
    const left = panel.getBoundingClientRect().left;
    nudge = left < 12 ? 12 - left : 0;
  });

  function show() {
    if (!tab || !bookmarks.canBookmark(tab.url)) return;
    added = !marked;
    const bookmark = marked ?? bookmarks.add(tab.url, tab.title, tab.icon);
    name = bookmark.title;
    nudge = 0;
    open = bookmark;
    setTimeout(() => field?.select());
  }

  // ⌘D.
  let asked = bookmarks.ask;
  $effect(() => {
    if (bookmarks.ask !== asked) {
      asked = bookmarks.ask;
      show();
    }
  });

  function done() {
    if (open) bookmarks.update(open.id, { title: name });
    open = null;
  }

  function remove() {
    if (open) bookmarks.remove(open.id);
    open = null;
  }

  // While it's open, sites shown over the page step aside, and a click elsewhere closes it.
  $effect(() => {
    if (!open) return;
    const release = overlays.hold();
    const onpointerdown = (e: PointerEvent) => {
      if (!root?.contains(e.target as Node)) done();
    };
    document.addEventListener('pointerdown', onpointerdown);
    return () => {
      release();
      document.removeEventListener('pointerdown', onpointerdown);
    };
  });
</script>

{#if tab && bookmarks.canBookmark(tab.url)}
  <div class="star" bind:this={root}>
    <button
      class="toggle"
      class:on={!!marked}
      aria-label={marked ? t('Edit bookmark') : t('Bookmark this page')}
      title={marked ? t('Edit bookmark') : t('Bookmark this page')}
      aria-expanded={!!open}
      type="button"
      onclick={() => (open ? done() : show())}
    >
      <Icon name="star" size={16} filled={!!marked} />
    </button>
    {#if open}
      <!-- Not a form: it sits inside the address bar's. -->
      <div
        class="panel"
        bind:this={panel}
        style:transform={nudge ? `translateX(${nudge}px)` : null}
        role="dialog"
        aria-label={t('Bookmark')}
        tabindex="-1"
        onkeydown={(e) => {
          if (e.key === 'Escape' || e.key === 'Enter') {
            e.preventDefault();
            done();
          }
        }}
      >
        <strong>{added ? t('Bookmarked') : t('Edit bookmark')}</strong>
        <label>
          <span>{t('Name')}</span>
          <input bind:this={field} bind:value={name} maxlength="120" />
        </label>
        <p class="url">{open.url}</p>
        <div class="actions">
          <button type="button" class="ghost" onclick={remove}>{t('Remove')}</button>
          <button type="button" class="primary" onclick={done}>{t('Done')}</button>
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .star {
    position: relative;
    flex: none;
  }
  .toggle {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    margin-right: 2px;
    border: 0;
    border-radius: 50%;
    background: none;
    color: var(--muted);
  }
  .toggle:hover {
    background: var(--hover);
    color: var(--text);
  }
  .toggle.on {
    color: #e8a400;
  }
  .panel {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    z-index: 40;
    width: min(300px, calc(100vw - 24px));
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--card);
    box-shadow: 0 16px 40px -16px rgb(0 0 0 / 0.4);
    text-align: left;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12.5px;
    color: var(--muted);
  }
  input {
    height: 34px;
    padding: 0 10px;
    border: 1px solid var(--border);
    border-radius: 9px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 14px;
  }
  .url {
    margin: 0;
    color: var(--muted);
    font-size: 12px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .primary,
  .ghost {
    height: 32px;
    padding: 0 14px;
    border-radius: 9px;
    font: inherit;
    font-size: 13.5px;
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
</style>
