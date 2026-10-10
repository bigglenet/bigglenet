<script lang="ts">
  // Tick friends to put in a group.
  import { social } from '../../lib/social.svelte';
  import Avatar from '../Avatar.svelte';
  import Icon from '../Icon.svelte';

  let { picked = $bindable([]), exclude = [] }: { picked: string[]; exclude?: string[] } = $props();

  let query = $state('');
  const q = $derived(query.trim().toLowerCase());
  const friends = $derived(
    social.friends
      .filter((f) => !exclude.includes(f.username))
      .filter((f) => !q || f.username.includes(q) || (f.nickname ?? '').toLowerCase().includes(q))
      .sort((a, b) => (a.nickname || a.username).localeCompare(b.nickname || b.username)),
  );

  function toggle(username: string) {
    picked = picked.includes(username) ? picked.filter((u) => u !== username) : [...picked, username];
  }
</script>

{#if social.friends.filter((f) => !exclude.includes(f.username)).length > 6}
  <input class="field filter" bind:value={query} placeholder="Find a friend" aria-label="Find a friend" />
{/if}
<div class="people" role="group" aria-label="Friends">
  {#each friends as f (f.username)}
    {@const on = picked.includes(f.username)}
    <button class="person" class:on role="checkbox" aria-checked={on} onclick={() => toggle(f.username)}>
      <Avatar name={f.nickname || f.username} size={34} online={f.online} />
      <span class="names">
        <strong>{f.nickname || f.username}</strong>
        {#if f.nickname}<span>@{f.username}</span>{/if}
      </span>
      <span class="tick" class:on>{#if on}<Icon name="check" size={14} />{/if}</span>
    </button>
  {:else}
    <p class="muted none">{social.friends.length ? 'No friends left to add.' : 'Add some friends first.'}</p>
  {/each}
</div>

<style>
  .filter {
    margin-bottom: 6px;
  }
  .person:hover {
    background: var(--hover);
  }
  .tick {
    display: grid;
    place-items: center;
    flex: none;
    width: 22px;
    height: 22px;
    border: 2px solid var(--faint);
    border-radius: 7px;
  }
  .tick.on {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--on-accent);
  }
  .none {
    margin: 10px 4px;
    font-size: 13.5px;
  }
</style>
