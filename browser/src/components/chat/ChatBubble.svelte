<script lang="ts" module>
  export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '👀'];
  const MORE_REACTIONS = [
    '😀', '😁', '🤣', '😊', '😍', '🥰', '😘', '😎', '🤩', '🥳', '🤔', '🙄', '😴', '😭', '😡', '🤯',
    '👏', '🙌', '🙏', '💪', '👋', '🤝', '✌️', '👌', '💯', '✨', '⭐', '🌈', '🍕', '🎮', '⚽', '🚀',
  ];
</script>

<script lang="ts">
  // One message in a chat: its text or file, what it replies to, its reactions, and (on hover)
  // buttons to react, reply, copy, edit or delete it.
  import { account } from '../../lib/account.svelte';
  import { errorText } from '../../lib/api';
  import { clock, fullTime, linkify, type Part } from '../../lib/chatformat';
  import { chats, fileLabel, type Attachment, type Chat, type ChatMessage } from '../../lib/chats.svelte';
  import { i18n, t } from '../../lib/i18n.svelte';
  import { social } from '../../lib/social.svelte';
  import Icon from '../Icon.svelte';
  import ChatAttachment from './ChatAttachment.svelte';
  import LinkCard from './LinkCard.svelte';

  let {
    m,
    chat,
    mine,
    first,
    last,
    seen,
    onreply,
    onedit,
    onview,
    onlink,
    onjump,
  }: {
    m: ChatMessage;
    chat: Chat;
    mine: boolean;
    first: boolean;
    last: boolean;
    /** "Seen" or "Seen by Ann, Ben", under the last message someone read. */
    seen: string;
    onreply: (m: ChatMessage) => void;
    onedit: (m: ChatMessage) => void;
    onview: (a: Attachment) => void;
    onlink: (link: NonNullable<Part['link']>) => void;
    onjump: (id: number) => void;
  } = $props();

  const me = $derived(account.user?.username);
  let picking = $state<false | 'quick' | 'more'>(false);
  let confirmDelete = $state(false);
  let error = $state('');
  let held = $state(false);

  const parts = $derived(m.body ? linkify(m.body) : []);
  // A preview for the first biggle:// link.
  const previewLink = $derived(parts.find((p) => p.link?.kind === 'biggle')?.link ?? null);
  const capsuleShut = $derived(!!m.unlockAt && m.unlockAt > Date.now());
  const canAct = $derived(!m.pending && !m.deleted && !m.locked && !m.blocked && m.id > 0);
  const when = (at: number) => new Date(at).toLocaleString(i18n.locale, { dateStyle: 'medium', timeStyle: 'short' });

  async function act(fn: () => Promise<unknown>) {
    error = '';
    try {
      await fn();
    } catch (e) {
      error = errorText(e);
    }
  }

  function react(emoji: string) {
    picking = false;
    act(() => chats.react(m, emoji));
  }

  function copy() {
    navigator.clipboard.writeText(m.body).catch(() => {});
  }

  const replyText = $derived.by(() => {
    const r = m.reply;
    if (!r) return '';
    if (r.deleted) return t('Message deleted');
    if (r.locked) return t('⏳ Time capsule');
    return r.body || (r.file ? fileLabel(r.file) : '');
  });

  // Touch screens: a long press shows the buttons.
  let pressTimer: ReturnType<typeof setTimeout>;
  function onpointerdown(e: PointerEvent) {
    if (e.pointerType !== 'touch') return;
    pressTimer = setTimeout(() => (held = true), 450);
  }
</script>

