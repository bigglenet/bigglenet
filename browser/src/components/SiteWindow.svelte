<script lang="ts">
  // A direct site that has to be a top-level page (a game that needs cross-origin isolation, or a
  // site that won't be shown inside other apps), outside the desktop app: it opens in a normal
  // browser tab. (The desktop app shows it in the tab instead, see SiteView.svelte.)
  import { untrack } from 'svelte';
  import { browser, type Tab } from '../lib/browser.svelte';
  import Icon from './Icon.svelte';

  let { tab, view }: { tab: Tab; view: { url: string } } = $props();

  $effect(() => {
    void view;
    untrack(() => browser.frameLoaded(tab));
  });

  const host = $derived.by(() => {
    try {
      return new URL(view.url).host;
    } catch {
      return view.url;
    }
  });
</script>

<div class="card-wrap">
  <div class="card">
    <span class="badge"><Icon name="external" size={22} /></span>
    <h1>{tab.title}</h1>
    <p class="muted">It runs on its own, straight from {host}, so it opens in a new browser tab.</p>
    <div class="actions"><button class="primary" onclick={() => window.open(view.url, '_blank', 'noopener')}>Open it</button></div>
  </div>
</div>

<style>
  .card-wrap {
    display: grid;
    place-items: center;
    height: 100%;
    padding: 24px;
    background: var(--surface);
  }
  .card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    max-width: 460px;
    text-align: center;
  }
  .badge {
    display: grid;
    place-items: center;
    width: 56px;
    height: 56px;
    border-radius: 16px;
    background: var(--field);
    color: var(--text);
  }
  h1 {
    margin: 6px 0 0;
    font-size: 22px;
    letter-spacing: -0.01em;
    overflow-wrap: anywhere;
  }
  p {
    margin: 0;
    line-height: 1.45;
  }
  .muted {
    color: var(--muted);
  }
  .actions {
    display: flex;
    gap: 8px;
    margin: 8px 0 4px;
  }
  button {
    font: inherit;
    cursor: pointer;
  }
  .primary {
    height: 38px;
    padding: 0 16px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
  }
  .primary {
    border: 0;
    background: var(--accent);
    color: var(--on-accent);
  }
</style>
