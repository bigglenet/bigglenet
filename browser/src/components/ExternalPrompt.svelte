<script lang="ts">
  import { browser } from '../lib/browser.svelte';
  import { openExternal } from '../lib/platform';
  import Icon from './Icon.svelte';

  let { url }: { url: string } = $props();

  let dialog = $state<HTMLDialogElement>();

  $effect(() => {
    dialog?.showModal();
  });

  function open() {
    openExternal(url);
    browser.external = null;
  }
</script>

<dialog bind:this={dialog} onclose={() => (browser.external = null)} aria-labelledby="external-title">
  <div class="icon"><Icon name="external" size={22} /></div>
  <h2 id="external-title">Leave the Bigglenet?</h2>
  <p>This link goes to the normal web. It'll open in your regular browser, where ads and trackers aren't blocked.</p>
  <p class="url">{url}</p>
  <form method="dialog" class="actions">
    <button value="cancel">Cancel</button>
    <button type="button" class="primary" onclick={open}>Open</button>
  </form>
</dialog>

<style>
  dialog {
    width: min(420px, calc(100vw - 32px));
    padding: 24px;
    border: 1px solid var(--border);
    border-radius: 18px;
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 24px 60px -20px rgb(0 0 0 / 0.45);
  }
  dialog::backdrop {
    background: rgb(10 8 20 / 0.35);
    backdrop-filter: blur(2px);
  }
  .icon {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: var(--accent-soft);
    color: var(--accent);
    margin-bottom: 14px;
  }
  h2 {
    margin: 0 0 6px;
    font-size: 18px;
  }
  p {
    margin: 0 0 12px;
    color: var(--muted);
    line-height: 1.5;
    font-size: 14px;
  }
  .url {
    padding: 8px 10px;
    border-radius: 8px;
    background: var(--field);
    color: var(--text);
    font-family: ui-monospace, Menlo, monospace;
    font-size: 12.5px;
    overflow-wrap: anywhere;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 18px;
  }
  button {
    padding: 9px 16px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-weight: 500;
  }
  .primary {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--on-accent);
  }
</style>
