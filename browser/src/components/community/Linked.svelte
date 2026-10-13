<script lang="ts">
  // Text with its biggle:// and web addresses as links (posts, descriptions).
  import { browser } from '../../lib/browser.svelte';
  import { linkify, type Part } from '../../lib/chatformat';

  let { text }: { text: string } = $props();

  const parts = $derived(linkify(text));

  function open(link: NonNullable<Part['link']>) {
    if (link.kind === 'external') browser.external = link.href;
    else browser.newTab(link.href, { after: browser.activeId });
  }
</script>

<span class="body-text">{#each parts as part, i (i)}{#if part.link}<button class="inline-link" onclick={() => open(part.link!)}>{part.text}</button>{:else}{part.text}{/if}{/each}</span>

<style>
  .inline-link {
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;
    overflow-wrap: anywhere;
  }
</style>
