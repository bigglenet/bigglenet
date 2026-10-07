<script lang="ts">
  import { tick } from 'svelte';
  import { account } from '../lib/account.svelte';
  import { errorText } from '../lib/api';
  import { social } from '../lib/social.svelte';
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';

  const name = $derived(social.chatWith ?? '');
  const friend = $derived(social.friends.find((f) => f.username === name));
  const me = $derived(account.user?.username);

  let list = $state<HTMLElement>();
  let text = $state('');
  let error = $state('');
  let confirmRemove = $state(false);
  let stickToBottom = true;

  // Follow new messages, unless the user has scrolled up to read older ones.
  $effect.pre(() => {
    void social.messages.length;
    if (list) stickToBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  });
  $effect(() => {
    void social.messages.length;
    if (stickToBottom && list) list.scrollTop = list.scrollHeight;
  });

  // Reading the chat marks it read.
  $effect(() => {
    if (social.open && friend && friend.unread > 0 && document.visibilityState === 'visible') {
      social.markRead(friend.username);
    }
  });
  $effect(() => {
    const onvisible = () => {
      if (document.visibilityState === 'visible' && friend?.unread) social.markRead(friend.username);
    };
    document.addEventListener('visibilitychange', onvisible);
    return () => document.removeEventListener('visibilitychange', onvisible);
  });

  async function send(e?: SubmitEvent) {
    e?.preventDefault();
    const body = text.trim();
    if (!body) return;
    text = '';
    error = '';
    stickToBottom = true;
    try {
      await social.send(body);
    } catch (err) {
      error = errorText(err);
      text = body;
    }
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send();
    }
  }

  async function older() {
    if (!list) return;
    const before = list.scrollHeight;
    stickToBottom = false;
    await social.loadOlder();
    await tick();
    list.scrollTop += list.scrollHeight - before;
  }

  async function remove() {
    try {
      await social.remove(name);
      social.closeChat();
    } catch (err) {
      error = errorText(err);
    }
  }

  const time = (at: number) => new Date(at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  const sameGroup = (i: number) => {
    const a = social.messages[i - 1];
    const b = social.messages[i];
    return a && a.from === b.from && b.at - a.at < 5 * 60_000;
  };
</script>

<header>
  <button class="icon" aria-label="Back to friends" onclick={() => social.closeChat()}>
    <Icon name="back" />
  </button>
  <Avatar {name} online={friend?.online ?? false} />
  <div class="who">
    <strong>{name}</strong>
    <span>{friend?.online ? 'Online' : 'Offline'}</span>
  </div>
  {#if confirmRemove}
    <button class="small danger" onclick={remove}>Unfriend</button>
    <button class="small" onclick={() => (confirmRemove = false)}>Keep</button>
  {:else}
    <button class="icon" aria-label="Unfriend {name}" title="Unfriend" onclick={() => (confirmRemove = true)}>
      <Icon name="trash" size={16} />
    </button>
  {/if}
  <button class="icon" aria-label="Close friends" onclick={() => (social.open = false)}>
    <Icon name="close" size={17} />
  </button>
</header>

<div class="messages" bind:this={list} aria-live="polite">
  {#if social.more}
    <button class="older" disabled={social.loadingMessages} onclick={older}>Load older messages</button>
  {/if}
  {#each social.messages as m, i (m.id)}
    <div class="msg" class:mine={m.from === me} class:pending={m.pending} class:grouped={sameGroup(i)} title={time(m.at)}>
      {m.body}
    </div>
  {:else}
    {#if !social.loadingMessages}
      <p class="hello">Say hi to {name}.</p>
    {/if}
  {/each}
</div>

{#if error}
  <p class="error" role="alert">{error}</p>
{/if}
<form class="composer" onsubmit={send}>
  <textarea bind:value={text} {onkeydown} rows="1" placeholder="Message {name}" aria-label="Message {name}"></textarea>
  <button class="icon solid" aria-label="Send" disabled={!text.trim()}>
    <Icon name="send" size={16} />
  </button>
</form>

<style>
  header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 8px 10px 6px;
    border-bottom: 1px solid var(--border);
  }
  .who {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.25;
  }
  .who strong {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .who span {
    color: var(--muted);
    font-size: 12.5px;
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
  .danger {
    border-color: var(--danger);
    background: var(--danger);
    color: #fff;
  }

  .messages {
    flex: 1;
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 14px 12px;
  }
  .msg {
    max-width: 80%;
    align-self: flex-start;
    padding: 8px 12px;
    border-radius: 16px 16px 16px 6px;
    background: var(--card);
    border: 1px solid var(--border);
    font-size: 14.5px;
    line-height: 1.4;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .msg.mine {
    align-self: flex-end;
    border-radius: 16px 16px 6px 16px;
    border-color: var(--accent);
    background: var(--accent);
    color: var(--on-accent);
  }
  .msg:not(.grouped) {
    margin-top: 6px;
  }
  .msg.pending {
    opacity: 0.55;
  }
  .older {
    align-self: center;
    padding: 6px 12px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--card);
    color: var(--muted);
    font: inherit;
    font-size: 13px;
  }
  .hello {
    margin: auto;
    color: var(--muted);
  }

  .error {
    margin: 0;
    padding: 0 14px 6px;
    color: var(--danger);
    font-size: 13.5px;
  }
  .composer {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    padding: 10px 12px 12px;
    border-top: 1px solid var(--border);
  }
  textarea {
    flex: 1;
    min-width: 0;
    max-height: 140px;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--card);
    color: var(--text);
    font: inherit;
    font-size: 14.5px;
    line-height: 1.35;
    resize: none;
    field-sizing: content;
  }
  textarea:focus {
    outline: 0;
    border-color: var(--accent);
  }
</style>
