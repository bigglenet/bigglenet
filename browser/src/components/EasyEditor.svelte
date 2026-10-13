<script lang="ts">
  // The easy site editor: pick a look, then add and edit blocks. No code.
  import { account } from '../lib/account.svelte';
  import { api, apiFetch, errorText } from '../lib/api';
  import {
    BLOCK_NAMES,
    FONTS,
    newBlock,
    renderFiles,
    renderIndex,
    renderStyle,
    THEMES,
    type BlockType,
    type EasySite,
  } from '../lib/easysite';
  import { answerCall, closeScope, newScope, roomSend } from '../lib/frame';
  import { renderPage } from '../lib/loader';
  import { parse, type SiteUrl } from '../lib/url';
  import { t } from '../lib/i18n.svelte';
  import { untrack } from 'svelte';
  import Icon from './Icon.svelte';

  let {
    name,
    site = $bindable(),
    base,
    remote = null,
    locked = '',
    onsaving,
    onedit,
    onsaved,
  }: {
    name: string;
    site: EasySite;
    base: string;
    /** Someone else's saved version, editing together: taken unless you've changed something. */
    remote?: { json: string; n: number } | null;
    /** Who else is changing the site right now: until they stop, it's their turn. */
    locked?: string;
    onsaving: (state: { saving: boolean; error: string; dirty: boolean }) => void;
    onedit?: () => void;
    onsaved?: (json: string) => void;
  } = $props();

  const ADD: BlockType[] = [
    'heading', 'text', 'image', 'button', 'divider', 'greeting', 'counter', 'visits', 'guestbook',
    'poll', 'comments', 'like', 'contact', 'wall', 'leaderboard', 'online', 'newsites', 'embed', 'webring',
  ];
  const AUTOSAVE_MS = 800;

  let savedJson = $state(JSON.stringify(site));
  let pane = $state<'edit' | 'preview'>('edit');
  let uploadFor = $state<string | null>(null);
  let upload = $state<HTMLInputElement>();
  let iframe = $state<HTMLIFrameElement>();

  const json = $derived(JSON.stringify(site));
  // Webrings to pick from, once there's a webring block.
  let rings = $state<{ id: number; name: string }[] | null>(null);
  $effect(() => {
    if (rings === null && site.blocks.some((b) => b.type === 'webring')) {
      rings = [];
      api<{ rings: { id: number; name: string }[] }>('GET', '/api/webrings').then(
        (r) => (rings = r.rings),
        () => {},
      );
    }
  });
  // Pictures uploaded to the site, for the preview picture and icon.
  const images = $derived([...new Set(site.blocks.flatMap((b) => (b.type === 'image' && b.src ? [b.src] : [])))]);
  const dirty = $derived(json !== savedJson);
  const enc = encodeURIComponent;

  // Live preview straight from the blocks, with the styles inlined so it updates instantly.
  // Redrawn a moment after you stop typing, so it doesn't flicker on every key.
  const fresh = $derived.by(() => {
    const u = parse(`biggle://${name}.biggle/`) as SiteUrl;
    const html = renderIndex(site).replace('<link rel="stylesheet" href="style.css">', `<style>${renderStyle(site)}</style>`);
    const user = account.user && { username: account.user.username };
    return renderPage(u, html, user, base) ?? '';
  });
  let srcdoc = $state('');
  $effect(() => {
    const next = fresh;
    if (!srcdoc) return void (srcdoc = next);
    const timer = setTimeout(() => (srcdoc = next), 250);
    return () => clearTimeout(timer);
  });
  const previewBg = $derived(THEMES.find((t) => t.id === site.theme)?.bg ?? '#fff');

  // Save a moment after the last change.
  $effect(() => {
    const snapshot = json;
    if (snapshot === savedJson) return;
    untrack(() => onedit?.());
    const timer = setTimeout(() => save(snapshot), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  });

  $effect(() => onsaving({ saving: false, error: '', dirty }));

  // Someone else saved: take their version, unless you're in the middle of a change.
  $effect(() => {
    const r = remote;
    if (!r) return;
    untrack(() => {
      if (json !== savedJson) return;
      const next = JSON.parse(r.json) as EasySite;
      savedJson = JSON.stringify(next);
      site = next;
    });
  });

  async function save(snapshot: string) {
    onsaving({ saving: true, error: '', dirty: true });
    try {
      const files = renderFiles(JSON.parse(snapshot));
      for (const [path, text] of Object.entries(files)) {
        await apiFetch('PUT', `/api/sites/${enc(name)}/files/${path}`, text, 'text/plain; charset=utf-8');
      }
      savedJson = snapshot;
      onsaving({ saving: false, error: '', dirty: JSON.stringify(site) !== snapshot });
      onsaved?.(snapshot);
    } catch (e) {
      onsaving({ saving: false, error: errorText(e), dirty: true });
    }
  }

  function move(i: number, by: number) {
    const j = i + by;
    if (j < 0 || j >= site.blocks.length) return;
    const blocks = [...site.blocks];
    [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
    site.blocks = blocks;
  }

  function add(type: BlockType) {
    const block = newBlock(type);
    site.blocks = [...site.blocks, block];
    if (type === 'image') pickImage(block.id);
  }

  function pickImage(id: string) {
    uploadFor = id;
    upload?.click();
  }

  async function uploadImage() {
    const file = upload?.files?.[0];
    const id = uploadFor;
    if (!file || !id) return;
    const path = 'images/' + file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+/, '');
    try {
      await apiFetch('PUT', `/api/sites/${enc(name)}/files/${path}`, file, file.type || 'application/octet-stream');
      const block = site.blocks.find((b) => b.id === id);
      if (block?.type === 'image') {
        block.src = path;
        if (!block.alt) block.alt = file.name.replace(/\.[^.]+$/, '');
      }
    } catch (e) {
      onsaving({ saving: false, error: errorText(e), dirty: true });
    }
    if (upload) upload.value = '';
  }

  // Let the preview's own scripts (like the visit counter) work.
  const scope = $derived(newScope(name, '/', (m) => iframe?.contentWindow?.postMessage({ biggle: 1, ...m }, '*'), { preview: true }));
  $effect(() => {
    const s = scope;
    return () => closeScope(s);
  });
  $effect(() => {
    const onmessage = (e: MessageEvent) => {
      if (!iframe || e.source !== iframe.contentWindow) return;
      const msg = e.data;
      if (msg?.biggle !== 1) return;
      if (msg.type === 'room-send') return roomSend(scope, msg.id, msg.data);
      if (msg.type !== 'call') return;
      const reply = (m: Record<string, unknown>) => iframe?.contentWindow?.postMessage({ biggle: 1, ...m }, '*');
      // The preview gets an empty, throwaway biggle.storage, so it shows what a first-time
      // visitor sees and doesn't count your edits as visits. It can't post anything either.
      if (String(msg.method).startsWith('storage.')) {
        reply({ type: 'result', id: msg.id, value: msg.method === 'storage.keys' ? [] : undefined });
      } else {
        answerCall(scope, msg, reply);
      }
    };
    window.addEventListener('message', onmessage);
    return () => window.removeEventListener('message', onmessage);
  });
</script>

<div class="tabs" role="tablist">
  <button role="tab" aria-selected={pane === 'edit'} onclick={() => (pane = 'edit')}>Edit</button>
  <button role="tab" aria-selected={pane === 'preview'} onclick={() => (pane = 'preview')}>Preview</button>
</div>

<div class="easy" data-pane={pane}>
  <div class="controls" inert={!!locked && !dirty}>
    {#if locked && !dirty}
      <p class="lock">{t('{who} is changing the site. You can edit again when they stop.', { who: locked })}</p>
    {/if}
    <section>
      <h3>Look</h3>
      <div class="themes">
        {#each THEMES as t (t.id)}
          <button
            class="swatch"
            class:on={site.theme === t.id}
            style:background={t.bg}
            style:--dot={t.accent}
            aria-label="{t.name} theme"
            title={t.name}
            onclick={() => (site.theme = t.id)}
          ><span></span></button>
        {/each}
      </div>
      <div class="fonts">
        {#each FONTS as f (f.id)}
          <button class="chip" class:on={site.font === f.id} style:font-family={f.stack} onclick={() => (site.font = f.id)}>
            {f.name}
          </button>
        {/each}
      </div>
    </section>

    <section>
      <h3>Top of the page</h3>
      <div class="top">
        <input class="emoji" bind:value={site.emoji} maxlength="4" aria-label="Emoji" />
        <input bind:value={site.title} placeholder="Title" aria-label="Title" maxlength="80" />
      </div>
      <input bind:value={site.tagline} placeholder="A short line under the title" aria-label="Tagline" maxlength="160" />
    </section>

    <section>
      <h3>{t('Link preview and icon')}</h3>
      <textarea bind:value={site.description} rows="2" maxlength="200" placeholder={t('A line about your site, shown when someone shares a link to it')} aria-label={t('Description')}></textarea>
      <div class="image-row">
        <select bind:value={site.previewImage} aria-label={t('Picture for link previews')}>
          <option value={undefined}>{t('No preview picture')}</option>
          {#each images as path (path)}<option value={path}>{path}</option>{/each}
        </select>
        <select bind:value={site.icon} aria-label={t('Tab icon')}>
          <option value={undefined}>{t('Icon: the emoji')} {site.emoji}</option>
          {#each images as path (path)}<option value={path}>{t('Icon: {file}', { file: path })}</option>{/each}
        </select>
      </div>
      {#if !images.length}<p class="hint">{t('Add a picture block to upload pictures you can use here.')}</p>{/if}
    </section>

    <section>
      <h3>Blocks</h3>
      {#each site.blocks as b, i (b.id)}
        <div class="block">
          <div class="block-head">
            <span>{BLOCK_NAMES[b.type]}</span>
            <button class="mini" aria-label="Move up" disabled={i === 0} onclick={() => move(i, -1)}>↑</button>
            <button class="mini" aria-label="Move down" disabled={i === site.blocks.length - 1} onclick={() => move(i, 1)}>↓</button>
            <button class="mini" aria-label="Remove {BLOCK_NAMES[b.type]}" onclick={() => (site.blocks = site.blocks.filter((x) => x.id !== b.id))}>
              <Icon name="close" size={13} />
            </button>
          </div>
          {#if b.type === 'heading'}
            <input bind:value={b.text} aria-label="Heading" />
          {:else if b.type === 'text'}
            <textarea bind:value={b.text} rows="3" aria-label="Text"></textarea>
          {:else if b.type === 'image'}
            <div class="image-row">
              <button class="pick" onclick={() => pickImage(b.id)}>{b.src ? 'Change picture' : 'Choose a picture'}</button>
              <input bind:value={b.alt} placeholder="Describe it (for screen readers)" aria-label="Picture description" />
            </div>
          {:else if b.type === 'button'}
            <input bind:value={b.label} placeholder="Button text" aria-label="Button text" />
            <input bind:value={b.url} placeholder="Where it goes: friend.biggle or a web address" aria-label="Button link" />
          {:else if b.type === 'greeting'}
            <p class="hint">Says hi to each visitor by their Biggle name.</p>
          {:else if b.type === 'counter'}
            <p class="hint">Shows each visitor how many times they've come by.</p>
          {:else if b.type === 'visits'}
            <p class="hint">Shows how many visits your site has had from everyone (each person counts once a day).</p>
          {:else if b.type === 'guestbook'}
            <p class="hint">Visitors can leave you a note. You can take down any note on your site.</p>
          {:else if b.type === 'poll'}
            <input bind:value={b.question} placeholder={t('The question')} aria-label={t('Poll question')} />
            <textarea
              rows="3"
              aria-label={t('Answers, one per line')}
              placeholder={t('Answers, one per line')}
              value={b.options.join('\n')}
              oninput={(e) => (b.options = e.currentTarget.value.split('\n').slice(0, 12))}
            ></textarea>
          {:else if b.type === 'comments'}
            <p class="hint">{t('Visitors can comment on the page. You can take down any comment.')}</p>
          {:else if b.type === 'like'}
            <p class="hint">{t('A heart visitors can tap, with how many people like your site.')}</p>
          {:else if b.type === 'contact'}
            <p class="hint">{t('Visitors can send you a message. It arrives in your chats or notifications.')}</p>
          {:else if b.type === 'wall'}
            <p class="hint">{t('A drawing everyone adds to, live. You can clear it.')}</p>
          {:else if b.type === 'leaderboard'}
            <input bind:value={b.title} placeholder={t('Title')} aria-label={t('Leaderboard title')} />
            <input bind:value={b.board} placeholder="main" aria-label={t('Leaderboard name (your game uses it)')} />
            <p class="hint">{t('Shows the best scores your game sends with biggle.scores.submit("{board}", score).', { board: b.board || 'main' })}</p>
          {:else if b.type === 'online'}
            <p class="hint">{t('How many people are on the Bigglenet right now.')}</p>
          {:else if b.type === 'newsites'}
            <p class="hint">{t('The five newest sites on the Bigglenet.')}</p>
          {:else if b.type === 'embed'}
            <input bind:value={b.url} placeholder="friend.biggle/page" aria-label={t('Page to show')} />
            <p class="hint">{t('Shows another .biggle page inside yours.')}</p>
          {:else if b.type === 'webring'}
            <select bind:value={b.ring} aria-label={t('Webring')}>
              <option value={null}>{t('Pick a webring…')}</option>
              {#each rings ?? [] as r (r.id)}<option value={r.id}>{r.name}</option>{/each}
            </select>
            <p class="hint">{t('Links to the sites before and after yours in the ring. Add your site to the ring in Nox → Webrings first.')}</p>
          {:else}
            <p class="hint">A line between sections.</p>
          {/if}
        </div>
      {/each}

      <div class="add">
        {#each ADD as type (type)}
          <button class="chip" onclick={() => add(type)}>+ {BLOCK_NAMES[type]}</button>
        {/each}
      </div>
    </section>
    <input bind:this={upload} type="file" accept="image/*" hidden onchange={uploadImage} />
  </div>

  <div class="preview" style:background={previewBg}>
    <iframe bind:this={iframe} {srcdoc} title="Preview of {name}.biggle" sandbox="allow-scripts allow-modals"></iframe>
  </div>
</div>

<style>
  .tabs {
    display: none;
  }
  .easy {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(320px, 420px) 1fr;
  }
  .controls {
    min-height: 0;
    overflow: auto;
    padding: 16px 18px 40px;
    border-right: 1px solid var(--border);
  }
  section {
    margin-bottom: 22px;
  }
  h3 {
    margin: 0 0 10px;
    font-size: 12px;
    font-weight: 700;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.07em;
  }
  button {
    font: inherit;
    cursor: pointer;
  }
  .themes {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 12px;
  }
  .swatch {
    position: relative;
    width: 44px;
    height: 44px;
    padding: 0;
    border: 2px solid var(--border);
    border-radius: 50%;
  }
  .swatch span {
    position: absolute;
    inset: 13px;
    border-radius: 50%;
    background: var(--dot);
  }
  .swatch.on {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .fonts,
  .add {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    padding: 7px 12px;
    border: 1px solid var(--border);
    border-radius: 18px;
    background: var(--card);
    color: var(--text);
    font-size: 13.5px;
  }
  .chip.on {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--on-accent);
  }
  .add .chip {
    border-style: dashed;
  }
  input,
  textarea,
  select {
    width: 100%;
    margin-bottom: 8px;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--card);
    color: var(--text);
    font: inherit;
    font-size: 15px;
  }
  input:focus,
  textarea:focus,
  select:focus {
    outline: 0;
    border-color: var(--accent);
  }
  textarea {
    resize: vertical;
  }
  .top {
    display: flex;
    gap: 8px;
  }
  .top .emoji {
    flex: none;
    width: 56px;
    font-size: 22px;
    text-align: center;
  }
  .block {
    margin-bottom: 10px;
    padding: 10px 12px 4px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--surface);
  }
  .block-head {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-bottom: 8px;
  }
  .block-head span {
    flex: 1;
    font-size: 13px;
    font-weight: 700;
  }
  .mini {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border: 0;
    border-radius: 7px;
    background: none;
    color: var(--muted);
  }
  .mini:hover:not(:disabled) {
    background: var(--hover);
    color: var(--text);
  }
  .mini:disabled {
    opacity: 0.3;
  }
  .hint {
    margin: 0 0 8px;
    color: var(--muted);
    font-size: 13.5px;
  }
  .image-row {
    display: flex;
    flex-direction: column;
  }
  .pick {
    margin-bottom: 8px;
    padding: 10px;
    border: 1px dashed var(--border);
    border-radius: 10px;
    background: var(--card);
    color: var(--text);
  }
  .preview {
    min-height: 0;
    background: #fff;
  }
  iframe {
    display: block;
    width: 100%;
    height: 100%;
    border: 0;
  }

  @media (max-width: 899px) {
    .tabs {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px;
      padding: 6px 12px;
      border-bottom: 1px solid var(--border);
    }
    .tabs button {
      padding: 7px;
      border: 0;
      border-radius: 8px;
      background: none;
      color: var(--muted);
      font-weight: 600;
    }
    .tabs button[aria-selected='true'] {
      background: var(--accent-soft);
      color: var(--text);
    }
    .easy {
      grid-template-columns: 1fr;
    }
    .easy[data-pane='edit'] .preview,
    .easy[data-pane='preview'] .controls {
      display: none;
    }
    .controls {
      border: 0;
    }
  }
  .lock {
    position: sticky;
    top: 0;
    z-index: 1;
    margin: 0 0 8px;
    padding: 8px 12px;
    border-radius: 10px;
    background: var(--accent-soft);
    font-size: 13px;
  }
  .controls[inert] section {
    opacity: 0.6;
  }
</style>
