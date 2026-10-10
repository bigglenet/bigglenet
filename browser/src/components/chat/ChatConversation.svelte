<script lang="ts" module>
  // Unsent text, per chat, so switching chats doesn't lose it.
  const drafts = new Map<number, string>();
</script>

<script lang="ts">
  // One chat: its messages, the box to write in, and its call.
  import { tick, untrack } from 'svelte';
  import { account } from '../../lib/account.svelte';
  import { errorText } from '../../lib/api';
  import { browser } from '../../lib/browser.svelte';
  import { calls } from '../../lib/calls.svelte';
  import { clock, dayLabel, fullTime, linkify, sameDay, type Part } from '../../lib/chatformat';
  import { chats, type Chat, type ChatMessage } from '../../lib/chats.svelte';
  import { social } from '../../lib/social.svelte';
  import Avatar from '../Avatar.svelte';
  import Icon from '../Icon.svelte';

  let {
    chat,
    active,
    infoOpen,
    onback,
    oninfo,
  }: { chat: Chat; active: boolean; infoOpen: boolean; onback?: () => void; oninfo: () => void } = $props();

  const me = $derived(account.user?.username);
  const thread = $derived(chats.threads[chat.id]);
  const messages = $derived(thread?.messages ?? []);
  const title = $derived(chats.title(chat));
  const other = $derived(chat.kind === 'direct' ? chats.other(chat) : null);
  const friend = $derived(other ? social.friends.find((f) => f.username === other) : undefined);
  // One-to-one chats need you to still be friends.
  const canTalk = $derived(chat.kind === 'group' || !!friend || !social.friendsLoaded);
  const subtitle = $derived(
    chat.kind === 'group'
      ? `${chat.members.length} ${chat.members.length === 1 ? 'person' : 'people'}`
      : [friend?.nickname ? `@${other}` : '', friend ? (friend.online ? 'Online' : 'Offline') : ''].filter(Boolean).join(' · '),
  );
  const inThisCall = $derived(calls.chatId === chat.id);
  const inCall = $derived(chat.call.filter((m) => m.username !== me));

  let list = $state<HTMLElement>();
  let input = $state<HTMLTextAreaElement>();
  let text = $state('');
  let error = $state('');
  let stick = true;
  let shownChat = 0;
  let visible = $state(document.visibilityState === 'visible');

  // Load the chat, and bring back what you were writing in it.
  $effect(() => {
    const id = chat.id;
    untrack(() => {
      chats.load(id);
      text = drafts.get(id) ?? '';
      error = '';
      if (matchMedia('(pointer: fine)').matches) tick().then(() => input?.focus());
    });
    return () => {
      if (text.trim()) drafts.set(id, text);
      else drafts.delete(id);
    };
  });

  // Follow new messages, unless you've scrolled up to read older ones.
  $effect.pre(() => {
    void messages.length;
    if (chat.id !== shownChat) {
      shownChat = chat.id;
      stick = true;
    } else if (list) {
      stick = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    }
  });
  $effect(() => {
    void messages.length;
    if (stick && list) list.scrollTop = list.scrollHeight;
  });

  // Seeing a chat marks it read.
  $effect(() => {
    const on = () => (visible = document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  });
  $effect(() => {
    if (active && visible && chat.unread > 0) chats.markRead(chat.id);
  });

  async function older() {
    if (!list || !thread?.more || thread.loading) return;
    const before = list.scrollHeight;
    stick = false;
    try {
      await chats.loadOlder(chat.id);
    } catch (e) {
      error = errorText(e);
    }
    await tick();
    list.scrollTop += list.scrollHeight - before;
  }

  async function send(e?: SubmitEvent) {
    e?.preventDefault();
    const body = text.trim();
    if (!body) return;
    text = '';
    error = '';
    stick = true;
    try {
      await chats.send(chat.id, body);
    } catch (err) {
      error = errorText(err);
    }
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send();
    }
  }

  function openLink(link: NonNullable<Part['link']>) {
    if (link.kind === 'external') browser.external = link.href;
    else browser.newTab(link.href, { after: browser.activeId });
  }

  const sameRun = (a?: ChatMessage, b?: ChatMessage) =>
    !!a && !!b && a.kind === 'text' && b.kind === 'text' && a.from === b.from && b.at - a.at < 5 * 60_000 && sameDay(a.at, b.at);

  const rows = $derived(
    messages.map((m, i) => ({
      m,
      day: i === 0 || !sameDay(messages[i - 1].at, m.at) ? dayLabel(m.at) : null,
      first: !sameRun(messages[i - 1], m),
      last: !sameRun(m, messages[i + 1]),
      mine: m.from === me,
    })),
  );

  const who = (u: string | null) => (u === me ? 'You' : social.nameOf(u));
  const names = (list: string[]) => (list.length <= 2 ? list.join(' and ') : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`);
</script>

<header class="bar">
  {#if onback}
    <button class="icon" aria-label="Back to chats" onclick={onback}><Icon name="back" /></button>
  {/if}
  <button class="who" onclick={oninfo} aria-label="About this chat">
    {#if chat.kind === 'group'}
      <span class="gavatar" style:--size="36px"><Icon name="users" size={16} /></span>
    {:else}
      <Avatar name={title} size={36} online={friend?.online ?? false} />
    {/if}
    <span class="names">
      <strong>{title}</strong>
      {#if subtitle}<span>{subtitle}</span>{/if}
    </span>
  </button>
  <button class="icon" aria-label="Voice call" title="Voice call" disabled={!canTalk || inThisCall} onclick={() => calls.join(chat.id, false)}>
    <Icon name="phone" size={17} />
  </button>
  <button class="icon" aria-label="Video call" title="Video call" disabled={!canTalk || inThisCall} onclick={() => calls.join(chat.id, true)}>
    <Icon name="video" size={18} />
  </button>
  <button class="icon" class:on={infoOpen} aria-label="Chat details" title="Details" aria-pressed={infoOpen} onclick={oninfo}>
    <Icon name="info" size={18} />
  </button>
</header>

{#if inThisCall}
  <div class="callbar in">
    <span class="dot"></span>
    <span class="what">You're in this call{inCall.length ? ` with ${names(inCall.map((m) => social.nameOf(m.username)))}` : ''}</span>
    <button class="btn small" onclick={() => (calls.expanded = true)}>Show</button>
  </div>
{:else if chat.call.length}
  <div class="callbar">
    <span class="dot"></span>
    <span class="what">{names(chat.call.map((m) => who(m.username)))} {chat.call.length === 1 ? 'is' : 'are'} in a call</span>
    <button class="btn small call" disabled={!canTalk} onclick={() => calls.join(chat.id, false)}><Icon name="phone" size={13} /> Join</button>
    <button class="icon" aria-label="Join with video" title="Join with video" disabled={!canTalk} onclick={() => calls.join(chat.id, true)}>
      <Icon name="video" size={16} />
    </button>
  </div>
{/if}

<div class="messages scroll" bind:this={list} onscroll={() => list && list.scrollTop < 40 && older()} aria-live="polite">
  {#if thread?.more}
    <button class="older" disabled={thread.loading} onclick={older}>{thread.loading ? 'Loading…' : 'Load older messages'}</button>
  {/if}
  {#each rows as r (r.m.id)}
    {#if r.day}<div class="day"><span>{r.day}</span></div>{/if}
    {#if r.m.kind === 'event'}
      <p class="event" title={fullTime(r.m.at)}>{r.m.from ? `${who(r.m.from)} ${r.m.body}` : r.m.body} · {clock(r.m.at)}</p>
    {:else}
      <div class="msg" class:mine={r.mine} class:first={r.first} class:last={r.last}>
        {#if chat.kind === 'group' && !r.mine}
          <span class="side">{#if r.last}<Avatar name={social.nameOf(r.m.from)} size={28} />{/if}</span>
        {/if}
        <div class="stack">
          {#if chat.kind === 'group' && !r.mine && r.first}<span class="sender">{social.nameOf(r.m.from)}</span>{/if}
          <div class="bubble" class:pending={r.m.pending === true} class:failed={r.m.pending === 'failed'} title={fullTime(r.m.at)}>{#each linkify(r.m.body) as part, i (i)}{#if part.link}<button class="inline-link" onclick={() => openLink(part.link!)}>{part.text}</button>{:else}{part.text}{/if}{/each}</div>
          {#if r.m.pending === 'failed'}
            <span class="note failed-note">
              Not sent · <button class="link" onclick={() => chats.retry(r.m)}>Try again</button> ·
              <button class="link" onclick={() => chats.discard(r.m)}>Delete</button>
            </span>
          {:else if r.last}
            <span class="note">{r.m.pending ? 'Sending…' : clock(r.m.at)}</span>
          {/if}
        </div>
      </div>
    {/if}
  {:else}
    {#if thread && !thread.loading}
      <div class="hello">
        {#if chat.kind === 'group'}
          <span class="gavatar" style:--size="64px"><Icon name="users" size={28} /></span>
          <p>This is the start of <strong>{title}</strong>.</p>
        {:else}
          <Avatar name={title} size={64} />
          <p>Say hi to <strong>{title}</strong>.</p>
        {/if}
      </div>
    {/if}
  {/each}
</div>

{#if error}<p class="error composer-error" role="alert">{error}</p>{/if}
{#if canTalk}
  <form class="composer" onsubmit={send}>
    <textarea bind:this={input} bind:value={text} {onkeydown} rows="1" maxlength="2000" placeholder="Message {title}" aria-label="Message {title}"></textarea>
    <button class="icon solid" aria-label="Send" disabled={!text.trim()}><Icon name="send" size={16} /></button>
  </form>
{:else}
  <p class="cant muted">You and {other} aren't friends any more, so you can't message each other.</p>
{/if}

<style>
  .who {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    margin-right: 4px;
    padding: 4px 6px 4px 0;
    border: 0;
    border-radius: 10px;
    background: none;
    color: var(--text);
    text-align: left;
  }
  .names {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.25;
  }
  .names strong,
  .names span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .names strong {
    font-size: 15px;
  }
  .names span {
    color: var(--muted);
    font-size: 12.5px;
  }

  .callbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px 8px 14px;
    border-bottom: 1px solid var(--border);
    background: color-mix(in srgb, var(--online) 10%, var(--surface));
    font-size: 13.5px;
  }
  .callbar .what {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dot {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--online);
    animation: pulse 1.6s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.35;
    }
  }

  .messages {
    display: flex;
    flex-direction: column;
    padding: 12px 14px 10px;
  }
  .older {
    align-self: center;
    margin-bottom: 8px;
    padding: 6px 12px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--card);
    color: var(--muted);
    font-size: 13px;
  }
  .day {
    display: flex;
    justify-content: center;
    margin: 14px 0 8px;
  }
  .day span {
    padding: 3px 10px;
    border-radius: 10px;
    background: var(--hover);
    color: var(--muted);
    font-size: 12px;
    font-weight: 600;
  }
  .event {
    align-self: center;
    max-width: 85%;
    margin: 8px 0;
    color: var(--muted);
    font-size: 12.5px;
    text-align: center;
  }

  .msg {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    max-width: min(78%, 560px);
    margin-top: 2px;
  }
  .msg.first {
    margin-top: 8px;
  }
  .msg.mine {
    align-self: flex-end;
  }
  .side {
    flex: none;
    width: 28px;
    margin-bottom: 18px;
  }
  .msg.last .side {
    margin-bottom: 18px;
  }
  .stack {
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }
  .mine .stack {
    align-items: flex-end;
  }
  .sender {
    margin: 0 0 3px 12px;
    color: var(--muted);
    font-size: 12px;
    font-weight: 600;
  }
  .bubble {
    max-width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: 6px 18px 18px 6px;
    background: var(--card);
    font-size: 14.5px;
    line-height: 1.4;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    user-select: text;
  }
  .msg.first .bubble {
    border-top-left-radius: 18px;
  }
  .msg.last .bubble {
    border-bottom-left-radius: 18px;
  }
  .mine .bubble {
    border-color: var(--accent);
    border-radius: 18px 6px 6px 18px;
    background: var(--accent);
    color: var(--on-accent);
  }
  .mine.first .bubble {
    border-top-right-radius: 18px;
  }
  .mine.last .bubble {
    border-bottom-right-radius: 18px;
  }
  .bubble.pending {
    opacity: 0.55;
  }
  .bubble.failed {
    border-color: var(--danger);
    background: none;
    color: var(--text);
  }
  .inline-link {
    display: inline;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    text-decoration: underline;
    text-underline-offset: 2px;
    overflow-wrap: anywhere;
  }
  .note {
    margin: 3px 6px 0;
    color: var(--muted);
    font-size: 11.5px;
  }
  .failed-note {
    color: var(--danger);
  }
  .link {
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    font-weight: 600;
    text-decoration: underline;
  }

  .hello {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    margin: auto;
    padding: 30px 10px;
    color: var(--muted);
    text-align: center;
  }
  .hello p {
    margin: 0;
  }
  .hello strong {
    color: var(--text);
  }

  .composer-error {
    margin: 0;
    padding: 0 14px 6px;
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
    min-height: 36px;
    max-height: 160px;
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
  .composer .icon {
    width: 36px;
    height: 36px;
    border-radius: 12px;
  }
  .cant {
    margin: 0;
    padding: 14px;
    border-top: 1px solid var(--border);
    font-size: 13.5px;
    text-align: center;
  }
</style>
