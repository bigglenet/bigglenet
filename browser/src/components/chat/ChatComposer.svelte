<script lang="ts">
  // Where you write in a chat: text, a reply to a message, a picture or file (the paperclip,
  // pasting, or dropping one on the chat), a voice message (the microphone), or a time capsule
  // that opens later (the hourglass). Also edits your own messages.
  import { tick } from 'svelte';
  import { account } from '../../lib/account.svelte';
  import { errorText } from '../../lib/api';
  import { MAX_FILE, prepare, VoiceRecorder } from '../../lib/chatfiles';
  import { duration } from '../../lib/chatformat';
  import { chats, fileLabel, type Chat, type ChatMessage } from '../../lib/chats.svelte';
  import { i18n, t } from '../../lib/i18n.svelte';
  import { browser } from '../../lib/browser.svelte';
  import { menu } from '../../lib/contextmenu.svelte';
  import { social } from '../../lib/social.svelte';
  import Icon from '../Icon.svelte';

  let {
    chat,
    title,
    text = $bindable(''),
    replyTo = $bindable(null),
    editing = $bindable(null),
    onsent,
  }: {
    chat: Chat;
    title: string;
    text?: string;
    replyTo?: ChatMessage | null;
    editing?: ChatMessage | null;
    onsent: () => void;
  } = $props();

  const me = $derived(account.user?.username ?? null);
  let input = $state<HTMLTextAreaElement>();
  let picker = $state<HTMLInputElement>();
  let error = $state('');
  let uploads = $state<{ id: number; name: string; done: number }[]>([]);
  let nextUpload = 0;

  // Time capsule.
  let capsule = $state(false);
  let opensAt = $state('');

  // Voice message.
  let recorder: VoiceRecorder | null = null;
  let recording = $state(false);
  let seconds = $state(0);
  let tickTimer: ReturnType<typeof setInterval>;
  const MAX_VOICE = 180;

  export function focus() {
    input?.focus();
  }

  // Editing: the message's text goes in the box.
  let editingId = 0;
  $effect(() => {
    const m = editing;
    if (m && m.id !== editingId) {
      editingId = m.id;
      text = m.body;
      tick().then(() => input?.focus());
    } else if (!m) {
      editingId = 0;
    }
  });
  $effect(() => {
    if (replyTo) tick().then(() => input?.focus());
  });

  /** The time capsule's opening time, if it's on and valid. */
  function unlockAt(): number | null | undefined {
    if (!capsule) return null;
    const at = new Date(opensAt).getTime();
    if (!opensAt || !Number.isFinite(at) || at < Date.now() + 60_000) {
      error = t('Pick when the time capsule opens: at least a minute from now.');
      return undefined;
    }
    return at;
  }

  // A game on games.biggle (sites/games), in a room of its own: the link goes in the chat, and
  // it opens here too.
  const GAMES = [
    { page: 'tictactoe', label: 'Tic-tac-toe', icon: 'tabs' },
    { page: 'chess', label: 'Chess', icon: 'trophy' },
    { page: 'draw', label: 'Draw & guess', icon: 'edit' },
  ] as const;

  function pickGame(e: MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    menu.show(
      r.left,
      r.top - 8 - GAMES.length * 36,
      GAMES.map((g) => ({ label: t(g.label), icon: g.icon, action: () => startGame(g.page, t(g.label)) })),
    );
  }

  async function startGame(page: string, name: string) {
    const code = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
    const link = `biggle://games.biggle/${page}.bhtml?room=${code}`;
    try {
      await chats.send(chat.id, t('Let’s play {game}! {link}', { game: name, link }), {});
      browser.newTab(link, { after: browser.activeId });
    } catch (err) {
      error = errorText(err);
    }
  }

  async function send(e?: SubmitEvent) {
    e?.preventDefault();
    error = '';
    const body = text.trim();
    if (editing) {
      const m = editing;
      if (body === m.body.trim()) return void (editing = null);
      try {
        await chats.edit(m, body);
        editing = null;
        text = '';
      } catch (err) {
        error = errorText(err);
      }
      return;
    }
    if (!body) return;
    const at = unlockAt();
    if (at === undefined) return;
    const reply = replyTo;
    text = '';
    replyTo = null;
    capsule = false;
    onsent();
    try {
      await chats.send(chat.id, body, { replyTo: reply?.id ?? null, unlockAt: at }, reply ? { reply: replyPreview(reply) } : {});
    } catch (err) {
      error = errorText(err);
    }
  }

  const replyPreview = (m: ChatMessage) => ({
    id: m.id,
    from: m.from,
    body: m.body.slice(0, 140),
    deleted: false,
    locked: false,
    file: m.attachment ? { name: m.attachment.name, type: m.attachment.type, voice: !!m.attachment.voice } : null,
  });

  /** Send files: pictures, videos, songs or anything else (10 MB each). The text goes with the first. */
  export async function addFiles(files: File[]) {
    error = '';
    const at = unlockAt();
    if (at === undefined) return;
    let caption = text.trim();
    const reply = replyTo;
    if (files.length) {
      text = '';
      replyTo = null;
      capsule = false;
    }
    for (const file of files) {
      if (file.size > MAX_FILE) {
        error = t('{name} is too big. Files can be up to 10 MB.', { name: file.name });
        continue;
      }
      await sendFile(file, caption, reply, at);
      caption = '';
    }
  }

  async function sendFile(file: File | Blob, caption: string, reply: ChatMessage | null, at: number | null, voice?: { duration: number }) {
    const id = ++nextUpload;
    const name = file instanceof File ? file.name : t('Voice message') + '.webm';
    uploads = [...uploads, { id, name: voice ? t('Voice message') : name, done: 0 }];
    try {
      const ready = voice ? { blob: file, name, duration: voice.duration } : await prepare(file as File);
      const up = await chats.upload(chat.id, ready.blob, ready.name, (done) => {
        const u = uploads.find((x) => x.id === id);
        if (u) u.done = done;
      });
      onsent();
      await chats.send(
        chat.id,
        caption,
        {
          replyTo: reply?.id ?? null,
          unlockAt: at,
          attachment: { key: up.key, width: 'width' in ready ? ready.width : undefined, height: 'height' in ready ? ready.height : undefined, duration: ready.duration, voice: !!voice },
        },
        reply ? { reply: replyPreview(reply) } : {},
      );
    } catch (err) {
      error = errorText(err);
    } finally {
      uploads = uploads.filter((u) => u.id !== id);
    }
  }

  function pick() {
    const files = [...(picker?.files ?? [])];
    if (picker) picker.value = '';
    addFiles(files);
  }

  function onpaste(e: ClipboardEvent) {
    const files = [...(e.clipboardData?.files ?? [])];
    if (!files.length) return;
    e.preventDefault();
    addFiles(files);
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send();
    } else if (e.key === 'Escape') {
      if (editing) {
        editing = null;
        text = '';
      } else if (replyTo) {
        replyTo = null;
      }
    } else if (e.key === 'ArrowUp' && !text && !editing) {
      // Up in an empty box edits your last message.
      const mine = [...(chats.threads[chat.id]?.messages ?? [])].reverse().find((m) => m.from === me && m.kind === 'text' && !m.deleted && !m.pending && m.body);
      if (mine) {
        e.preventDefault();
        editing = mine;
      }
    }
  }

  function oninput() {
    if (!editing && text.trim()) chats.sendTyping(chat.id);
  }

  // --- Voice messages ---

  async function record() {
    error = '';
    if (!VoiceRecorder.supported) return void (error = t('Voice messages don’t work in this browser.'));
    recorder = new VoiceRecorder();
    try {
      await recorder.start();
    } catch {
      recorder = null;
      error = t('Couldn’t use your microphone.');
      return;
    }
    recording = true;
    seconds = 0;
    tickTimer = setInterval(() => {
      seconds = recorder?.seconds ?? 0;
      if (seconds >= MAX_VOICE) stopRecording(true);
    }, 200);
  }

  async function stopRecording(keep: boolean) {
    clearInterval(tickTimer);
    const r = recorder;
    recorder = null;
    recording = false;
    const result = await r?.stop(keep);
    if (!result) return;
    const at = unlockAt();
    if (at === undefined) return;
    const reply = replyTo;
    replyTo = null;
    capsule = false;
    await sendFile(result.blob, '', reply, at, { duration: result.duration });
  }

  $effect(() => () => {
    clearInterval(tickTimer);
    recorder?.stop(false);
  });

  const minOpen = $derived(new Date(Date.now() + 5 * 60_000 - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16));
  const replyLabel = $derived(
    replyTo ? replyTo.body || (replyTo.attachment ? fileLabel(replyTo.attachment) : '') : '',
  );
