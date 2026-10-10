<script lang="ts">
  // About a chat: a friend's nickname, or a group's name and people.
  import { untrack } from 'svelte';
  import { account } from '../../lib/account.svelte';
  import { errorText } from '../../lib/api';
  import { calls } from '../../lib/calls.svelte';
  import { chats, type Chat } from '../../lib/chats.svelte';
  import { social } from '../../lib/social.svelte';
  import Avatar from '../Avatar.svelte';
  import Icon from '../Icon.svelte';
  import ChatPeoplePicker from './ChatPeoplePicker.svelte';

  let { chat, onclose, onleft }: { chat: Chat; onclose: () => void; onleft: () => void } = $props();

  const me = $derived(account.user?.username);
  const other = $derived(chat.kind === 'direct' ? chats.other(chat) : null);
  const friend = $derived(other ? social.friends.find((f) => f.username === other) : undefined);
  const title = $derived(chats.title(chat));

  let error = $state('');
  let saved = $state('');
  let name = $state('');
  let nickname = $state('');
  let adding = $state(false);
  let picked = $state<string[]>([]);
  let confirming = $state(false);

  // Start the boxes from what's saved, again whenever the chat changes.
  $effect(() => {
    void chat.id;
    untrack(() => {
      name = chat.name ?? '';
      nickname = friend?.nickname ?? '';
      adding = confirming = false;
      picked = [];
      error = saved = '';
    });
  });

  async function act(fn: () => Promise<unknown>, done = '') {
    error = saved = '';
    try {
      await fn();
      saved = done;
    } catch (e) {
      error = errorText(e);
    }
  }

  const members = $derived(
    [...chat.members].sort((a, b) => (a === me ? -1 : b === me ? 1 : social.nameOf(a).localeCompare(social.nameOf(b)))),
  );
</script>

<header class="bar">
  <h2>Details</h2>
  <button class="icon" aria-label="Close details" onclick={onclose}><Icon name="close" size={17} /></button>
</header>

<div class="scroll body">
  <div class="hero">
    {#if chat.kind === 'group'}
      <span class="gavatar" style:--size="72px"><Icon name="users" size={30} /></span>
    {:else}
      <Avatar name={title} size={72} online={friend?.online ?? false} />
    {/if}
    <strong>{title}</strong>
    <span class="muted">
      {#if chat.kind === 'group'}{chat.members.length} people{:else}@{other}{friend ? ` · ${friend.online ? 'Online' : 'Offline'}` : ''}{/if}
    </span>
    <div class="calls">
      <button class="btn" disabled={calls.chatId === chat.id || (chat.kind === 'direct' && !friend)} onclick={() => calls.join(chat.id, false)}>
        <Icon name="phone" size={15} /> Call
      </button>
      <button class="btn" disabled={calls.chatId === chat.id || (chat.kind === 'direct' && !friend)} onclick={() => calls.join(chat.id, true)}>
        <Icon name="video" size={16} /> Video
      </button>
    </div>
  </div>

  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if saved}<p class="saved">{saved}</p>{/if}

  {#if chat.kind === 'direct'}
    {#if friend && other}
      <p class="label">Nickname</p>
      <form class="line" onsubmit={(e) => (e.preventDefault(), act(() => social.setNickname(other, nickname), 'Nickname saved.'))}>
        <input class="field" bind:value={nickname} maxlength="30" placeholder={other} aria-label="Nickname" />
        <button class="btn" disabled={nickname.trim() === (friend.nickname ?? '')}>Save</button>
      </form>
      <p class="hint muted">Only you see it.</p>

      <p class="label">Friend</p>
      {#if confirming}
        <div class="confirm">
          <span>Unfriend {title}? You won't be able to message each other.</span>
          <div>
            <button class="btn danger" onclick={() => act(async () => { await social.remove(other); confirming = false; })}>Unfriend</button>
            <button class="btn" onclick={() => (confirming = false)}>Keep</button>
          </div>
        </div>
      {:else}
        <button class="btn danger" onclick={() => (confirming = true)}><Icon name="trash" size={15} /> Unfriend</button>
      {/if}
    {:else}
      <p class="muted hint">You're not friends with {other} any more.</p>
    {/if}
  {:else}
    <p class="label">Group name</p>
    <form class="line" onsubmit={(e) => (e.preventDefault(), act(() => chats.rename(chat.id, name), 'Name saved.'))}>
      <input class="field" bind:value={name} maxlength="60" placeholder="Name this group" aria-label="Group name" />
      <button class="btn" disabled={name.trim() === (chat.name ?? '')}>Save</button>
    </form>

    <p class="label">People · {chat.members.length}</p>
    {#each members as u (u)}
      {@const f = social.friends.find((x) => x.username === u)}
      <div class="person">
        <Avatar name={social.nameOf(u)} size={34} online={f ? f.online : undefined} />
        <span class="names">
          <strong>{u === me ? 'You' : social.nameOf(u)}</strong>
          {#if u !== me && social.nameOf(u) !== u}<span>@{u}</span>{/if}
        </span>
        {#if chat.call.some((m) => m.username === u)}<span class="incall" title="In the call"><Icon name="phone" size={13} /></span>{/if}
      </div>
    {/each}

    {#if adding}
      <p class="label">Add people</p>
      <ChatPeoplePicker bind:picked exclude={chat.members} />
      <div class="row-buttons">
        <button
          class="btn primary"
          disabled={!picked.length}
          onclick={() =>
            act(async () => {
              await chats.addMembers(chat.id, picked);
              picked = [];
              adding = false;
            })}>Add {picked.length || ''}</button
        >
        <button class="btn" onclick={() => ((adding = false), (picked = []))}>Cancel</button>
      </div>
    {:else}
      <button class="btn add" onclick={() => (adding = true)}><Icon name="userPlus" size={15} /> Add people</button>
    {/if}

    <p class="label">Leave</p>
    {#if confirming}
      <div class="confirm">
        <span>Leave {title}? You'll stop getting its messages.</span>
        <div>
          <button class="btn danger" onclick={() => act(async () => { await chats.leave(chat.id); onleft(); })}>Leave group</button>
          <button class="btn" onclick={() => (confirming = false)}>Stay</button>
        </div>
      </div>
    {:else}
      <button class="btn danger" onclick={() => (confirming = true)}>Leave group</button>
    {/if}
  {/if}
</div>

<style>
  .body {
    padding: 4px 12px 20px;
  }
  .hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 18px 0 6px;
    text-align: center;
  }
  .hero strong {
    margin-top: 8px;
    font-size: 17px;
    overflow-wrap: anywhere;
  }
  .hero .muted {
    font-size: 13px;
  }
  .calls {
    display: flex;
    gap: 8px;
    margin-top: 12px;
  }
  .line {
    display: flex;
    gap: 6px;
  }
  .hint {
    margin: 6px 4px 0;
    font-size: 12.5px;
  }
  .saved {
    margin: 8px 0 0;
    color: var(--online);
    font-size: 13.5px;
    text-align: center;
  }
  .confirm {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--card);
    font-size: 13.5px;
  }
  .confirm div,
  .row-buttons {
    display: flex;
    gap: 8px;
  }
  .row-buttons {
    margin-top: 8px;
  }
  .add {
    margin-top: 6px;
  }
  .incall {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--online) 18%, transparent);
    color: var(--online);
  }
</style>
