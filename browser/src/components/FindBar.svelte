<script lang="ts">
  // Find in page (⌘F / Ctrl+F): a strip above the page, so it never covers what it finds.
  import { t } from '../lib/i18n.svelte';
  import { browser } from '../lib/browser.svelte';
  import { find } from '../lib/find.svelte';
  import Icon from './Icon.svelte';

  let input = $state<HTMLInputElement>();

  $effect(() => {
    if (find.focus) {
      input?.focus();
      input?.select();
    }
  });

  // Find follows the tab: switching tabs closes it.
  let shownFor = browser.activeId;
  $effect(() => {
    if (browser.activeId !== shownFor) find.close();
  });

  // Search as you type, a moment after the last key.
  let timer: ReturnType<typeof setTimeout>;
  function oninput() {
    clearTimeout(timer);
    timer = setTimeout(() => find.search('first'), 120);
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      find.close();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(timer);
      if (e.shiftKey) find.prev();
      else if (find.result) find.next();
      else find.search('first');
    }
  }

  const status = $derived(
    find.unsupported
      ? t('Can’t search this page')
      : !find.text || !find.result
        ? ''
        : find.result.count === 0
          ? t('No matches')
          : `${find.result.index + 1} of ${find.result.count}${find.result.count >= 1000 ? '+' : ''}`,
  );
</script>

<div class="find" role="search">
  <Icon name="search" size={15} />
  <input
    bind:this={input}
    bind:value={find.text}
    {oninput}
    {onkeydown}
    placeholder={t('Find in page')}
    aria-label={t('Find in page')}
    spellcheck="false"
    autocomplete="off"
    autocapitalize="off"
  />
  <span class="status" class:none={find.result?.count === 0} role="status">{status}</span>
  <button aria-label={t('Previous match')} title={t('Previous (Shift+Enter)')} disabled={!find.result?.count} onclick={() => find.prev()}>
    <Icon name="up" size={16} />
  </button>
  <button aria-label={t('Next match')} title={t('Next (Enter)')} disabled={!find.result?.count} onclick={() => find.next()}>
    <Icon name="down" size={16} />
  </button>
  <button aria-label={t('Close find')} title={t('Close (Esc)')} onclick={() => find.close()}>
    <Icon name="close" size={16} />
  </button>
</div>

<style>
  .find {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 40px;
    padding: 0 8px 0 14px;
    background: var(--toolbar);
    border-bottom: 1px solid var(--border);
    color: var(--muted);
  }
  input {
    flex: 0 1 320px;
    min-width: 80px;
    height: 28px;
    padding: 0 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    outline: 0;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 14px;
  }
  input:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .status {
    flex: 1;
    min-width: 0;
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .status.none {
    color: var(--danger);
  }
  button {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border: 0;
    border-radius: 8px;
    background: none;
    color: var(--text);
  }
  button:hover:not(:disabled) {
    background: var(--hover);
  }
  button:disabled {
    color: var(--faint);
  }
</style>
