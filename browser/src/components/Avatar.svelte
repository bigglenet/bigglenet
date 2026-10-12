<script lang="ts">
  // Someone's profile picture, or the first letter of their name when they have none.
  // `user` is whose picture to show (a username); `name` is what's shown otherwise (a nickname).
  import { people } from '../lib/people.svelte';

  let { name, user, size = 32, online }: { name: string; user?: string | null; size?: number; online?: boolean } = $props();

  const src = $derived(user ? people.avatarUrl(user) : null);
  let failed = $state<string | null>(null);
</script>

<span class="avatar" style:--size="{size}px" aria-hidden="true">
  {name[0]?.toUpperCase()}
  {#if src && failed !== src}
    <img {src} alt="" loading="lazy" decoding="async" onerror={() => (failed = src)} />
  {/if}
  {#if online !== undefined}
    <span class="dot" class:online></span>
  {/if}
</span>

<style>
  .avatar {
    position: relative;
    flex: none;
    display: inline-grid;
    place-items: center;
    width: var(--size);
    height: var(--size);
    border-radius: 50%;
    background: var(--accent);
    color: var(--on-accent);
    font-size: calc(var(--size) * 0.44);
    font-weight: 700;
    line-height: 1;
  }
  img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
    background: var(--accent);
  }
  .dot {
    position: absolute;
    right: -1px;
    bottom: -1px;
    width: calc(var(--size) * 0.32);
    height: calc(var(--size) * 0.32);
    min-width: 8px;
    min-height: 8px;
    border-radius: 50%;
    background: var(--faint);
    box-shadow: 0 0 0 2px var(--surface);
  }
  .dot.online {
    background: var(--online);
  }
</style>
