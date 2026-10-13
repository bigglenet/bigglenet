<script lang="ts">
  import { account } from '../lib/account.svelte';
  import { api, apiFetch, errorText } from '../lib/api';
  import { browser, type Tab } from '../lib/browser.svelte';
  import { SERVER } from '../lib/config';
  import type { EasySite } from '../lib/easysite';
  import { readHead, writeHead, type HeadMeta } from '../lib/headmeta';
  import { plural, t } from '../lib/i18n.svelte';
  import { RoomLink, type RoomEvent } from '../lib/rooms';
  import { sites, type MySite } from '../lib/sites.svelte';
  import { siteHome, siteHost } from '../lib/url';
  import Avatar from './Avatar.svelte';
  import EasyEditor from './EasyEditor.svelte';
  import Icon from './Icon.svelte';
  import PreviewPane from './PreviewPane.svelte';
  import SiteManage from './SiteManage.svelte';

  let { tab, name }: { tab: Tab; name: string } = $props();

  type FileInfo = { path: string; type: string; size: number; updatedAt: number };
  type Info = {
    site: MySite;
    files: FileInfo[];
    limits: { file: number; site: number; files: number };
    /** Changes not live yet. Live sites keep changes as drafts until someone presses Publish. */
    changes: { path: string; kind: 'added' | 'changed' | 'deleted' }[];
    drafts: boolean;
    owner: string | null;
    editors: string[];
    club: { id: number; name: string } | null;
    tags: string[];
    webrings: { id: number; name: string }[];
    /** The owner (or an admin): may add editors, change the address, delete the site. */
    canManage: boolean;
  };

  const TEXT = /\.(bhtml|css|js|json|txt|svg)$/i;
  const AUTOSAVE_MS = 900;

  let info = $state<Info | null>(null);
  let loadError = $state('');
  let base = $state('');
  let selected = $state('index.bhtml');
  let contents = $state<Record<string, string>>({});
  let saved = $state<Record<string, string>>({});
  let saving = $state(false);
  let saveError = $state('');
  let previewPath = $state('index.bhtml');
  let previewVersion = $state(0);
  let pane = $state<'files' | 'code' | 'preview'>('code');
  let newFile = $state('');
  let fileError = $state('');
  let confirmDelete = $state<string | null>(null);
  let confirmSite = $state(false);
  let upload = $state<HTMLInputElement>();
  let editor = $state<HTMLTextAreaElement>();
  // Sites made with the easy editor keep their blocks in site.json.
  let easy = $state<EasySite | null>(null);
  let mode = $state<'easy' | 'code'>('code');
  let easyState = $state({ saving: false, error: '', dirty: false });
  // Site settings (people, stats, sharing), and publishing drafts.
  let manage = $state<null | 'people' | 'stats' | 'sharing' | 'nox'>(null);
  let publishing = $state(false);
  let confirmDiscard = $state(false);

  const dirty = $derived(Object.keys(contents).filter((p) => contents[p] !== saved[p]));
  const used = $derived(info?.files.reduce((n, f) => n + f.size, 0) ?? 0);
  const enc = encodeURIComponent;
  const filePath = (p: string) => `/api/sites/${enc(name)}/files/${p.split('/').map(enc).join('/')}`;

  async function refresh() {
    try {
      info = await api<Info>('GET', `/api/sites/${enc(name)}`);
      loadError = '';
    } catch (e) {
      loadError = errorText(e);
    }
  }

  async function freshBase() {
    const r = await api<{ base: string }>('POST', `/api/sites/${enc(name)}/preview`);
    base = SERVER + r.base;
  }

  async function loadEasy() {
    if (!info?.files.some((f) => f.path === 'site.json')) return;
    try {
      easy = await (await apiFetch('GET', filePath('site.json'))).json();
      mode = 'easy';
    } catch {}
  }

  $effect(() => {
    void name;
    contents = {};
    saved = {};
    easy = null;
    mode = 'code';
    refresh().then(async () => {
      await loadEasy();
      await select('index.bhtml');
      // biggle://sites/name#stats opens the site's stats (from My sites).
      if (tab.url.endsWith('#stats') && info) openManage('stats');
    });
    freshBase().catch(() => {});
    // Preview links last an hour; renew them while the editor is open.
    const timer = setInterval(() => freshBase().catch(() => {}), 50 * 60 * 1000);
    return () => clearInterval(timer);
  });

  async function select(path: string) {
    selected = path;
    if (path.endsWith('.bhtml')) previewPath = path;
    if (TEXT.test(path) && contents[path] === undefined) {
      try {
        const text = await (await apiFetch('GET', filePath(path))).text();
        contents[path] = text;
        saved[path] = text;
      } catch (e) {
        saveError = errorText(e);
      }
    }
    if (window.matchMedia('(max-width: 899px)').matches) pane = 'code';
  }

  async function save(path = selected) {
    const text = contents[path];
    if (text === undefined || text === saved[path]) return;
    saving = true;
    saveError = '';
    try {
      await apiFetch('PUT', filePath(path), text, 'text/plain; charset=utf-8');
      saved[path] = text;
      previewVersion++;
      refresh();
      tell({ kind: 'saved', path, text: text.length <= SEND_MAX ? text : undefined });
    } catch (e) {
      saveError = errorText(e);
    } finally {
      saving = false;
    }
  }

  // Save a moment after you stop typing.
  $effect(() => {
    const path = selected;
    const text = contents[path];
    if (text === undefined || text === saved[path]) return;
    typingIn(path);
    const timer = setTimeout(() => save(path), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  });

  // --- Editing together ---
  // Everyone with the site open in the editor shares a room (server/src/rooms.ts). You see who's
  // here; when someone saves a file, everyone else gets it (unless they're changing it too); and
  // a file someone is typing in is read-only for the others until they stop, so two people
  // never overwrite each other's work.
  type Said =
    | { kind: 'typing'; path: string }
    | { kind: 'saved'; path: string; text?: string }
    | { kind: 'easy'; json?: string }
    | { kind: 'files'; reload?: boolean };
  const SEND_MAX = 12_000;
  const TYPING_MS = 2500;

  let room: RoomLink | null = null;
  let me = '';
  let present = $state<string[]>([]);
  let typing = $state<Record<string, string>>({});
  let easyLock = $state('');
  let easyRemote = $state<{ json: string; n: number } | null>(null);
  const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let lastTyping = 0;

  $effect(() => {
    const site = name;
    if (!account.token) return;
    let alive = true;
    const link = new RoomLink(site, 'editor', (e) => alive && heard(e));
    room = link;
    link
      .open()
      .then(({ you }) => {
        me = you;
        if (alive) present = link.members.filter((m) => m !== me);
      })
      .catch(() => {});
    return () => {
      alive = false;
      link.close();
      room = null;
      present = [];
      typing = {};
      easyLock = '';
    };
  });

  function tell(data: Said) {
    room?.send(data);
  }

  /** You're changing this file: say so, at most once a second. */
  function typingIn(path: string) {
    const now = Date.now();
    if (now - lastTyping < 1000) return;
    lastTyping = now;
    tell({ kind: 'typing', path });
  }

  /** Someone else is changing `path` (site.json is the easy editor). */
  function lock(path: string, user: string) {
    if (path === 'site.json' && easy) easyLock = user;
    else typing[path] = user;
    clearTimeout(typingTimers.get(path));
    typingTimers.set(
      path,
      setTimeout(() => {
        delete typing[path];
        if (path === 'site.json') easyLock = '';
      }, TYPING_MS),
    );
  }

  function unlock(path: string) {
    clearTimeout(typingTimers.get(path));
    delete typing[path];
    if (path === 'site.json') easyLock = '';
  }

  async function heard(e: RoomEvent) {
    if (e.type !== 'message') {
      present = (room?.members ?? []).filter((m) => m !== me);
      return;
    }
    const said = e.data as Said;
    if (!said || typeof said !== 'object') return;
    if (said.kind === 'typing' && typeof said.path === 'string') {
      lock(said.path, e.from);
    } else if (said.kind === 'saved' && typeof said.path === 'string') {
      unlock(said.path);
      // Take their version, unless you've changed it too (then yours saves over theirs).
      if (contents[said.path] !== undefined && contents[said.path] === saved[said.path]) {
        const text = typeof said.text === 'string' ? said.text : await fetchText(said.path);
        if (text !== null && contents[said.path] === saved[said.path]) {
          contents[said.path] = text;
          saved[said.path] = text;
        }
      }
      previewVersion++;
      refresh();
    } else if (said.kind === 'easy') {
      unlock('site.json');
      if (easy && !easyState.dirty) {
        const json = typeof said.json === 'string' ? said.json : await fetchText('site.json');
        if (json) easyRemote = { json, n: (easyRemote?.n ?? 0) + 1 };
      }
      previewVersion++;
      refresh();
    } else if (said.kind === 'files') {
      if (said.reload) await reloadAll();
      else await refresh();
      previewVersion++;
    }
  }

  async function fetchText(path: string): Promise<string | null> {
    try {
      return await (await apiFetch('GET', filePath(path))).text();
    } catch {
      return null;
    }
  }

  /** Load every file again (drafts were thrown away), keeping what you're still changing. */
  async function reloadAll() {
    await refresh();
    for (const path of Object.keys(contents)) {
      if (contents[path] !== saved[path]) continue;
      if (!info?.files.some((f) => f.path === path)) {
        delete contents[path];
        delete saved[path];
        continue;
      }
      const text = await fetchText(path);
      if (text !== null && contents[path] === saved[path]) {
        contents[path] = text;
        saved[path] = text;
      }
    }
    if (easy && !easyState.dirty) {
      const json = await fetchText('site.json');
      if (json) easyRemote = { json, n: (easyRemote?.n ?? 0) + 1 };
    }
    if (!info?.files.some((f) => f.path === selected)) await select('index.bhtml');
  }

  // --- Publishing (live sites) ---
  const busy = $derived(saving || dirty.length > 0 || easyState.saving || easyState.dirty);

  async function publish() {
    if (publishing) return;
    publishing = true;
    saveError = '';
    try {
      for (const path of dirty) await save(path);
      await api('POST', `/api/sites/${enc(name)}/publish`);
      await refresh();
      sites.refreshMine();
      tell({ kind: 'files' });
      browser.say(t('Published. Visitors see the new version now.'));
    } catch (e) {
      saveError = errorText(e);
    } finally {
      publishing = false;
    }
  }

  async function discard() {
    confirmDiscard = false;
    saveError = '';
    try {
      await api('POST', `/api/sites/${enc(name)}/discard`);
      contents = {};
      saved = {};
      easy = null;
      await refresh();
      await loadEasy();
      await select(info?.files.some((f) => f.path === selected) ? selected : 'index.bhtml');
      previewVersion++;
      sites.refreshMine();
      tell({ kind: 'files', reload: true });
    } catch (e) {
      saveError = errorText(e);
    }
  }

  const changeOf = (path: string) => info?.changes.find((c) => c.path === path)?.kind;

  // --- Site settings ---
  const images = $derived(info?.files.filter((f) => /^image\//.test(f.type) || /\.(png|jpe?g|gif|webp|svg|ico)$/i.test(f.path)).map((f) => f.path) ?? []);
  const head = $derived<HeadMeta | null>(!easy && contents['index.bhtml'] !== undefined ? readHead(contents['index.bhtml']) : null);

  async function openManage(section: 'people' | 'stats' | 'sharing' | 'nox' = 'people') {
    if (!easy && contents['index.bhtml'] === undefined) {
      const text = await fetchText('index.bhtml');
      if (text !== null) {
        contents['index.bhtml'] = text;
        saved['index.bhtml'] = text;
      }
    }
    manage = section;
  }

  async function setHead(meta: HeadMeta) {
    const html = contents['index.bhtml'];
    if (html === undefined) return;
    contents['index.bhtml'] = writeHead(html, meta);
    manage = null;
    await save('index.bhtml');
  }

  function leftSite() {
    manage = null;
    sites.refreshMine();
    browser.go(tab, 'biggle://sites');
  }

  async function toMode(next: 'easy' | 'code') {
    if (next === 'code') {
      // Pick up what the easy editor just wrote.
      contents = {};
      saved = {};
      await refresh();
      await select(selected);
      previewVersion++;
    }
    mode = next;
  }

  function onkeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      save();
    } else if (e.key === 'Tab' && !e.shiftKey && editor) {
      e.preventDefault();
      editor.setRangeText('  ', editor.selectionStart, editor.selectionEnd, 'end');
      contents[selected] = editor.value;
    }
  }

  function starter(path: string): string {
    if (path.endsWith('.bhtml')) {
      const title = path.replace(/\.bhtml$/, '').replace(/[-_]/g, ' ');
      return `<!bhtml 1>\n<html lang="en">\n<head>\n  <title>${title}</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <p><a href="./">← Home</a></p>\n  <h1>${title}</h1>\n  <p>Write something here.</p>\n</body>\n</html>\n`;
    }
    if (path.endsWith('.css')) return '/* Styles */\n';
    if (path.endsWith('.js')) return '// Runs in your page. Try: biggle.me().then((me) => console.log(me));\n';
    return '';
  }

  async function createFile(e: SubmitEvent) {
    e.preventDefault();
    let path = newFile.trim().replace(/\s+/g, '-');
    if (!path) return;
    if (!/\.[a-z0-9]+$/i.test(path)) path += '.bhtml';
    fileError = '';
    try {
      if (info?.files.some((f) => f.path === path)) throw new Error(`${path} already exists.`);
      await apiFetch('PUT', filePath(path), starter(path), 'text/plain; charset=utf-8');
      newFile = '';
      await refresh();
      await select(path);
      tell({ kind: 'files' });
    } catch (err) {
      fileError = errorText(err);
    }
  }

  async function uploadFiles() {
    const files = upload?.files;
    if (!files?.length) return;
    fileError = '';
    for (const file of files) {
      const path = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+/, '');
      try {
        await apiFetch('PUT', filePath(path), file, file.type || 'application/octet-stream');
      } catch (err) {
        fileError = `${file.name}: ${errorText(err)}`;
      }
    }
    if (upload) upload.value = '';
    await refresh();
    previewVersion++;
    tell({ kind: 'files' });
  }

  async function deleteFile(path: string) {
    try {
      await apiFetch('DELETE', filePath(path));
      delete contents[path];
      delete saved[path];
      confirmDelete = null;
      if (selected === path) await select('index.bhtml');
      await refresh();
      previewVersion++;
      tell({ kind: 'files' });
    } catch (err) {
      fileError = errorText(err);
    }
  }

  async function deleteSite() {
    try {
      await api('DELETE', `/api/sites/${enc(name)}`);
      await sites.refreshMine();
      browser.go(tab, 'biggle://sites');
    } catch (err) {
      saveError = errorText(err);
    }
  }

  async function askAgain() {
    try {
      await api('POST', `/api/sites/${enc(name)}/submit`);
      await refresh();
      sites.refreshMine();
    } catch (err) {
      saveError = errorText(err);
    }
  }

  function visit() {
    const path = previewPath === 'index.bhtml' ? '' : previewPath;
    if (info?.site.status === 'live') browser.newTab(siteHome(name, tld) + path, { after: tab.id });
    else browser.openPreview(name, '/' + path, tld);
  }

  // The address ending. Admins and people they trust can move a site between .biggle and .b,
  // if its other address is free. `name` is the site's key (hello, or hello.b).
  const tld = $derived(name.endsWith('.b') ? 'b' : 'biggle');
  const bare = $derived(name.replace(/\.b$/, ''));
  const canShort = $derived(!!account.user?.admin || !!account.user?.trusted);
  let tldPick = $state<HTMLSelectElement>();
  async function setTld(value: string) {
    saveError = '';
    try {
      const { site } = await api<{ site: MySite }>('PATCH', `/api/sites/${enc(name)}`, { tld: value });
      sites.refreshMine();
      browser.go(tab, `biggle://sites/${site.name}`, 'replace');
    } catch (err) {
      const message = (saveError = errorText(err));
      if (tldPick) tldPick.value = tld;
      setTimeout(() => saveError === message && (saveError = ''), 6000);
    }
  }

  const kb = (n: number) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`);
  const imageUrl = (path: string) => base && `${base}${path}?v=${info?.files.find((f) => f.path === path)?.updatedAt}`;
</script>

<div class="editor">
  <header class="bar">
    <button class="icon" aria-label="Back to my sites" title="My sites" onclick={() => browser.go(tab, 'biggle://sites')}>
      <Icon name="back" />
    </button>
    <div class="who">
      {#if canShort && info?.canManage}
        <strong class="address"
          >{bare}<select bind:this={tldPick} value={tld} onchange={(e) => setTld(e.currentTarget.value)} aria-label="Address ending" title="Address ending">
            <option value="biggle">.biggle</option>
            <option value="b">.b</option>
          </select></strong
        >
      {:else}
        <strong>{siteHost(name, tld)}</strong>
      {/if}
      <span class="state">
        {#if mode === 'easy'}
          {#if saveError}<span class="bad">{saveError}</span>{:else if easyState.saving}Saving…{:else if easyState.error}<span class="bad">{easyState.error}</span>{:else if easyState.dirty}Unsaved changes{:else}All changes saved{/if}
        {:else if saving}Saving…{:else if saveError}<span class="bad">{saveError}</span>{:else if dirty.length}Unsaved changes{:else}All changes saved{/if}
      </span>
    </div>
    {#if present.length}
      <div class="present" title={t('Also editing: {names}', { names: present.join(', ') })}>
        {#each present.slice(0, 4) as who (who)}<Avatar name={who} user={who} size={26} />{/each}
        {#if present.length > 4}<span class="more">+{present.length - 4}</span>{/if}
      </div>
    {/if}
    {#if easy}
      <button class="ghost" onclick={() => toMode(mode === 'easy' ? 'code' : 'easy')}>{mode === 'easy' ? 'Code' : 'Easy editor'}</button>
    {/if}
    <button class="ghost" onclick={visit}>{info?.site.status === 'live' ? 'Visit' : 'Preview'}</button>
    {#if info}
      <button class="icon" aria-label={t('Site settings')} title={t('People, stats and sharing')} onclick={() => openManage()}>
        <Icon name="settings" size={17} />
      </button>
    {/if}
    {#if info?.canManage}
      {#if confirmSite}
        <button class="danger" onclick={deleteSite}>Delete site</button>
        <button class="ghost" onclick={() => (confirmSite = false)}>Keep</button>
      {:else}
        <button class="icon" aria-label="Delete this site" title="Delete this site" onclick={() => (confirmSite = true)}>
          <Icon name="trash" size={16} />
        </button>
      {/if}
    {/if}
  </header>

  {#if loadError}
    <p class="banner bad">{loadError}</p>
  {:else if info}
    {#if info.site.status === 'pending'}
      <p class="banner">Waiting for an admin to approve it. Until then, only you and admins can see this site.</p>
    {:else if info.site.status === 'rejected'}
      <p class="banner bad">
        Not approved{info.site.note ? `: “${info.site.note}”` : '.'} Make some changes, then
        <button class="link" onclick={askAgain}>ask again</button>.
      </p>
    {:else if info.changes.length}
      <p class="banner draft">
        <span>
          {plural(info.changes.length, '{n} unpublished change.', '{n} unpublished changes.')}
          {t('Visitors see the site as it was until you publish.')}
        </span>
        {#if confirmDiscard}
          <button class="danger compact" onclick={discard}>{t('Throw them away')}</button>
          <button class="ghost compact" onclick={() => (confirmDiscard = false)}>{t('Keep')}</button>
        {:else}
          <button class="ghost compact" onclick={() => (confirmDiscard = true)}>{t('Discard')}</button>
          <button class="primary compact" disabled={publishing || busy} onclick={publish}>{publishing ? t('Publishing…') : t('Publish')}</button>
        {/if}
      </p>
    {:else}
      <p class="banner ok">{t('Live at {site}. Your changes wait here until you publish them.', { site: siteHost(name, tld) })}</p>
    {/if}
  {/if}

  {#if manage && info}
    <SiteManage
      {name}
      owner={info.owner}
      editors={info.editors}
      club={info.club}
      tags={info.tags}
      webrings={info.webrings}
      canManage={info.canManage}
      {head}
      {images}
      start={manage}
      onhead={setHead}
      onchange={refresh}
      onleave={leftSite}
      onclose={() => (manage = null)}
    />
  {/if}

  {#if mode === 'easy' && easy && base}
    <EasyEditor
      {name}
      bind:site={easy}
      {base}
      remote={easyRemote}
      locked={easyLock}
      onsaving={(s) => (easyState = s)}
      onedit={() => typingIn('site.json')}
      onsaved={(json) => {
        previewVersion++;
        refresh();
        tell({ kind: 'easy', json: json.length <= SEND_MAX ? json : undefined });
      }}
    />
  {:else}
  {#if easy}
    <p class="banner">This site uses the easy editor. If you change index.bhtml or style.css here, the easy editor will replace them next time you use it.</p>
  {/if}
  <div class="tabs" role="tablist">
    <button role="tab" aria-selected={pane === 'files'} onclick={() => (pane = 'files')}>Files</button>
    <button role="tab" aria-selected={pane === 'code'} onclick={() => (pane = 'code')}>Code</button>
    <button role="tab" aria-selected={pane === 'preview'} onclick={() => (pane = 'preview')}>Preview</button>
  </div>

  <div class="panes" data-pane={pane}>
    <aside class="files">
      <ul>
        {#each info?.files ?? [] as file (file.path)}
          <li class:on={file.path === selected}>
            <button class="file" onclick={() => select(file.path)}>
              <span class="file-name">{file.path}</span>
              {#if typing[file.path]}<Avatar name={typing[file.path]} user={typing[file.path]} size={16} />{/if}
              {#if dirty.includes(file.path)}<span class="dot" title="Unsaved"></span>
              {:else if changeOf(file.path)}<span class="change" title={t('Not published yet')}>{changeOf(file.path) === 'added' ? t('new') : t('edited')}</span>{/if}
              <span class="size">{kb(file.size)}</span>
            </button>
            {#if file.path !== 'index.bhtml'}
              {#if confirmDelete === file.path}
                <button class="mini danger" onclick={() => deleteFile(file.path)}>Delete</button>
              {:else}
                <button class="mini" aria-label="Delete {file.path}" onclick={() => (confirmDelete = file.path)}>
                  <Icon name="close" size={13} />
                </button>
              {/if}
            {/if}
          </li>
        {/each}
      </ul>
      <form class="new-file" onsubmit={createFile}>
        <input bind:value={newFile} placeholder="new-page.bhtml" aria-label="New file name" spellcheck="false" autocapitalize="off" />
        <button class="mini solid" aria-label="Add file"><Icon name="plus" size={15} /></button>
      </form>
      <button class="upload" onclick={() => upload?.click()}>Upload images</button>
      <input bind:this={upload} type="file" accept="image/*,.svg,.woff2" multiple hidden onchange={uploadFiles} />
      {#if fileError}<p class="small bad">{fileError}</p>{/if}
      {#if info}
        <p class="small muted">{kb(used)} of {kb(info.limits.site)} used</p>
      {/if}
    </aside>

    <section class="code">
      {#if TEXT.test(selected)}
        {#if contents[selected] !== undefined}
          {@const lockedBy = !dirty.includes(selected) ? typing[selected] : undefined}
          {#if lockedBy}
            <p class="lock"><Avatar name={lockedBy} user={lockedBy} size={18} /> {t('{who} is changing this file. You can type again when they stop.', { who: lockedBy })}</p>
          {/if}
          <textarea
            bind:this={editor}
            bind:value={contents[selected]}
            readonly={!!lockedBy}
            {onkeydown}
            spellcheck="false"
            autocapitalize="off"
            autocomplete="off"
            aria-label="Code for {selected}"
          ></textarea>
        {/if}
      {:else}
        <div class="image">
          {#if base}<img src={imageUrl(selected)} alt={selected} />{/if}
          <p class="muted small">Use it in a page with <code>&lt;img src="{selected}"&gt;</code></p>
        </div>
      {/if}
    </section>

    <section class="preview-pane">
      {#if base}
        <PreviewPane site={name} path={previewPath} {base} version={previewVersion} onnavigate={(p) => (previewPath = p)} />
      {/if}
    </section>
  </div>
  {/if}
</div>

<style>
  .address select {
    margin-left: 1px;
    padding: 0 2px;
    border: 0;
    border-radius: 6px;
    background: var(--hover);
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .editor {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--surface);
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
  }
  .who {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.25;
  }
  .state {
    font-size: 12.5px;
    color: var(--muted);
  }
  .bad {
    color: var(--danger);
  }
  .muted {
    color: var(--muted);
  }
  .small {
    font-size: 12.5px;
    margin: 8px 4px 0;
  }
  button {
    font: inherit;
    cursor: pointer;
  }
  .icon {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border: 0;
    border-radius: 9px;
    background: none;
    color: var(--text);
  }
  .icon:hover {
    background: var(--hover);
  }
  .ghost,
  .danger {
    height: 34px;
    padding: 0 14px;
    border-radius: 9px;
    font-size: 13.5px;
    font-weight: 600;
  }
  .ghost {
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--text);
  }
  .danger {
    border: 1px solid var(--danger);
    background: var(--danger);
    color: #fff;
  }

  .banner {
    margin: 0;
    padding: 8px 16px;
    font-size: 13.5px;
    background: var(--accent-soft);
  }
  .banner.ok {
    background: color-mix(in srgb, var(--online) 14%, transparent);
  }
  .banner.bad {
    background: color-mix(in srgb, var(--danger) 12%, transparent);
    color: var(--text);
  }
  .link {
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font-weight: 700;
    text-decoration: underline;
  }

  .tabs {
    display: none;
  }

  .panes {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 210px minmax(0, 1fr) minmax(0, 1fr);
  }
  .files {
    min-height: 0;
    overflow: auto;
    padding: 10px 8px;
    border-right: 1px solid var(--border);
  }
  .files ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .files li {
    display: flex;
    align-items: center;
    border-radius: 8px;
  }
  .files li.on {
    background: var(--accent-soft);
  }
  .file {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 8px;
    border: 0;
    background: none;
    color: var(--text);
    font-size: 13.5px;
    text-align: left;
  }
  .file-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: ui-monospace, Menlo, monospace;
    font-size: 12.5px;
  }
  .size {
    color: var(--muted);
    font-size: 11px;
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent);
  }
  .mini {
    display: grid;
    place-items: center;
    min-width: 26px;
    height: 26px;
    padding: 0 6px;
    border: 0;
    border-radius: 7px;
    background: none;
    color: var(--muted);
    font-size: 12px;
    font-weight: 600;
  }
  .mini.danger {
    background: var(--danger);
    color: #fff;
  }
  .mini.solid {
    background: var(--accent);
    color: var(--on-accent);
  }
  .new-file {
    display: flex;
    gap: 4px;
    margin-top: 10px;
  }
  .new-file input {
    flex: 1;
    min-width: 0;
    height: 30px;
    padding: 0 8px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--card);
    color: var(--text);
    font: 12.5px ui-monospace, Menlo, monospace;
  }
  .new-file .mini {
    height: 30px;
    min-width: 30px;
  }
  .upload {
    width: 100%;
    margin-top: 8px;
    padding: 7px;
    border: 1px dashed var(--border);
    border-radius: 8px;
    background: none;
    color: var(--muted);
    font-size: 13px;
  }

  .code {
    min-height: 0;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--border);
  }
  .lock {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    padding: 6px 12px;
    font-size: 13px;
    background: var(--accent-soft);
  }
  textarea[readonly] {
    opacity: 0.7;
  }
  .present {
    display: flex;
    align-items: center;
  }
  .present :global(.avatar) {
    margin-left: -6px;
    box-shadow: 0 0 0 2px var(--surface);
  }
  .more {
    margin-left: 4px;
    color: var(--muted);
    font-size: 12px;
  }
  .change {
    padding: 1px 6px;
    border-radius: 6px;
    background: var(--accent-soft);
    color: var(--text);
    font-size: 10.5px;
    font-weight: 600;
  }
  .banner.draft {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }
  .banner.draft span {
    flex: 1;
    min-width: 200px;
  }
  .primary {
    border: 0;
    background: var(--accent);
    color: var(--on-accent);
  }
  .primary:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .compact {
    height: 30px;
    padding: 0 12px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
  }
  textarea {
    flex: 1;
    width: 100%;
    margin: 0;
    padding: 14px 16px;
    border: 0;
    outline: 0;
    resize: none;
    background: var(--card);
    color: var(--text);
    font: 13px/1.6 ui-monospace, 'SF Mono', Menlo, monospace;
    white-space: pre;
    overflow: auto;
    tab-size: 2;
  }
  .image {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 20px;
  }
  .image img {
    max-width: 100%;
    max-height: 70%;
    border-radius: 8px;
    background: repeating-conic-gradient(#ddd 0% 25%, #fff 0% 50%) 50% / 16px 16px;
  }
  .preview-pane {
    min-height: 0;
  }

  @media (max-width: 899px) {
    .tabs {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      padding: 6px 12px;
      gap: 4px;
      border-bottom: 1px solid var(--border);
    }
    .tabs button {
      padding: 7px;
      border: 0;
      border-radius: 8px;
      background: none;
      color: var(--muted);
      font-size: 13.5px;
      font-weight: 600;
    }
    .tabs button[aria-selected='true'] {
      background: var(--accent-soft);
      color: var(--text);
    }
    .panes {
      grid-template-columns: 1fr;
    }
    .panes > * {
      display: none;
      border: 0;
    }
    .panes[data-pane='files'] .files,
    .panes[data-pane='code'] .code,
    .panes[data-pane='preview'] .preview-pane {
      display: flex;
      flex-direction: column;
    }
    .panes[data-pane='files'] .files {
      display: block;
    }
  }
</style>
