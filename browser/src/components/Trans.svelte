<script lang="ts">
  // One translated sentence with parts that aren't plain text, so each language can put them
  // where its sentence needs them:
  //   <Trans text={t('This is the start of {name}.')}>{#snippet name()}<strong>{title}</strong>{/snippet}</Trans>
  // A part can be a snippet or plain text (a string or number).
  import type { Snippet } from 'svelte';

  let { text, ...parts }: { text: string } & Record<string, Snippet | string | number | null | undefined> = $props();

  const pieces = $derived(text.split(/(\{\w+\})/).filter(Boolean));
  const partFor = (piece: string) => (/^\{\w+\}$/.test(piece) ? parts[piece.slice(1, -1)] : undefined);
</script>

{#each pieces as piece, i (i)}{@const part = partFor(piece)}{#if typeof part === 'function'}{@render part()}{:else if part !== undefined && part !== null}{part}{:else}{piece}{/if}{/each}
