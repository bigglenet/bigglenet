<script lang="ts">
  import { account } from '../lib/account.svelte';
  import { api, errorText } from '../lib/api';
  import { browser, type Tab } from '../lib/browser.svelte';
  import { renderFiles, starterSite, THEMES, type Theme } from '../lib/easysite';
  import { filesSource, importSite, pickedFiles, uploadSite, webSource, type Skipped, type Source } from '../lib/importer';
  import { sites, type MySite } from '../lib/sites.svelte';
  import { unzip } from '../lib/unzip';
  import { NAME_RE, siteHome, siteHost } from '../lib/url';
  import Icon from './Icon.svelte';

  let { tab }: { tab: Tab } = $props();

  let mode = $state<'create' | 'import' | null>(null);
  let name = $state('');
  let title = $state('');
  let theme = $state<Theme>('sunset');
  let withCode = $state(false);
  let availability = $state<{ name: string; ok: boolean; reason: string | null } | null>(null);
  let busy = $state(false);
  let error = $state('');

  // Importing a site that already exists, from its address or its files.
  let from = $state<'link' | 'files'>('link');
  let link = $state('');
  // Admins can link a site instead of copying it: right for apps and games.
  let live = $state(false);
  let picked = $state<{ files: Map<string, Blob>; label: string } | null>(null);
  let nameEdited = false;
  let progress = $state('');
  let imported = $state<{ name: string; tld: 'biggle' | 'b'; count: number; skipped: Skipped[]; live?: boolean } | null>(null);
  let folderInput = $state<HTMLInputElement>();
  let zipInput = $state<HTMLInputElement>();

  const clean = $derived(name.trim().toLowerCase().replace(/\.(biggle|b)$/, ''));
  // Admins and people they trust can pick the shorter .b ending.
  const canShort = $derived(!!account.user?.admin || !!account.user?.trusted);
  let tld = $state<'biggle' | 'b'>('biggle');
  const atLimit = $derived(sites.limit !== null && (sites.mine?.length ?? 0) >= sites.limit);

  $effect(() => {
    if (account.token) sites.refreshMine();
  });

  // Check the name as you type. hello.biggle and hello.b are different sites.
  $effect(() => {
    const n = clean;
    const t = tld;
    availability = null;
    if (!n || !NAME_RE.test(n) || n.length < 2) return;
    const timer = setTimeout(async () => {
      try {
        const address = t === 'b' ? `${n}.b` : n;
        const r = await api<{ available: boolean; reason: string | null }>('GET', `/api/sites/available/${encodeURIComponent(address)}`);
        if (clean === n && tld === t) availability = { name: n, ok: r.available, reason: r.reason };
      } catch {}
    }, 300);
    return () => clearTimeout(timer);
  });

  async function create(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    error = '';
    try {
      const siteTitle = title.trim() || clean;
      const body = withCode
        ? { name: clean, tld, title: siteTitle, template: 'page' }
        : { name: clean, tld, title: siteTitle, files: renderFiles(starterSite(siteTitle, theme)) };
      const r = await api<{ site: MySite }>('POST', '/api/sites', body);
      await sites.refreshMine();
      browser.go(tab, `biggle://sites/${r.site.name}`);
    } catch (err) {
      error = errorText(err);
    } finally {
      busy = false;
    }
  }

  /** Suggest an address from the site being imported, until they type their own. */
  function suggest(text: string) {
    if (nameEdited) return;
    name = text.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  }

  function linkTyped() {
    const host = link.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[/.:?#]/)[0];
    suggest(host ?? '');
  }

  async function pick(input: HTMLInputElement | undefined, zip: boolean) {
    const list = input?.files;
    if (!list?.length) return;
    error = '';
    try {
      const files = zip ? await unzip(list[0]) : pickedFiles(list);
      const first = list[0];
      const label = zip ? first.name : first.webkitRelativePath ? first.webkitRelativePath.split('/')[0] : `${list.length} files`;
      picked = { files, label: `${label} (${files.size} file${files.size === 1 ? '' : 's'})` };
      suggest(label.replace(/\.zip$/i, ''));
    } catch (e) {
      error = errorText(e);
    } finally {
      if (input) input.value = '';
    }
  }

  async function importIt(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    error = '';
    progress = '';
    try {
      let source: Source;
      if (from === 'link' && live) {
        const url = webSource(link).start;
        await api('PUT', `/api/admin/names/${encodeURIComponent(clean)}`, { url: url.href, title: title.trim() || url.host, live: true, tld });
        await sites.refreshMine();
        imported = { name: clean, tld, count: 0, skipped: [], live: true };
        mode = null;
        name = title = link = '';
        nameEdited = false;
        return;
      }
      if (from === 'link') source = webSource(link);
      else if (picked) source = filesSource(picked.files);
      else throw new Error('Choose a folder or a .zip first.');
      const site = await importSite(source, (text) => (progress = text));
      await uploadSite(clean, title.trim() || site.title || clean, site, (text) => (progress = text), tld);
      await sites.refreshMine();
      imported = { name: clean, tld, count: site.files.length, skipped: site.skipped };
      mode = null;
      name = title = link = '';
      picked = null;
      nameEdited = false;
    } catch (err) {
      error = errorText(err);
    } finally {
      busy = false;
      progress = '';
    }
  }

  function start(next: 'create' | 'import') {
    mode = next;
    imported = null;
    error = '';
  }

  function open(site: MySite) {
    if (site.status === 'live') browser.newTab(siteHome(site.name, site.tld), { after: tab.id });
    else browser.openPreview(site.name, '/', site.tld);
  }

  const STATUS: Record<string, string> = { pending: 'Waiting for approval', live: 'Live', rejected: 'Not approved' };
</script>

<div class="page">
  <div class="inner">
    <header>
      <h1>My sites</h1>
      <p class="muted">Make a .biggle site right here. No hosting, no setup.</p>
    </header>

    {#if !account.user}
      <div class="empty"><p>Sign in to make your own .biggle site.</p></div>
    {:else}
      {#if sites.mine?.length}
        <ul class="sites">
          {#each sites.mine as site (site.name)}
            <li>
              <div class="site-main">
                <strong>{siteHost(site.name, site.tld)}</strong>
                <span class="muted">{site.title}</span>
                {#if site.status === 'rejected' && site.note}
                  <span class="note">“{site.note}”</span>
                {/if}
              </div>
              <span class="pill {site.status}">{STATUS[site.status]}</span>
              <button class="ghost" onclick={() => open(site)}>{site.status === 'live' ? 'Visit' : 'Preview'}</button>
              <button class="solid" onclick={() => browser.go(tab, `biggle://sites/${site.name}`)}>Edit</button>
            </li>
          {/each}
        </ul>
      {/if}

      {#if imported}
        <div class="create done">
          <h2>{siteHost(imported.name, imported.tld)} is ready</h2>
          {#if imported.live}
            <p class="muted">It's live for everyone, straight from the original site.</p>
          {:else}
            <p class="muted">
              Copied {imported.count} file{imported.count === 1 ? '' : 's'}. An admin checks it before anyone else can see it, but you can look at it and edit it now.
            </p>
          {/if}
          {#if imported.skipped.length}
            <details>
              <summary>{imported.skipped.length} thing{imported.skipped.length === 1 ? '' : 's'} didn't come along</summary>
              <ul class="skipped">
                {#each imported.skipped as s, i (i)}
                  <li><code>{s.what}</code> <span class="muted">{s.why}</span></li>
                {/each}
              </ul>
            </details>
          {/if}
          <div class="actions">
            {#if imported.live}
              <button class="primary" onclick={() => browser.newTab(siteHome(imported!.name, imported!.tld), { after: tab.id })}>Open it</button>
            {:else}
              <button class="ghost" onclick={() => browser.openPreview(imported!.name)}>Preview</button>
              <button class="primary" onclick={() => browser.go(tab, `biggle://sites/${imported!.name}`)}>Open in the editor</button>
            {/if}
          </div>
        </div>
      {/if}

      {#if mode}
        <form class="create" onsubmit={mode === 'create' ? create : importIt}>
          <h2>{mode === 'create' ? 'Make a new site' : 'Import a website'}</h2>

          {#if mode === 'import'}
            <div class="from" role="radiogroup" aria-label="Import from">
              <button type="button" role="radio" aria-checked={from === 'link'} class:on={from === 'link'} onclick={() => (from = 'link')}>From a link</button>
              <button type="button" role="radio" aria-checked={from === 'files'} class:on={from === 'files'} onclick={() => (from = 'files')}>From my files</button>
            </div>
            {#if from === 'link'}
              <label class="field">
                <span>Website address</span>
                <input
                  bind:value={link}
                  oninput={linkTyped}
                  placeholder="https://example.com"
                  inputmode="url"
                  autocapitalize="off"
                  spellcheck="false"
                  required
                />
                <span class="hint">Its pages, pictures and styles get copied here. It has to be a public website.</span>
              </label>
              {#if account.user?.admin}
                <label class="check">
                  <input type="checkbox" bind:checked={live} />
                  Keep it live instead of copying it: best for games and apps. It loads from the original site every time.
                </label>
              {/if}
            {:else}
              <div class="field">
                <span>Your site's files</span>
                <div class="pick">
                  <button type="button" class="ghost" onclick={() => folderInput?.click()}>Choose a folder</button>
                  <button type="button" class="ghost" onclick={() => zipInput?.click()}>Choose a .zip</button>
                </div>
                <input bind:this={folderInput} type="file" webkitdirectory multiple hidden onchange={() => pick(folderInput, false)} />
                <input bind:this={zipInput} type="file" accept=".zip,application/zip" hidden onchange={() => pick(zipInput, true)} />
                <span class="hint" class:ok={picked}>{picked ? picked.label : 'The folder with your index.html in it, or a .zip of it.'}</span>
              </div>
            {/if}
          {/if}

          <label class="field">
            <span>Address</span>
            <span class="address">
              <input
                bind:value={name}
                oninput={() => (nameEdited = true)}
                placeholder="yourname"
                required
                autocapitalize="off"
                spellcheck="false"
                aria-describedby="name-hint"
              />
              {#if canShort}
                <select class="suffix-pick" bind:value={tld} aria-label="Address ending">
                  <option value="biggle">.biggle</option>
                  <option value="b">.b</option>
                </select>
              {:else}
                <span class="suffix">.biggle</span>
              {/if}
            </span>
            <span id="name-hint" class="hint" class:ok={availability?.ok} class:bad={availability && !availability.ok}>
              {#if availability}
                {availability.ok ? `${siteHost(availability.name, tld)} is free` : availability.reason}
              {:else}
                Letters, numbers and dashes.
              {/if}
            </span>
          </label>

          <label class="field">
            <span>Title</span>
            <input
              bind:value={title}
              placeholder={mode === 'import' ? "Leave empty to use the site's own title" : 'My corner of the Bigglenet'}
              maxlength="80"
            />
          </label>

          {#if mode === 'create'}
          <fieldset>
            <legend>Pick a look <em>(you can change it any time)</em></legend>
            <div class="themes">
              {#each THEMES as t (t.id)}
                <label class="theme" class:picked={theme === t.id} title={t.name}>
                  <input type="radio" name="theme" value={t.id} bind:group={theme} aria-label="{t.name} theme" />
                  <span class="swatch" style:background={t.bg}><i style:background={t.accent}></i></span>
                  <span>{t.name}</span>
                </label>
              {/each}
            </div>
          </fieldset>

          <label class="check">
            <input type="checkbox" bind:checked={withCode} />
            I know HTML and want to start with code instead
          </label>
          {/if}

          {#if error}
            <p class="error" role="alert">{error}</p>
          {/if}
          {#if progress}
            <p class="muted" aria-live="polite">{progress}</p>
          {/if}
          <p class="muted small">New sites are checked by an admin before anyone else can see them. You can edit yours straight away.</p>
          <div class="actions">
            <button type="button" class="ghost" disabled={busy} onclick={() => (mode = null)}>Cancel</button>
            <button class="primary" disabled={busy || availability?.ok === false}>
              {#if mode === 'create'}{busy ? 'Making it…' : 'Make my site'}{:else}{busy ? 'Importing…' : 'Import'}{/if}
            </button>
          </div>
        </form>
      {:else if atLimit}
        <p class="muted">You've made {sites.limit} sites, which is the most you can have.</p>
      {:else}
        <div class="starts">
          <button class="new" onclick={() => start('create')}>
            <Icon name="plus" size={20} />
            <span>
              <strong>Make a new site</strong>
              <span class="muted">Pick a name and a look. It takes a minute.</span>
            </span>
          </button>
          <button class="new" onclick={() => start('import')}>
            <Icon name="import" size={20} />
            <span>
              <strong>Import a website</strong>
              <span class="muted">Bring a site you already have, from its link or its files.</span>
            </span>
          </button>
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .page {
    height: 100%;
    overflow: auto;
    background: var(--surface);
  }
  .inner {
    max-width: 760px;
    margin: 0 auto;
    padding: 40px 20px 64px;
  }
  h1 {
    margin: 0;
    font-size: 30px;
    letter-spacing: -0.02em;
  }
  header {
    margin-bottom: 24px;
  }
  header p {
    margin: 4px 0 0;
  }
  .muted {
    color: var(--muted);
  }
  .small {
    font-size: 13.5px;
  }
  .empty {
    padding: 28px;
    border: 1px dashed var(--border);
    border-radius: 18px;
    text-align: center;
  }

  .sites {
    margin: 0 0 16px;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .sites li {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    padding: 14px 14px 14px 18px;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--card);
  }
  .site-main {
    flex: 1;
    min-width: 180px;
    display: flex;
    flex-direction: column;
  }
  .site-main .muted {
    font-size: 14px;
  }
  .note {
    margin-top: 4px;
    font-size: 13.5px;
    color: var(--danger);
  }
  .pill {
    padding: 3px 10px;
    border-radius: 12px;
    font-size: 12.5px;
    font-weight: 700;
    background: var(--accent-soft);
  }
  .pill.live {
    background: color-mix(in srgb, var(--online) 18%, transparent);
    color: var(--online);
  }
  .pill.rejected {
    background: color-mix(in srgb, var(--danger) 14%, transparent);
    color: var(--danger);
  }

  button {
    font: inherit;
    cursor: pointer;
  }
  .ghost,
  .solid,
  .primary {
    height: 36px;
    padding: 0 14px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
  }
  .ghost {
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--text);
  }
  .solid,
  .primary {
    border: 1px solid var(--accent);
    background: var(--accent);
    color: var(--on-accent);
  }
  .primary:disabled {
    opacity: 0.5;
  }

  .new {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 20px;
    border: 1.5px dashed var(--border);
    border-radius: 18px;
    background: none;
    color: var(--text);
    text-align: left;
  }
  .new:hover {
    border-color: var(--accent);
  }
  .new span {
    display: flex;
    flex-direction: column;
  }

  .create {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 24px;
    border: 1px solid var(--border);
    border-radius: 20px;
    background: var(--card);
  }
  .create h2 {
    margin: 0;
    font-size: 20px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
  }
  input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 15px;
    font-weight: 400;
  }
  input:focus {
    outline: 0;
    border-color: var(--accent);
  }
  .address {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .suffix {
    font-size: 15px;
    font-weight: 600;
    color: var(--muted);
  }
  .suffix-pick {
    padding: 4px 6px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--card);
    color: var(--text);
    font: inherit;
    font-size: 15px;
    font-weight: 600;
  }
  .hint {
    font-weight: 400;
    color: var(--muted);
  }
  .hint.ok {
    color: var(--online);
  }
  .hint.bad {
    color: var(--danger);
  }

  fieldset {
    margin: 0;
    padding: 0;
    border: 0;
  }
  legend {
    margin-bottom: 8px;
    font-size: 13px;
    font-weight: 600;
  }
  legend em {
    color: var(--muted);
    font-style: normal;
    font-weight: 400;
  }
  .themes {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }
  .theme {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
  }
  .theme input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  .swatch {
    display: grid;
    place-items: center;
    width: 56px;
    height: 56px;
    border: 2px solid var(--border);
    border-radius: 16px;
  }
  .swatch i {
    width: 20px;
    height: 20px;
    border-radius: 50%;
  }
  .theme.picked .swatch {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .check {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    color: var(--muted);
  }
  .check input {
    width: auto;
    margin: 0;
  }

  .error {
    margin: 0;
    color: var(--danger);
  }

  .starts {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .done {
    margin-bottom: 16px;
  }
  .done p {
    margin: 0;
  }
  .skipped {
    margin: 8px 0 0;
    padding-left: 18px;
    font-size: 13.5px;
    overflow-wrap: anywhere;
  }
  .skipped li {
    margin-bottom: 4px;
  }
  summary {
    cursor: pointer;
    font-size: 14px;
  }
  .from {
    display: flex;
    gap: 4px;
    padding: 4px;
    border-radius: 12px;
    background: var(--surface);
  }
  .from button {
    flex: 1;
    padding: 8px 10px;
    border: 0;
    border-radius: 9px;
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 14px;
    font-weight: 600;
  }
  .from button.on {
    background: var(--card);
    color: var(--text);
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.12);
  }
  .pick {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
</style>
