<script lang="ts">
  import { browser } from '../lib/browser.svelte';
  import { ownWindowButtons } from '../lib/platform';
  import Icon from './Icon.svelte';
  import WindowControls from './WindowControls.svelte';

  function newTab() {
    browser.newTab();
    browser.focusAddress();
  }
</script>

<div class="tabbar" role="tablist" aria-label="Tabs" data-tauri-drag-region>
  {#each browser.tabs as tab (tab.id)}
    <div
      class="tab"
      class:active={tab.id === browser.activeId}
      onauxclick={(e) => e.button === 1 && browser.closeTab(tab.id)}
    >
      <button
        class="tab-main"
        role="tab"
        aria-selected={tab.id === browser.activeId}
        title={tab.title}
        onclick={() => (browser.activeId = tab.id)}
      >
        <span class="tab-icon">
          {#if tab.loading}
            <span class="spinner"></span>
          {:else if tab.icon}
            <img src={tab.icon} alt="" />
          {:else}
            <Icon name="globe" size={14} />
          {/if}
        </span>
        <span class="tab-title">{tab.title}</span>
      </button>
      <button class="tab-close" aria-label="Close {tab.title}" onclick={() => browser.closeTab(tab.id)}>
        <Icon name="close" size={13} />
      </button>
    </div>
  {/each}
  <button class="new-tab" aria-label="New tab" title="New tab" onclick={newTab}>
    <Icon name="plus" size={16} />
  </button>
  {#if ownWindowButtons}
    <WindowControls />
  {/if}
</div>

<style>
  .tabbar {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    padding: 6px 8px 0;
    background: var(--chrome);
    min-width: 0;
  }
  /* Desktop app on macOS: leave room for the window buttons. */
  :global([data-titlebar='overlay']) .tabbar {
    padding-left: 88px;
    padding-top: 8px;
  }
  /* Desktop app on Windows and Linux: the window buttons go at the far right, full height. */
  :global([data-titlebar='custom']) .tabbar {
    height: 40px;
    padding: 0 0 0 8px;
  }
  /* On phones the tabs live in the tab switcher instead. In the desktop app this bar is also
     the title bar, so it stays. */
  @media (max-width: 699px) {
    :global(html:not([data-titlebar])) .tabbar {
      display: none;
    }
  }

  .tab {
    position: relative;
    flex: 0 1 220px;
    min-width: 44px;
    display: flex;
    align-items: center;
    height: 34px;
    border-radius: 10px 10px 0 0;
    color: var(--muted);
  }
  .tab:hover:not(.active) {
    background: var(--hover);
  }
  .tab.active {
    background: var(--toolbar);
    color: var(--text);
  }

  .tab-main {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    height: 100%;
    padding: 0 4px 0 12px;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    font-size: 12.5px;
    text-align: left;
    cursor: default;
  }

  .tab-icon {
    flex: none;
    display: grid;
    place-items: center;
    width: 16px;
    height: 16px;
  }
  .tab-icon img {
    width: 16px;
    height: 16px;
    border-radius: 4px;
  }

  .tab-title {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .tab-close {
    flex: none;
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    margin-right: 6px;
    border: 0;
    border-radius: 6px;
    background: none;
    color: inherit;
    opacity: 0;
  }
  .tab:hover .tab-close,
  .tab.active .tab-close,
  .tab-close:focus-visible {
    opacity: 1;
  }
  .tab-close:hover {
    background: var(--hover);
  }
  .tab:not(.active):has(+ .tab:not(.active))::after {
    content: '';
    position: absolute;
    right: -1px;
    top: 9px;
    bottom: 9px;
    width: 1px;
    background: var(--border);
  }

  .new-tab {
    flex: none;
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    margin: 0 0 2px 4px;
    border: 0;
    border-radius: 8px;
    background: none;
    color: var(--muted);
  }
  .new-tab:hover {
    background: var(--hover);
    color: var(--text);
  }

  .spinner {
    width: 13px;
    height: 13px;
    border: 2px solid var(--accent-soft);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
