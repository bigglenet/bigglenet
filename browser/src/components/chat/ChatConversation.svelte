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
  import { clock, dayLabel, fullTime, sameDay, type Part } from '../../lib/chatformat';
  import { chats, type Attachment, type Chat, type ChatMessage } from '../../lib/chats.svelte';
  import { t } from '../../lib/i18n.svelte';
  import { people } from '../../lib/people.svelte';
  import { social } from '../../lib/social.svelte';
  import Avatar from '../Avatar.svelte';
  import Icon from '../Icon.svelte';
  import ChatBubble from './ChatBubble.svelte';
  import ChatComposer from './ChatComposer.svelte';
  import ImageViewer from './ImageViewer.svelte';

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
      : [friend?.nickname ? `@${other}` : '', friend ? people.statusLine(other!) || (friend.online ? t('Online') : t('Offline')) : '']
          .filter(Boolean)
          .join(' · '),
  );
  const inThisCall = $derived(calls.chatId === chat.id);
  const inCall = $derived(chat.call.filter((m) => m.username !== me));

  let list = $state<HTMLElement>();
  let composer = $state<ReturnType<typeof ChatComposer>>();
  let text = $state('');
  let error = $state('');
  let replyTo = $state<ChatMessage | null>(null);
  let editing = $state<ChatMessage | null>(null);
  let viewing = $state<Attachment | null>(null);
  let dropping = $state(false);
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
      replyTo = null;
      editing = null;
      if (matchMedia('(pointer: fine)').matches) tick().then(() => composer?.focus());
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

  // Time capsules open on their own: fetch the next one when its time comes.
  $effect(() => {
    const now = Date.now();
    const next = messages.filter((m) => m.locked && m.unlockAt && m.unlockAt > now).sort((a, b) => a.unlockAt! - b.unlockAt!)[0];
    if (!next) return;
    const timer = setTimeout(() => chats.reloadMessage(chat.id, next.id), Math.min(next.unlockAt! - now + 500, 2 ** 31 - 1));
    return () => clearTimeout(timer);
  });

  /** Scroll to a message (the one a reply quotes), if it's loaded. */
  function jump(id: number) {
    const el = list?.querySelector(`[data-message="${id}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 1400);
  }

  // Dropping files on the chat sends them.
  function ondragover(e: DragEvent) {
    if (!canTalk || !e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    dropping = true;
  }
  function ondrop(e: DragEvent) {
    dropping = false;
    const files = [...(e.dataTransfer?.files ?? [])];
    if (!files.length || !canTalk) return;
    e.preventDefault();
    stick = true;
    composer?.addFiles(files);
  }

  // Who's typing.
  const typing = $derived(Object.entries(chats.typing[chat.id] ?? {}).filter(([u, until]) => u !== me && until > Date.now()).map(([u]) => social.nameOf(u)));

  /** "Seen" under the newest of my messages someone has read (and who, in groups). */
  const seen = $derived.by(() => {
    const out = new Map<number, string>();
    const reads = chat.reads ?? {};
    const others = chat.members.filter((u) => u !== me);
    const lastMine = [...messages].reverse().find((m) => m.from === me && m.kind === 'text' && m.id > 0);
    if (!lastMine) return out;
    const readers = others.filter((u) => (reads[u] ?? 0) >= lastMine.id);
    if (!readers.length) return out;
    out.set(lastMine.id, chat.kind === 'direct' ? t('Seen') : readers.length === others.length ? t('Seen by everyone') : t('Seen by {names}', { names: readers.map((u) => social.nameOf(u)).join(', ') }));
    return out;
  });

  function openLink(link: NonNullable<Part['link']>) {
    if (link.kind === 'external') browser.external = link.href;
    else browser.newTab(link.href, { after: browser.activeId });
  }

  const sameRun = (a?: ChatMessage, b?: ChatMessage) =>
    !!a && !!b && a.kind === 'text' && b.kind === 'text' && a.from === b.from && b.at - a.at < 5 * 60_000 && sameDay(a.at, b.at) && !b.reply;

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
      <Avatar name={title} user={other} size={36} online={friend?.online ?? false} />
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

<div
  class="messages scroll"
  class:dropping
  bind:this={list}
  onscroll={() => list && list.scrollTop < 40 && older()}
  aria-live="polite"
  role="log"
  {ondragover}
  ondragleave={() => (dropping = false)}
  {ondrop}
>
  {#if thread?.more}
    <button class="older" disabled={thread.loading} onclick={older}>{thread.loading ? 'Loading…' : 'Load older messages'}</button>
  {/if}
  {#each rows as r (r.m.id)}
    {#if r.day}<div class="day"><span>{r.day}</span></div>{/if}
    {#if r.m.kind === 'event'}
      <p class="event" title={fullTime(r.m.at)}>{r.m.from ? `${who(r.m.from)} ${r.m.body}` : r.m.body} · {clock(r.m.at)}</p>
    {:else}
      <div class="msg" class:mine={r.mine} class:first={r.first} class:last={r.last} data-message={r.m.id}>
        {#if chat.kind === 'group' && !r.mine}
          <span class="side">{#if r.last}<Avatar name={social.nameOf(r.m.from)} user={r.m.from} size={28} />{/if}</span>
        {/if}
        <ChatBubble
          m={r.m}
          {chat}
          mine={r.mine}
          first={r.first}
          last={r.last}
          seen={seen.get(r.m.id) ?? ''}
          onreply={(m) => ((editing = null), (replyTo = m))}
          onedit={(m) => ((replyTo = null), (editing = m))}
          onview={(a) => (viewing = a)}
          onlink={openLink}
          onjump={jump}
        />
      </div>
    {/if}
  {:else}
    {#if thread && !thread.loading}
      <div class="hello">
        {#if chat.kind === 'group'}
          <span class="gavatar" style:--size="64px"><Icon name="users" size={28} /></span>
          <p>This is the start of <strong>{title}</strong>.</p>
        {:else}
          <Avatar name={title} user={other} size={64} />
          <p>Say hi to <strong>{title}</strong>.</p>
        {/if}
      </div>
    {/if}
  {/each}
</div>

{#if typing.length}
  <p class="typing" aria-live="polite">
    <span class="dots"><span></span><span></span><span></span></span>
    {typing.length === 1 ? t('{name} is typing…', { name: typing[0] }) : t('{names} are typing…', { names: names(typing) })}
  </p>
{/if}
{#if error}<p class="error composer-error" role="alert">{error}</p>{/if}
{#if canTalk}
  <ChatComposer bind:this={composer} {chat} {title} bind:text bind:replyTo bind:editing onsent={() => (stick = true)} />
{:else}
  <p class="cant muted">You and {other} aren't friends any more, so you can't message each other.</p>
{/if}
{#if viewing}
  <ImageViewer a={viewing} onclose={() => (viewing = null)} />
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
  .msg :global(.flash) ,
  .msg:global(.flash) {
    animation: flash 1.4s ease-out;
  }
  @keyframes flash {
    0%,
    40% {
      background: var(--accent-soft);
    }
  }
  .messages.dropping {
    outline: 2px dashed var(--accent);
    outline-offset: -8px;
  }
  .typing {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    padding: 0 16px 6px;
    color: var(--muted);
    font-size: 12.5px;
  }
  .dots {
    display: inline-flex;
    gap: 3px;
  }
  .dots span {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: currentColor;
    animation: bounce 1.2s infinite ease-in-out;
  }
  .dots span:nth-child(2) {
    animation-delay: 0.15s;
  }
  .dots span:nth-child(3) {
    animation-delay: 0.3s;
  }
  @keyframes bounce {
    0%,
    80%,
    100% {
      opacity: 0.3;
      transform: translateY(0);
    }
    40% {
      opacity: 1;
      transform: translateY(-3px);
    }
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
  .cant {
    margin: 0;
    padding: 14px;
    border-top: 1px solid var(--border);
    font-size: 13.5px;
    text-align: center;
  }
</style>