<div class="stack" class:mine role="group" onpointerdown={onpointerdown} onpointerup={() => clearTimeout(pressTimer)} onpointercancel={() => clearTimeout(pressTimer)}>
  {#if chat.kind === 'group' && !mine && first}<span class="sender">{social.nameOf(m.from)}</span>{/if}

  {#if m.reply && !m.deleted}
    <button class="quote" onclick={() => onjump(m.reply!.id)} title={t('Go to the message')}>
      <Icon name="reply" size={12} />
      <span class="quote-who">{m.reply.from === me ? t('You') : social.nameOf(m.reply.from)}</span>
      <span class="quote-text">{replyText}</span>
    </button>
  {/if}

  <div class="row">
    {#if m.locked}
      <div class="capsule" title={fullTime(m.at)}>
        <span class="hourglass"><Icon name="hourglass" size={18} /></span>
        <span>
          <strong>{t('Time capsule')}</strong><br />
          <span class="muted">{t('Opens {when}', { when: when(m.unlockAt!) })}</span>
        </span>
      </div>
    {:else if m.deleted}
      <div class="bubble gone" title={fullTime(m.at)}>{t('Message deleted')}</div>
    {:else if m.blocked}
      <div class="bubble gone">{t('Message from someone you blocked')}</div>
    {:else}
      <div class="content">
        {#if m.unlockAt}
          <span class="capsule-tag">
            <Icon name="hourglass" size={11} />
            {capsuleShut ? t('Opens {when} for everyone else', { when: when(m.unlockAt) }) : t('Time capsule from {when}', { when: when(m.at) })}
          </span>
        {/if}
        {#if m.attachment}
          <ChatAttachment a={m.attachment} {mine} onopen={onview} />
        {/if}
        {#if m.body}
          <div class="bubble" class:pending={m.pending === true} class:failed={m.pending === 'failed'} title={fullTime(m.at)}>{#each parts as part, i (i)}{#if part.link}<button class="inline-link" onclick={() => onlink(part.link!)}>{part.text}</button>{:else}{part.text}{/if}{/each}</div>
        {:else if m.pending && !m.attachment}
          <div class="bubble pending">…</div>
        {/if}
        {#if previewLink}
          <LinkCard href={previewLink.href} onopen={() => onlink(previewLink)} />
        {/if}
      </div>
    {/if}

    {#if canAct}
      <div class="actions" class:show={held || picking || confirmDelete}>
        <button aria-label={t('React')} title={t('React')} onclick={() => (picking = picking ? false : 'quick')}><Icon name="smile" size={15} /></button>
        <button aria-label={t('Reply')} title={t('Reply')} onclick={() => ((held = false), onreply(m))}><Icon name="reply" size={15} /></button>
        {#if m.body}<button aria-label={t('Copy')} title={t('Copy')} onclick={() => ((held = false), copy())}><Icon name="copy" size={15} /></button>{/if}
        {#if mine}
          {#if m.body || !m.attachment}<button aria-label={t('Edit')} title={t('Edit')} onclick={() => ((held = false), onedit(m))}><Icon name="edit" size={15} /></button>{/if}
          <button aria-label={t('Delete')} title={t('Delete')} onclick={() => (confirmDelete = true)}><Icon name="trash" size={15} /></button>
        {/if}
      </div>
    {/if}
  </div>

  {#if picking}
    <div class="picker" role="listbox" aria-label={t('Reactions')}>
      {#each picking === 'more' ? MORE_REACTIONS : QUICK_REACTIONS as emoji (emoji)}
        <button role="option" aria-selected="false" onclick={() => react(emoji)}>{emoji}</button>
      {/each}
      {#if picking === 'quick'}
        <button class="more" aria-label={t('More reactions')} onclick={() => (picking = 'more')}>+</button>
      {/if}
    </div>
  {/if}

  {#if confirmDelete}
    <span class="confirm">
      {t('Delete this message for everyone?')}
      <button class="link danger" onclick={() => ((confirmDelete = false), (held = false), act(() => chats.remove(m)))}>{t('Delete')}</button>
      <button class="link" onclick={() => ((confirmDelete = false), (held = false))}>{t('Keep')}</button>
    </span>
  {/if}

  {#if m.reactions?.length}
    <div class="reactions">
      {#each m.reactions as r (r.emoji)}
        <button
          class:on={!!me && r.users.includes(me)}
          title={r.users.map((u) => (u === me ? t('You') : social.nameOf(u))).join(', ')}
          onclick={() => react(r.emoji)}
          disabled={!canAct}
        >
          {r.emoji} <span>{r.users.length}</span>
        </button>
      {/each}
    </div>
  {/if}

  {#if error}<span class="note failed-note">{error}</span>{/if}
  {#if m.pending === 'failed'}
    <span class="note failed-note">
      {t('Not sent')} · <button class="link" onclick={() => chats.retry(m)}>{t('Try again')}</button> ·
      <button class="link" onclick={() => chats.discard(m)}>{t('Delete')}</button>
    </span>
  {:else if last || seen}
    <span class="note">
      {m.pending ? t('Sending…') : clock(m.at)}{m.editedAt && !m.deleted ? ` · ${t('edited')}` : ''}{seen ? ` · ${seen}` : ''}
    </span>
  {:else if m.editedAt && !m.deleted}
    <span class="note">{t('edited')}</span>
  {/if}
</div>

<style>
  .stack {
    position: relative;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }
  .stack.mine {
    align-items: flex-end;
  }
  .sender {
    margin: 0 0 3px 12px;
    color: var(--muted);
    font-size: 12px;
    font-weight: 600;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 4px;
    max-width: 100%;
  }
  .mine .row {
    flex-direction: row-reverse;
  }
  .content {
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
  .mine .content {
    align-items: flex-end;
  }
  .bubble {
    max-width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: 18px;
    background: var(--card);
    font-size: 14.5px;
    line-height: 1.4;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    user-select: text;
  }
  .mine .bubble {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--on-accent);
  }
  .bubble.gone {
    border-style: dashed;
    background: none;
    color: var(--muted);
    font-style: italic;
  }
  .mine .bubble.gone {
    border-color: var(--border);
    background: none;
    color: var(--muted);
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
    cursor: pointer;
  }
  .quote {
    display: flex;
    align-items: center;
    gap: 5px;
    max-width: 100%;
    margin: 0 8px 3px;
    padding: 3px 9px;
    border: 0;
    border-left: 3px solid var(--accent);
    border-radius: 6px;
    background: var(--hover);
    color: var(--muted);
    font: inherit;
    font-size: 12.5px;
    text-align: left;
    cursor: pointer;
  }
  .quote-who {
    flex: none;
    font-weight: 700;
    color: var(--text);
  }
  .quote-text {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .capsule {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px 10px 10px;
    border: 1px dashed var(--accent);
    border-radius: 18px;
    background: var(--accent-soft);
    font-size: 13.5px;
    line-height: 1.35;
  }
  .hourglass {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--on-accent);
  }
  .capsule-tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--muted);
    font-size: 11.5px;
  }
  .muted {
    color: var(--muted);
  }
  .actions {
    flex: none;
    display: flex;
    gap: 1px;
    padding: 2px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--card);
    box-shadow: 0 4px 14px -6px rgb(0 0 0 / 0.3);
    visibility: hidden;
  }
  .stack:hover .actions,
  .actions.show,
  .actions:focus-within {
    visibility: visible;
  }
  .actions button {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: 8px;
    background: none;
    color: var(--muted);
    cursor: pointer;
  }
  .actions button:hover {
    background: var(--hover);
    color: var(--text);
  }
  .picker {
    z-index: 5;
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    max-width: 330px;
    margin: 4px 0;
    padding: 4px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--card);
    box-shadow: 0 8px 22px -10px rgb(0 0 0 / 0.35);
  }
  .picker button {
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: 8px;
    background: none;
    font-size: 19px;
    cursor: pointer;
  }
  .picker button:hover {
    background: var(--hover);
  }
  .picker .more {
    color: var(--muted);
    font-size: 18px;
    font-weight: 700;
  }
  .reactions {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin: 3px 4px 0;
  }
  .reactions button {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    height: 24px;
    padding: 0 7px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--card);
    color: var(--text);
    font: inherit;
    font-size: 13px;
    cursor: pointer;
  }
  .reactions button span {
    font-size: 11.5px;
    font-weight: 700;
  }
  .reactions button.on {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .confirm {
    margin: 3px 6px 0;
    color: var(--muted);
    font-size: 12.5px;
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
    cursor: pointer;
  }
  .link.danger {
    color: var(--danger);
  }
</style>
