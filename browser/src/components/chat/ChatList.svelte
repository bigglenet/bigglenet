<script lang="ts">
  // Every chat, newest first. Searching also finds friends you haven't messaged yet.
  import { account } from '../../lib/account.svelte';
  import { calls } from '../../lib/calls.svelte';
  import { shortTime } from '../../lib/chatformat';
  import { chats, type Chat } from '../../lib/chats.svelte';
  import { social } from '../../lib/social.svelte';
  import Avatar from '../Avatar.svelte';
  import Icon from '../Icon.svelte';

  let {
    selected,
    onselect,
    onfriend,
    onfriends,
  }: { selected: number | null; onselect: (id: number) => void; onfriend: (username: string) => void; onfriends: () => void } = $props();

  let query = $state('');
  const me = $derived(account.user?.username);
  const q = $derived(query.trim().toLowerCase());

  const matches = (text: string) => text.toLowerCase().includes(q);
  const shown = $derived(q ? chats.list.filter((c) => matches(chats.title(c)) || c.members.some(matches)) : chats.list);
  // Friends with no chat yet, when searching.
  const newFriends = $derived(
    q ? social.friends.filter((f) => !chats.withFriend(f.username) && (matches(f.username) || matches(f.nickname ?? ''))) : [],
  );

  function preview(c: Chat): string {
    const l = c.last;
    if (!l) return c.kind === 'group' ? 'New group' : 'Say hi';
    const who = (u: string | null) => (u === me ? 'You' : social.nameOf(u));
    if (l.kind === 'event') return l.from ? `${who(l.from)} ${l.body}` : l.body;
    if (l.from === me) return `You: ${l.body}`;
    return c.kind === 'group' ? `${who(l.from)}: ${l.body}` : l.body;
  }
</script>

<div class="search">
  <Icon name="search" size={15} />
  <input bind:value={query} placeholder="Search chats and friends" aria-label="Search chats and friends" />
</div>

<div class="scroll list">
  {#each shown as c (c.id)}
    <button class="chat" class:on={c.id === selected} class:unread={c.unread > 0} onclick={() => onselect(c.id)}>
      {#if c.kind === 'group'}
        <span class="gavatar" style:--size="42px"><Icon name="users" size={18} /></span>
      {:else}
        <Avatar name={chats.title(c)} size={42} online={social.isOnline(chats.other(c)) ?? false} />
      {/if}
      <span class="middle">
        <span class="top">
          <strong>{chats.title(c)}</strong>
          {#if c.lastAt}<span class="time">{shortTime(c.lastAt)}</span>{/if}
        </span>
        <span class="bottom">
          {#if c.call.length}
            <span class="live" title="Call in progress"><Icon name="phone" size={12} /> {calls.chatId === c.id ? 'In call' : 'Call'}</span>
          {/if}
          <span class="preview">{preview(c)}</span>
          {#if c.unread}<span class="badge" aria-label="{c.unread} unread">{c.unread > 99 ? '99+' : c.unread}</span>{/if}
        </span>
      </span>
    </button>
  {/each}

  {#each newFriends as f (f.username)}
    <button class="chat" onclick={() => onfriend(f.username)}>
      <Avatar name={f.nickname || f.username} size={42} online={f.online} />
      <span class="middle">
        <span class="top"><strong>{f.nickname || f.username}</strong></span>
        <span class="bottom"><span class="preview">Start a chat</span></span>
      </span>
    </button>
  {/each}

  {#if !shown.length && !newFriends.length}
    <div class="empty">
      {#if q}
        <p class="muted">Nothing called “{query.trim()}”.</p>
      {:else if !chats.loaded}
        <p class="muted">Loading…</p>
      {:else}
        <p><strong>No chats yet</strong></p>
        <p class="muted">Add friends, then message them or start a group.</p>
        <button class="btn primary" onclick={onfriends}><Icon name="userPlus" size={16} /> Friends</button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .search {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 10px 10px 6px;
    padding: 0 12px;
    border-radius: 10px;
    background: var(--field);
    color: var(--muted);
  }
  .search:focus-within {
    background: var(--field-hover);
  }
  .search input {
    flex: 1;
    min-width: 0;
    height: 36px;
    border: 0;
    background: none;
    color: var(--text);
    font: inherit;
    font-size: 14px;
    outline: 0;
  }
  .list {
    padding: 2px 6px 12px;
  }
  .chat {
    display: flex;
    align-items: center;
    gap: 11px;
    width: 100%;
    padding: 8px;
    border: 0;
    border-radius: 12px;
    background: none;
    color: var(--text);
    text-align: left;
  }
  .chat:hover {
    background: var(--hover);
  }
  .chat.on {
    background: var(--accent-soft);
  }
  .middle {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .top,
  .bottom {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .top strong {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    font-size: 14.5px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .time {
    flex: none;
    color: var(--muted);
    font-size: 12px;
  }
  .preview {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    color: var(--muted);
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .unread .preview {
    color: var(--text);
    font-weight: 600;
  }
  .unread .time {
    color: var(--text);
    font-weight: 600;
  }
  .badge {
    flex: none;
    min-width: 19px;
    height: 19px;
    padding: 0 6px;
    border-radius: 10px;
    background: var(--accent);
    color: var(--on-accent);
    font-size: 11.5px;
    font-weight: 700;
    line-height: 19px;
    text-align: center;
  }
  .live {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 3px;
    padding: 1px 7px;
    border-radius: 9px;
    background: color-mix(in srgb, var(--online) 18%, transparent);
    color: var(--online);
    font-size: 11.5px;
    font-weight: 700;
  }
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 40px 20px;
    text-align: center;
  }
  .empty p {
    margin: 0;
    font-size: 14px;
  }
  .empty .btn {
    margin-top: 10px;
  }
</style>
