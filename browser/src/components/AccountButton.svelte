<script lang="ts">
  import { account } from '../lib/account.svelte';
  import { browser } from '../lib/browser.svelte';
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';

  let open = $state(false);
  let root = $state<HTMLElement>();

  $effect(() => {
    if (!open) return;
    const onpointerdown = (e: PointerEvent) => {
      if (!root?.contains(e.target as Node)) open = false;
    };
    const onkeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') open = false;
    };
    document.addEventListener('pointerdown', onpointerdown);
    document.addEventListener('keydown', onkeydown);
    return () => {
      document.removeEventListener('pointerdown', onpointerdown);
      document.removeEventListener('keydown', onkeydown);
    };
  });

  function openAdmin() {
    open = false;
    const tab = browser.active;
    if (tab) browser.go(tab, 'biggle://admin');
  }

  function signOut() {
    open = false;
    account.signOut();
  }
</script>

<div class="account" bind:this={root}>
  {#if account.user}
    <button
      class="me"
      aria-label="Account: {account.user.username}"
      aria-haspopup="menu"
      aria-expanded={open}
      onclick={() => (open = !open)}
    >
      <Avatar name={account.user.username} size={28} />
    </button>
    {#if open}
      <div class="menu" role="menu">
        <div class="who">
          <Avatar name={account.user.username} size={36} />
          <div>
            <strong>{account.user.username}</strong>
            <span>{account.user.admin ? 'Admin' : 'Biggle ID'}</span>
          </div>
        </div>
        {#if account.user.admin}
          <button role="menuitem" onclick={openAdmin}><Icon name="settings" size={16} /> Admin</button>
        {/if}
        <button role="menuitem" onclick={signOut}><Icon name="logout" size={16} /> Sign out</button>
      </div>
    {/if}
  {:else}
    <button class="signin" onclick={() => (account.dialog = 'signin')}>Sign in</button>
  {/if}
</div>

<style>
  .account {
    position: relative;
    flex: none;
  }
  .me {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: none;
  }
  .me:hover {
    background: var(--hover);
  }
  .signin {
    height: 32px;
    padding: 0 14px;
    border: 0;
    border-radius: 16px;
    background: var(--accent);
    color: var(--on-accent);
    font: inherit;
    font-size: 13.5px;
    font-weight: 600;
    white-space: nowrap;
  }

  .menu {
    position: absolute;
    right: 0;
    top: calc(100% + 8px);
    z-index: 20;
    min-width: 220px;
    padding: 6px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--card);
    box-shadow: 0 16px 40px -16px rgb(0 0 0 / 0.4);
  }
  .who {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 8px 12px;
    margin-bottom: 4px;
    border-bottom: 1px solid var(--border);
  }
  .who div {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .who span {
    color: var(--muted);
    font-size: 13px;
  }
  .menu button {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 10px;
    border: 0;
    border-radius: 8px;
    background: none;
    color: var(--text);
    font: inherit;
    font-size: 14px;
    text-align: left;
  }
  .menu button:hover {
    background: var(--hover);
  }
</style>
