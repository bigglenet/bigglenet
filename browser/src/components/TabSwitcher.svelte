<script lang="ts">
  import { browser } from '../lib/browser.svelte';
  import Icon from './Icon.svelte';

  function pick(id: number) {
    browser.activeId = id;
    browser.switcher = false;
  }

  function newTab() {
    browser.newTab();
    browser.switcher = false;
  }
</script>

<div class="switcher" role="dialog" aria-modal="true" aria-label="Tabs">
  <header>
    <h2>{browser.tabs.length} {browser.tabs.length === 1 ? 'tab' : 'tabs'}</h2>
    <button class="done" onclick={() => (browser.switcher = false)}>Done</button>
  </header>
  <ul>
    {#each browser.tabs as tab (tab.id)}
      <li class:active={tab.id === browser.activeId}>
        <button class="main" onclick={() => pick(tab.id)}>
          {#if tab.icon}
            <img src={tab.icon} alt="" />
          {:else}
            <span class="globe"><Icon name="globe" size={16} /></span>
          {/if}
          <span class="text">
            <span class="title">{tab.title}</span>
            <span class="url">{tab.view.type === 'internal' ? '' : tab.url.replace(/^biggle:\/\//, '')}</span>
          </span>
        </button>
        <button class="close" aria-label="Close {tab.title}" onclick={() => browser.closeTab(tab.id)}>
          <Icon name="close" size={16} />
        </button>
      </li>
    {/each}
  </ul>
  <button class="new" onclick={newTab}><Icon name="plus" size={18} /> New tab</button>
</div>

<style>
  .switcher {
    position: fixed;
    inset: 0;
    z-index: 30;
    display: flex;
    flex-direction: column;
    padding: env(safe-area-inset-top) 0 env(safe-area-inset-bottom);
    background: var(--surface);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
  }
  h2 {
    margin: 0;
    font-size: 17px;
  }
  .done {
    border: 0;
    background: none;
    color: var(--text);
    font: inherit;
    font-weight: 700;
  }
  ul {
    flex: 1;
    overflow: auto;
    margin: 0;
    padding: 0 12px;
    list-style: none;
  }
  li {
    display: flex;
    align-items: center;
    margin-bottom: 8px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--card);
  }
  li.active {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }
  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 4px 12px 14px;
    border: 0;
    background: none;
    color: var(--text);
    font: inherit;
    text-align: left;
  }
  img,
  .globe {
    flex: none;
    width: 20px;
    height: 20px;
    display: grid;
    place-items: center;
    border-radius: 5px;
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
  }
  .url {
    color: var(--muted);
    font-size: 13px;
  }
  .close {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border: 0;
    background: none;
    color: var(--muted);
  }
  .new {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin: 8px 12px 12px;
    height: 46px;
    border: 0;
    border-radius: 14px;
    background: var(--accent);
    color: var(--on-accent);
    font: inherit;
    font-weight: 700;
  }
</style>
