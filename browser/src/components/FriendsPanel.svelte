<script lang="ts">
  import { account } from '../lib/account.svelte';
  import { errorText } from '../lib/api';
  import { social } from '../lib/social.svelte';
  import Avatar from './Avatar.svelte';
  import Chat from './Chat.svelte';
  import Icon from './Icon.svelte';

  let add = $state('');
  let error = $state('');
  let busy = $state(false);

  async function act(fn: () => Promise<unknown>) {
    busy = true;
    error = '';
    try {
      await fn();
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  }

  function submitAdd(e: SubmitEvent) {
    e.preventDefault();
    const name = add.trim();
    if (!name) return;
    act(async () => {
      await social.addFriend(name);
      add = '';
    });
  }
</script>

<aside class="panel" aria-label="Friends">
  {#if social.chatWith}
    <Chat />
  {:else}
    <header>
      <h2>Friends</h2>
      <button class="icon" aria-label="Close friends" onclick={() => (social.open = false)}>
        <Icon name="close" size={17} />
      </button>
    </header>

    {#if !account.user}
      <div class="empty">
        <p>Sign in to add friends and chat with them.</p>
        <button class="primary" onclick={() => (account.dialog = 'signin')}>Sign in</button>
      </div>
    {:else}
      <form class="add" onsubmit={submitAdd}>
        <input
          bind:value={add}
          placeholder="Add a friend by username"
          aria-label="Friend's username"
          autocapitalize="off"
          spellcheck="false"
        />
        <button class="icon solid" aria-label="Send friend request" disabled={busy || !add.trim()}>
          <Icon name="userPlus" size={17} />
        </button>
      </form>
      {#if error}
        <p class="error" role="alert">{error}</p>
      {/if}

      <div class="scroll">
        {#if social.incoming.length}
          <h3>Friend requests</h3>
          {#each social.incoming as name (name)}
            <div class="row">
              <Avatar {name} />
              <span class="name">{name}</span>
              <button class="small primary" disabled={busy} onclick={() => act(() => social.accept(name))}>Accept</button>
              <button class="small" disabled={busy} onclick={() => act(() => social.remove(name))}>Decline</button>
            </div>
          {/each}
        {/if}

        {#if social.outgoing.length}
          <h3>Waiting for them</h3>
          {#each social.outgoing as name (name)}
            <div class="row">
              <Avatar {name} />
              <span class="name">{name}</span>
              <button class="small" disabled={busy} onclick={() => act(() => social.remove(name))}>Cancel</button>
            </div>
          {/each}
        {/if}

        <h3>Friends</h3>
        {#each social.friends as friend (friend.username)}
          <button class="row friend" onclick={() => social.openChat(friend.username)}>
            <Avatar name={friend.username} online={friend.online} />
            <span class="name">{friend.username}</span>
            {#if friend.unread}
              <span class="badge" aria-label="{friend.unread} unread">{friend.unread}</span>
            {/if}
          </button>
        {:else}
          <p class="muted">No friends yet. Add someone by their username.</p>
        {/each}
      </div>

      {#if !social.connected}
        <p class="status">Connecting…</p>
      {/if}
    {/if}
  {/if}
</aside>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    width: 340px;
    height: 100%;
    min-height: 0;
    border-left: 1px solid var(--border);
    background: var(--surface);
  }
  @media (max-width: 699px) {
    .panel {
      position: fixed;
      inset: 0;
      z-index: 30;
      width: auto;
      border: 0;
      padding-top: env(safe-area-inset-top);
      padding-bottom: env(safe-area-inset-bottom);
    }
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 12px 10px 18px;
  }
  h2 {
    margin: 0;
    font-size: 17px;
  }
  h3 {
    margin: 18px 6px 6px;
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .icon {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    flex: none;
    border: 0;
    border-radius: 9px;
    background: none;
    color: var(--text);
  }
  .icon:hover:not(:disabled) {
    background: var(--hover);
  }
  .icon.solid {
    background: var(--accent);
    color: var(--on-accent);
  }
  .icon.solid:disabled {
    opacity: 0.35;
  }

  .add {
    display: flex;
    gap: 6px;
    margin: 0 12px;
  }
  .add input {
    flex: 1;
    min-width: 0;
    height: 34px;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: 9px;
    background: var(--card);
    color: var(--text);
    font: inherit;
    font-size: 14px;
  }
  .add input:focus {
    outline: 0;
    border-color: var(--accent);
  }

  .error {
    margin: 8px 14px 0;
    color: var(--danger);
    font-size: 13.5px;
  }

  .scroll {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 0 8px 12px;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px;
    border: 0;
    border-radius: 10px;
    background: none;
    color: var(--text);
    font: inherit;
    text-align: left;
  }
  .friend:hover {
    background: var(--hover);
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
  }
  .badge {
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    border-radius: 10px;
    background: var(--accent);
    color: var(--on-accent);
    font-size: 12px;
    font-weight: 700;
    line-height: 20px;
    text-align: center;
  }

  .small {
    padding: 5px 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--card);
    color: var(--text);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
  }
  .primary {
    border: 1px solid var(--accent);
    background: var(--accent);
    color: var(--on-accent);
  }

  .muted {
    margin: 6px;
    color: var(--muted);
    font-size: 14px;
  }
  .empty {
    padding: 24px 18px;
    color: var(--muted);
  }
  .empty .primary {
    padding: 9px 16px;
    border-radius: 10px;
    font: inherit;
    font-weight: 600;
  }
  .status {
    margin: 0;
    padding: 8px 18px;
    border-top: 1px solid var(--border);
    color: var(--muted);
    font-size: 12.5px;
  }
</style>