</script>

{#if replyTo || editing}
  <div class="context">
    <Icon name={editing ? 'edit' : 'reply'} size={14} />
    <span class="what">
      {#if editing}
        <strong>{t('Editing your message')}</strong>
      {:else if replyTo}
        <strong>{t('Replying to {name}', { name: replyTo.from === me ? t('yourself') : social.nameOf(replyTo.from) })}</strong>
        <span>{replyLabel}</span>
      {/if}
    </span>
    <button
      class="icon"
      aria-label={t('Cancel')}
      onclick={() => {
        if (editing) text = '';
        editing = null;
        replyTo = null;
      }}><Icon name="close" size={14} /></button
    >
  </div>
{/if}

{#if capsule && !editing}
  <div class="context capsule">
    <Icon name="hourglass" size={14} />
    <label class="what">
      <strong>{t('Time capsule: opens on')}</strong>
      <input type="datetime-local" bind:value={opensAt} min={minOpen} />
    </label>
    <button class="icon" aria-label={t('Not a time capsule')} onclick={() => (capsule = false)}><Icon name="close" size={14} /></button>
  </div>
{/if}

{#each uploads as u (u.id)}
  <div class="upload">
    <span>{t('Sending {name}…', { name: u.name })}</span>
    <span class="progress"><span style:width="{Math.round(u.done * 100)}%"></span></span>
  </div>
{/each}

{#if error}<p class="error composer-error" role="alert">{error}</p>{/if}

{#if recording}
  <div class="composer recording">
    <button class="icon" aria-label={t('Cancel recording')} title={t('Cancel')} onclick={() => stopRecording(false)}><Icon name="trash" size={17} /></button>
    <span class="rec"><span class="dot"></span> {duration(seconds * 1000)} / {duration(MAX_VOICE * 1000)}</span>
    <button class="icon solid" aria-label={t('Send voice message')} title={t('Send')} onclick={() => stopRecording(true)}><Icon name="send" size={16} /></button>
  </div>
{:else}
  <form class="composer" onsubmit={send}>
    {#if !editing}
      <button type="button" class="icon tool" aria-label={t('Send a picture or file')} title={t('Picture or file')} onclick={() => picker?.click()}>
        <Icon name="paperclip" size={18} />
      </button>
      <button
        type="button"
        class="icon tool"
        class:on={capsule}
        aria-pressed={capsule}
        aria-label={t('Time capsule')}
        title={t('Time capsule: opens later')}
        onclick={() => {
          capsule = !capsule;
          if (capsule && !opensAt) opensAt = new Date(Date.now() + 24 * 3600_000 - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
        }}
      >
        <Icon name="hourglass" size={17} />
      </button>
      <button type="button" class="icon tool" aria-label={t('Play a game')} title={t('Play a game')} onclick={pickGame}>
        <Icon name="gamepad" size={18} />
      </button>
      <input bind:this={picker} type="file" multiple hidden onchange={pick} />
    {/if}
    <textarea
      bind:this={input}
      bind:value={text}
      {onkeydown}
      {oninput}
      {onpaste}
      rows="1"
      maxlength="2000"
      placeholder={editing ? t('Edit your message') : t('Message {name}', { name: title })}
      aria-label={t('Message {name}', { name: title })}
      lang={i18n.lang}
    ></textarea>
    {#if text.trim() || editing}
      <button class="icon solid" aria-label={editing ? t('Save') : t('Send')} disabled={!text.trim() && !editing?.attachment}>
        <Icon name={editing ? 'check' : 'send'} size={16} />
      </button>
    {:else}
      <button type="button" class="icon solid" aria-label={t('Record a voice message')} title={t('Voice message')} onclick={record}>
        <Icon name="mic" size={17} />
      </button>
    {/if}
  </form>
{/if}

<style>
  .context {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 12px;
    padding: 7px 8px 7px 12px;
    border-left: 3px solid var(--accent);
    border-radius: 8px;
    background: var(--hover);
    color: var(--muted);
    font-size: 12.5px;
  }
  .context + .context {
    margin-top: 6px;
  }
  .context .what {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .context strong {
    color: var(--text);
  }
  .context .what span {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .capsule .what {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .capsule input {
    padding: 3px 6px;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--card);
    color: var(--text);
    font: inherit;
  }
  .upload {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 6px 14px 0;
    color: var(--muted);
    font-size: 12.5px;
  }
  .progress {
    height: 3px;
    border-radius: 2px;
    background: var(--hover);
    overflow: hidden;
  }
  .progress span {
    display: block;
    height: 100%;
    background: var(--accent);
    transition: width 0.2s;
  }
  .composer-error {
    margin: 6px 0 0;
    padding: 0 14px;
  }
  .composer {
    display: flex;
    align-items: flex-end;
    gap: 6px;
    padding: 10px 12px 12px;
    border-top: 1px solid var(--border);
  }
  .context ~ .composer,
  .upload ~ .composer {
    margin-top: 8px;
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
    flex: none;
    width: 36px;
    height: 36px;
    border-radius: 12px;
  }
  .tool {
    color: var(--muted);
  }
  .tool:hover,
  .tool.on {
    color: var(--text);
    background: var(--hover);
  }
  .recording {
    align-items: center;
  }
  .rec {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    font-variant-numeric: tabular-nums;
  }
  .rec .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--danger);
    animation: blink 1.2s ease-in-out infinite;
  }
  @keyframes blink {
    50% {
      opacity: 0.3;
    }
  }
</style>
