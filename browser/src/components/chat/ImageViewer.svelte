<script lang="ts">
  // A picture from a chat, as big as the window.
  import { SERVER } from '../../lib/config';
  import type { Attachment } from '../../lib/chats.svelte';
  import { t } from '../../lib/i18n.svelte';
  import { overlays } from '../../lib/overlays.svelte';
  import { downloads } from '../../lib/downloads.svelte';
  import Icon from '../Icon.svelte';

  let { a, onclose }: { a: Attachment; onclose: () => void } = $props();
  const url = $derived(a.url.startsWith('/') ? SERVER + a.url : a.url);

  $effect(() => overlays.hold());
  $effect(() => {
    const onkeydown = (e: KeyboardEvent) => e.key === 'Escape' && onclose();
    addEventListener('keydown', onkeydown);
    return () => removeEventListener('keydown', onkeydown);
  });
</script>

<div class="viewer" role="dialog" aria-label={a.name} tabindex="-1">
  <button class="backdrop" aria-label={t('Close')} onclick={onclose}></button>
  <img src={url} alt={a.name} />
  <div class="bar">
    <span>{a.name}</span>
    <button onclick={() => downloads.get(`${url}&name=${encodeURIComponent(a.name)}`)} title={t('Download')}><Icon name="download" size={17} /></button>
    <button onclick={onclose} title={t('Close')}><Icon name="close" size={17} /></button>
  </div>
</div>

<style>
  .viewer {
    position: fixed;
    inset: 0;
    z-index: 80;
    display: grid;
    place-items: center;
    padding: 56px 20px 20px;
  }
  .backdrop {
    position: absolute;
    inset: 0;
    border: 0;
    background: rgb(0 0 0 / 0.85);
    cursor: zoom-out;
  }
  img {
    position: relative;
    max-width: 100%;
    max-height: 100%;
    border-radius: 8px;
    object-fit: contain;
  }
  .bar {
    position: absolute;
    top: 10px;
    right: 12px;
    left: 16px;
    display: flex;
    align-items: center;
    gap: 6px;
    color: #f6f4f0;
    font-size: 13.5px;
  }
  .bar span {
    flex: 1;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .bar button {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border: 0;
    border-radius: 50%;
    background: rgb(255 255 255 / 0.12);
    color: inherit;
    cursor: pointer;
  }
</style>
