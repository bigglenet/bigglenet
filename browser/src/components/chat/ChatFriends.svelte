<script lang="ts">
  // Friends: add people, answer requests, and give friends nicknames only you see.
  import { errorText } from '../../lib/api';
  import { social } from '../../lib/social.svelte';
  import Avatar from '../Avatar.svelte';
  import Icon from '../Icon.svelte';

  let { onback, onmessage }: { onback: () => void; onmessage: (username: string) => void } = $props();

  let name = $state('');
  let error = $state('');
  let note = $state('');
  let busy = $state(false);
  let renaming = $state<string | null>(null);
  let nickname = $state('');
  let removing = $state<string | null>(null);

  const friends = $derived(
    [...social.friends].sort((a, b) => Number(b.online) - Number(a.online) || (a.nickname || a.username).localeCompare(b.nickname || b.username)),
  );

  async function act(fn: () => Promise<unknown>) {
    error = '';
    try {
      await fn();
    } catch (e) {
      error = errorText(e);
    }
  }

  async function add(e: SubmitEvent) {
    e.preventDefault();
    const username = name.trim().replace(/^@/, '').toLowerCase();
    if (!username) return;
    busy = true;
    note = '';
    await act(async () => {
      await social.addFriend(username);
      name = '';
      note = social.friends.some((f) => f.username === username) ? `You and ${username} are friends now.` : `Friend request sent to ${username}.`;
    });
    busy = false;
  }

  function rename(username: string) {
    renaming = username;
    nickname = social.friends.find((f) => f.username === username)?.nickname ?? '';
  }

  async function saveNickname(e: SubmitEvent) {
    e.preventDefault();
    const username = renaming;
    if (!username) return;
    await act(async () => {
      await social.setNickname(username, nickname);
      renaming = null;
    });
  }
</script>

<header class="bar">
  <button class="icon" aria-label="Back" onclick={onback}><Icon name="back" /></button>
  <h2>Friends</h2>
</header>

<div class="scroll body">
  <form class="add" onsubmit={add}>
    <input class="field" bind:value={name} placeholder="Add a friend by username" aria-label="Username to add" autocapitalize="off" spellcheck="false" />
    <button class="icon solid" aria-label="Send friend request" disabled={busy || !name.trim()}><Icon name="userPlus" size={17} /></button>
  </form>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if note}<p class="note">{note}</p>{/if}

  {#if social.incoming.length}
    <p class="label">Requests</p>
    {#each social.incoming as u (u)}
      <div class="person">
        <Avatar name={u} size={36} />
        <span class="names"><strong>{u}</strong><span>wants to be friends</span></span>
        <button class="btn small primary" onclick={() => act(() => social.accept(u))}>Accept</button>
        <button class="btn small" onclick={() => act(() => social.remove(u))}>Decline</button>
      </div>
    {/each}
  {/if}

  {#if social.outgoing.length}
    <p class="label">Sent</p>
    {#each social.outgoing as u (u)}
      <div class="person">
        <Avatar name={u} size={36} />
        <span class="names"><strong>{u}</strong><span>Waiting for them to accept</span></span>
        <button class="btn small" onclick={() => act(() => social.remove(u))}>Cancel</button>
      </div>
    {/each}
  {/if}

  <p class="label">Friends{friends.length ? ` · ${friends.length}` : ''}</p>
  {#each friends as f (f.username)}
    {#if renaming === f.username}
      <form class="person rename" onsubmit={saveNickname}>
        <Avatar name={nickname.trim() || f.username} size={36} />
        <!-- svelte-ignore a11y_autofocus -->
        <input class="field" bind:value={nickname} maxlength="30" placeholder={f.username} aria-label="Nickname for {f.username}" autofocus />
        <button class="btn small primary">Save</button>
        <button type="button" class="btn small" onclick={() => (renaming = null)}>Cancel</button>
      </form>
    {:else if removing === f.username}
      <div class="person">
        <Avatar name={f.nickname || f.username} size={36} />
        <span class="names"><strong>Unfriend {f.nickname || f.username}?</strong><span>You won't be able to message each other.</span></span>
        <button class="btn small danger" onclick={() => act(async () => { await social.remove(f.username); removing = null; })}>Unfriend</button>
        <button class="btn small" onclick={() => (removing = null)}>Keep</button>
      </div>
    {:else}
      <div class="person friend">
        <Avatar name={f.nickname || f.username} size={36} online={f.online} />
        <span class="names">
          <strong>{f.nickname || f.username}</strong>
          <span>{f.nickname ? `@${f.username} · ` : ''}{f.online ? 'Online' : 'Offline'}</span>
        </span>
        <button class="icon" aria-label="Message {f.username}" title="Message" onclick={() => onmessage(f.username)}><Icon name="chat" size={16} /></button>
        <button class="icon" aria-label="Nickname for {f.username}" title="Nickname" onclick={() => rename(f.username)}><Icon name="edit" size={16} /></button>
        <button class="icon" aria-label="Unfriend {f.username}" title="Unfriend" onclick={() => (removing = f.username)}><Icon name="trash" size={16} /></button>
      </div>
    {/if}
  {:else}
    <p class="muted empty">{social.friendsLoaded ? 'No friends yet. Add someone by their username.' : 'Loading…'}</p>
  {/each}
</div>

<style>
  .body {
    padding: 12px 10px 16px;
  }
  .add {
    display: flex;
    gap: 6px;
  }
  .note {
    margin: 8px 2px 0;
    color: var(--muted);
    font-size: 13.5px;
  }
  .friend .icon {
    width: 30px;
    height: 30px;
    color: var(--muted);
  }
  .friend .icon:hover {
    color: var(--text);
  }
  .friend:hover {
    background: var(--hover);
  }
  .rename .field {
    flex: 1;
    height: 32px;
  }
  .empty {
    margin: 6px 4px;
    font-size: 13.5px;
  }
</style>
