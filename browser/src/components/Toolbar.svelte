<script lang="ts">
  import { browser } from '../lib/browser.svelte';
  import { social } from '../lib/social.svelte';
  import { parse } from '../lib/url';
  import AccountButton from './AccountButton.svelte';
  import Icon from './Icon.svelte';

  const tab = $derived(browser.active);
  const site = $derived.by(() => {
    const u = tab && parse(tab.url);
    return u?.kind === 'site' ? u : null;
  });

  let input = $state<HTMLInputElement>();
  let editing = $state(false);
  let value = $state('');

  // Show the tab's address unless the user is typing.
  $effect(() => {
    const url = tab?.view.type === 'internal' && tab.view.page === 'start' ? '' : (tab?.url ?? '');
    if (!editing) value = url;
  });

  $effect(() => {
    if (browser.addressFocus) {
      input?.focus();
      input?.select();
    }
  });

  function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!tab || !value.trim()) return;
    browser.open(tab, value);
    input?.blur();
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      editing = false;
      value = tab?.view.type === 'internal' && tab.view.page === 'start' ? '' : (tab?.url ?? '');
      input?.blur();
    }
  }
</script>

<div class="toolbar">
  <div class="nav">
    <button
      aria-label="Back"
      title="Back"
      disabled={!tab || tab.index <= 0}
      onclick={() => tab && browser.back(tab)}
    >
      <Icon name="back" />
    </button>
    <button
      class="wide-only"
      aria-label="Forward"
      title="Forward"
      disabled={!tab || tab.index >= tab.history.length - 1}
      onclick={() => tab && browser.forward(tab)}
    >
      <Icon name="forward" />
    </button>
    {#if tab?.loading}
      <button class="wide-only" aria-label="Stop" title="Stop" onclick={() => tab && browser.stop(tab)}>
        <Icon name="close" />
      </button>
    {:else}
      <button
        class="wide-only"
        aria-label="Reload"
        title="Reload"
        disabled={!site}
        onclick={() => tab && browser.reload(tab)}
      >
        <Icon name="reload" size={17} />
      </button>
    {/if}
  </div>

  <form class="address" class:editing onsubmit={submit}>
    <span class="badge" title="Ads and trackers are blocked on every Biggle site">
      <Icon name="shield" size={15} />
    </span>
    <div class="field">
      <input
        bind:this={input}
        bind:value
        onfocus={() => {
          editing = true;
          input?.select();
        }}
        onblur={() => (editing = false)}
        {onkeydown}
        placeholder="Type a .biggle address"
        aria-label="Address"
        spellcheck="false"
        autocomplete="off"
        autocapitalize="off"
      />
      {#if site && !editing}
        <div class="pretty" aria-hidden="true">
          <span class="host">{site.name}.biggle</span><span class="rest"
            >{site.path === '/' ? '' : site.path}{site.search}{site.hash}</span
          >
        </div>
      {/if}
    </div>
    {#if tab?.preview && site}
      <span class="preview" title="This site is waiting for approval. Only its owner and admins can see it.">Preview</span>
    {/if}
  </form>

  <div class="side">
    <button
      class="tabs-button narrow-only"
      aria-label="{browser.tabs.length} {browser.tabs.length === 1 ? 'tab' : 'tabs'}"
      title="Tabs"
      onclick={() => (browser.switcher = true)}
    >
      {browser.tabs.length}
    </button>
    <button
      class="friends"
      class:on={social.open}
      aria-label={social.unread ? `Friends, ${social.unread} new` : 'Friends'}
      title="Friends"
      aria-pressed={social.open}
      onclick={() => (social.open = !social.open)}
    >
      <Icon name="users" />
      {#if social.unread}
        <span class="count">{social.unread > 9 ? '9+' : social.unread}</span>
      {/if}
    </button>
    <AccountButton />
  </div>
</div>

<style>
  .toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 46px;
    padding: 0 10px;
    background: var(--toolbar);
    border-bottom: 1px solid var(--border);
  }

  .nav {
    display: flex;
    gap: 2px;
  }
  .nav button {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: 8px;
    background: none;
    color: var(--text);
  }
  .nav button:hover:not(:disabled) {
    background: var(--hover);
  }
  .nav button:disabled {
    color: var(--faint);
  }

  .side {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .friends,
  .tabs-button {
    position: relative;
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border: 0;
    border-radius: 8px;
    background: none;
    color: var(--text);
  }
  .friends:hover,
  .friends.on {
    background: var(--hover);
  }
  .tabs-button {
    font: inherit;
    font-size: 12px;
    font-weight: 700;
  }
  .tabs-button::before {
    content: '';
    position: absolute;
    inset: 8px;
    border: 2px solid currentColor;
    border-radius: 6px;
  }
  .count {
    position: absolute;
    top: 2px;
    right: 1px;
    min-width: 17px;
    height: 17px;
    padding: 0 4px;
    border-radius: 9px;
    background: var(--danger);
    color: #fff;
    font-size: 10.5px;
    font-weight: 700;
    line-height: 17px;
    box-shadow: 0 0 0 2px var(--toolbar);
  }

  .narrow-only {
    display: none !important;
  }
  @media (max-width: 699px) {
    .wide-only {
      display: none !important;
    }
    .narrow-only {
      display: grid !important;
    }
    .toolbar {
      gap: 4px;
      padding: 0 6px;
    }
  }

  .address {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    height: 34px;
    border-radius: 17px;
    background: var(--field);
    border: 1px solid transparent;
    transition:
      background 0.15s,
      border-color 0.15s,
      box-shadow 0.15s;
  }
  .address:hover {
    background: var(--field-hover);
  }
  .address.editing {
    background: var(--surface);
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }

  .badge {
    display: grid;
    place-items: center;
    width: 34px;
    height: 100%;
    color: var(--accent);
    flex: none;
  }

  .field {
    position: relative;
    flex: 1;
    min-width: 0;
    height: 100%;
  }
  input {
    width: 100%;
    height: 100%;
    padding: 0 14px 0 0;
    border: 0;
    outline: 0;
    background: none;
    color: var(--text);
    font: inherit;
    font-size: 14px;
  }
  .address:not(.editing) .field:has(.pretty) input {
    color: transparent;
  }
  input::placeholder {
    color: var(--muted);
  }

  .preview {
    flex: none;
    margin-right: 6px;
    padding: 3px 9px;
    border-radius: 10px;
    background: var(--accent);
    color: var(--on-accent);
    font-size: 11.5px;
    font-weight: 700;
  }

  .pretty {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    padding-right: 14px;
    font-size: 14px;
    white-space: nowrap;
    overflow: hidden;
    pointer-events: none;
  }
  .host {
    color: var(--text);
    font-weight: 500;
  }
  .rest {
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
