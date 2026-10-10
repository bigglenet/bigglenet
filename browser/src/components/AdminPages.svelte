<script lang="ts">
  // biggle://admin/pages: every .biggle site, and what admins can do to each one. Sites made in
  // the editor open in the editor (code view included) for their source; linked sites show the
  // page their host sends.
  import { account } from '../lib/account.svelte';
  import { api, errorText } from '../lib/api';
  import { browser, type Tab } from '../lib/browser.svelte';
  import { SERVER } from '../lib/config';
  import { sites as siteState } from '../lib/sites.svelte';
  import { siteHome, siteHost } from '../lib/url';
  import Icon from './Icon.svelte';

  let { tab }: { tab: Tab } = $props();

  type Status = 'live' | 'pending' | 'rejected';
  type Site = {
    name: string;
    tld: 'biggle' | 'b';
    url: string | null;
    title: string | null;
    status: Status;
    live: number;
    note: string | null;
    owner: string | null;
    files: number;
    size: number;
    created_at: number;
  };

  const STATUS: Record<Status, string> = { live: 'Live', pending: 'Waiting', rejected: 'Taken down' };
  const isAdmin = $derived(!!account.user?.admin);

  let list = $state<Site[]>([]);
  let loaded = $state(false);
  let error = $state('');
  let search = $state('');
  let filter = $state<Status | 'all'>('all');

  // What's being done to a site right now.
  let takingDown = $state<string | null>(null);
  let note = $state('');
  let renaming = $state<{ name: string; title: string } | null>(null);
  let source = $state<{ name: string; text: string | null; error: string } | null>(null);

  // Linking a name to a site hosted somewhere else.
  let linkOpen = $state(false);
  let form = $state({ name: '', url: '', title: '', live: false, tld: 'biggle' });
  let saving = $state(false);
  let formError = $state('');

  async function refresh() {
    try {
      list = (await api<{ names: Site[] }>('GET', '/api/admin/names')).names;
      error = '';
    } catch (e) {
      error = errorText(e);
    } finally {
      loaded = true;
    }
  }

  $effect(() => {
    void siteState.reviewsChanged;
    if (isAdmin) refresh();
  });

  async function run(fn: () => Promise<unknown>) {
    error = '';
    try {
      await fn();
      await refresh();
      siteState.refreshReviews();
    } catch (e) {
      error = errorText(e);
    }
  }

  const enc = encodeURIComponent;
  const shown = $derived(
    list.filter((s) => {
      if (filter !== 'all' && s.status !== filter) return false;
      const q = search.trim().toLowerCase().replace(/\.(biggle|b)$/, '');
      return !q || [s.name, s.title, s.owner, s.url].some((v) => v?.toLowerCase().includes(q));
    }),
  );
  const count = (status: Status | 'all') => (status === 'all' ? list.length : list.filter((s) => s.status === status).length);
  const date = (s: number) => new Date(s * 1000).toLocaleDateString([], { dateStyle: 'medium' });
  const kb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

  function openSite(site: Site) {
    if (site.status === 'live') browser.newTab(siteHome(site.name, site.tld), { after: tab.id });
    else browser.openPreview(site.name, '/', site.tld);
  }

  async function viewSource(site: Site) {
    source = { name: site.name, text: null, error: '' };
    try {
      const res = await fetch(`${SERVER}/site/${enc(site.name)}/`, { credentials: 'omit', cache: 'no-store' });
      const text = await res.text();
      if (source?.name === site.name) source = { name: site.name, text: res.ok ? text : null, error: res.ok ? '' : `Its host answered ${res.status}.` };
    } catch {
      if (source?.name === site.name) source = { name: site.name, text: null, error: "Couldn't reach its host." };
    }
  }

  function editLink(site: Site) {
    form = { name: site.name, url: site.url ?? '', title: site.title ?? '', live: !!site.live, tld: site.tld };
    linkOpen = true;
    document.querySelector('.admin-pages')?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function saveLink(e: SubmitEvent) {
    e.preventDefault();
    saving = true;
    formError = '';
    try {
      const name = form.name.trim().toLowerCase().replace(/\.(biggle|b)$/, '');
      await api('PUT', `/api/admin/names/${enc(name)}`, { url: form.url, title: form.title, live: form.live, tld: form.tld });
      form = { name: '', url: '', title: '', live: false, tld: 'biggle' };
      linkOpen = false;
      await refresh();
    } catch (err) {
      formError = errorText(err);
    } finally {
      saving = false;
    }
  }

  async function saveTitle(site: Site, title: string) {
    await run(() =>
      site.url
        ? api('PUT', `/api/admin/names/${enc(site.name)}`, { url: site.url, title, live: !!site.live, tld: site.tld })
        : api('PATCH', `/api/sites/${enc(site.name)}`, { title }),
    );
    renaming = null;
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (source = null)} />

<div class="frame">
  <div class="admin-pages">
    <div class="inner">
      <button class="back" onclick={() => browser.go(tab, 'biggle://admin')}><Icon name="back" size={16} /> Admin</button>
      <h1>All sites</h1>

      {#if !isAdmin}
        <p class="muted">This page is only for Bigglenet admins.</p>
      {:else}
        <div class="tools">
          <input class="search" bind:value={search} placeholder="Find a site, title, owner or host" aria-label="Find a site" spellcheck="false" />
          <button class="primary" onclick={() => (linkOpen = !linkOpen)} aria-expanded={linkOpen}>
            <Icon name="plus" size={16} /> Link a site
          </button>
        </div>

        {#if linkOpen}
          <form class="link-form" onsubmit={saveLink}>
            <p class="muted small">Point a .biggle or .b name at a site hosted somewhere else.</p>
            <div class="fields">
              <label class="field">
                <span>Name</span>
                <span class="suffixed">
                  <input bind:value={form.name} placeholder="ethem" required autocapitalize="off" spellcheck="false" />
                  <select class="suffix-pick" bind:value={form.tld} aria-label="Address ending">
                    <option value="biggle">.biggle</option>
                    <option value="b">.b</option>
                  </select>
                </span>
              </label>
              <label class="field grow">
                <span>Host URL</span>
                <input bind:value={form.url} placeholder="https://ethem.pages.dev/" required type="url" />
              </label>
              <label class="field">
                <span>Title</span>
                <input bind:value={form.title} placeholder="Optional" />
              </label>
              <label class="check" title="Show a normal website (an app or a game) as it is, without needing .bhtml pages">
                <input type="checkbox" bind:checked={form.live} />
                Live app
              </label>
              <button class="primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
            {#if formError}<p class="error" role="alert">{formError}</p>{/if}
          </form>
        {/if}

        <div class="filters" role="radiogroup" aria-label="Show">
          {#each [['all', 'All'], ['live', 'Live'], ['pending', 'Waiting'], ['rejected', 'Taken down']] as [id, label] (id)}
            <button role="radio" aria-checked={filter === id} class:on={filter === id} onclick={() => (filter = id as Status | 'all')}>
              {label} <span class="count">{count(id as Status | 'all')}</span>
            </button>
          {/each}
        </div>

        {#if error}<p class="error" role="alert">{error}</p>{/if}

        <ul class="list">
          {#each shown as site (site.name)}
            <li>
              <div class="row">
                <div class="main">
                  <div class="name-line">
                    <strong>{siteHost(site.name, site.tld)}</strong>
                    <span class="pill {site.status}">{STATUS[site.status]}</span>
                    {#if site.live}<span class="pill">Live app</span>{/if}
                  </div>
                  {#if site.title}<span class="title">{site.title}</span>{/if}
                  <span class="muted small">
                    {#if site.url}
                      Linked to {site.url}
                    {:else}
                      Made in the editor by {site.owner ?? 'a deleted account'} · {site.files} file{site.files === 1 ? '' : 's'} · {kb(site.size)}
                    {/if}
                    · since {date(site.created_at)}
                  </span>
                  {#if site.note && site.status === 'rejected'}<span class="small note">“{site.note}”</span>{/if}
                </div>
                <div class="actions">
                  <button class="ghost" onclick={() => openSite(site)}>{site.status === 'live' ? 'Open' : 'Preview'}</button>
                  {#if site.url}
                    <button class="ghost" onclick={() => viewSource(site)}>View source</button>
                    <button class="ghost" onclick={() => editLink(site)}>Edit link</button>
                  {:else}
                    <button class="ghost" onclick={() => browser.newTab(`biggle://sites/${site.name}`, { after: tab.id })}>Edit source</button>
                  {/if}
                  <button class="ghost" onclick={() => (renaming = { name: site.name, title: site.title ?? '' })}>Rename</button>
                  <button
                    class="ghost"
                    title={site.tld === 'b' ? `Change the address to ${site.name}.biggle` : `Change the address to ${site.name}.b`}
                    onclick={() => run(() => api('PATCH', `/api/admin/names/${enc(site.name)}`, { tld: site.tld === 'b' ? 'biggle' : 'b' }))}
                    >Make it .{site.tld === 'b' ? 'biggle' : 'b'}</button
                  >
                  {#if site.status === 'live'}
                    <button class="ghost" onclick={() => ((takingDown = site.name), (note = ''))}>Take down</button>
                  {:else}
                    <button class="primary" onclick={() => run(() => api('POST', `/api/admin/sites/${enc(site.name)}/approve`))}>Approve</button>
                  {/if}
                  <button
                    class="ghost icon"
                    aria-label="Delete {siteHost(site.name, site.tld)}"
                    title="Delete"
                    onclick={() => {
                      if (confirm(`Delete ${siteHost(site.name, site.tld)}${site.url ? '' : ' and all its files'}? This can't be undone.`)) {
                        run(() => api('DELETE', `/api/admin/names/${enc(site.name)}`));
                      }
                    }}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              </div>

              {#if takingDown === site.name}
                <div class="inline">
                  <input bind:value={note} placeholder="Why? The owner sees this (optional)" maxlength="300" />
                  <button
                    class="danger"
                    onclick={async () => {
                      await run(() => api('POST', `/api/admin/sites/${enc(site.name)}/reject`, { note }));
                      takingDown = null;
                    }}>Take down</button
                  >
                  <button class="ghost" onclick={() => (takingDown = null)}>Cancel</button>
                </div>
              {/if}
              {#if renaming?.name === site.name}
                <form
                  class="inline"
                  onsubmit={(e) => {
                    e.preventDefault();
                    saveTitle(site, renaming!.title);
                  }}
                >
                  <input bind:value={renaming.title} placeholder="Title" maxlength="80" aria-label="Title for {site.name}.biggle" />
                  <button class="primary">Save</button>
                  <button type="button" class="ghost" onclick={() => (renaming = null)}>Cancel</button>
                </form>
              {/if}
            </li>
          {:else}
            <li class="muted">{loaded ? 'No sites match.' : 'Loading…'}</li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>

  {#if source}
    <div class="source" role="dialog" aria-label="Source of {source.name}.biggle">
      <header>
        <strong>{source.name}.biggle</strong>
        <span class="muted small">The page its host sends, read-only</span>
        {#if source.text}
          <button class="ghost" onclick={() => navigator.clipboard.writeText(source!.text ?? '')}><Icon name="copy" size={15} /> Copy</button>
        {/if}
        <button class="ghost icon" aria-label="Close" onclick={() => (source = null)}><Icon name="close" size={16} /></button>
      </header>
      {#if source.error}
        <p class="error">{source.error}</p>
      {:else if source.text === null}
        <p class="muted">Loading…</p>
      {:else}
        <pre>{source.text}</pre>
      {/if}
    </div>
  {/if}
</div>

<style>
  .frame {
    position: relative;
    height: 100%;
  }
  .admin-pages {
    height: 100%;
    overflow: auto;
    background: var(--surface);
  }
  .inner {
    max-width: 920px;
    margin: 0 auto;
    padding: 28px 20px 64px;
  }
  .back {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 0;
    border: 0;
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 14px;
  }
  .back:hover {
    color: var(--text);
  }
  h1 {
    margin: 6px 0 20px;
    font-size: 28px;
    letter-spacing: -0.02em;
  }
  .muted {
    color: var(--muted);
  }
  .small {
    font-size: 13px;
  }
  .error {
    color: var(--danger);
  }
  button {
    font: inherit;
    cursor: pointer;
  }
  input:not([type='checkbox']) {
    height: 36px;
    padding: 0 10px;
    border: 1px solid var(--border);
    border-radius: 9px;
    background: var(--card);
    color: var(--text);
    font: inherit;
    font-size: 14px;
  }
  .primary,
  .ghost,
  .danger {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 12px;
    border-radius: 9px;
    font-size: 13.5px;
    font-weight: 600;
    white-space: nowrap;
  }
  .primary {
    border: 0;
    background: var(--accent);
    color: var(--on-accent);
  }
  .primary:disabled {
    opacity: 0.55;
  }
  .ghost {
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--text);
  }
  .ghost:hover {
    border-color: var(--accent);
  }
  .danger {
    border: 0;
    background: var(--danger);
    color: #fff;
  }
  .icon {
    width: 32px;
    justify-content: center;
    padding: 0;
  }

  .tools {
    display: flex;
    gap: 10px;
  }
  .search {
    flex: 1;
    min-width: 0;
  }
  .tools .primary {
    height: 36px;
  }

  .link-form {
    margin-top: 12px;
    padding: 14px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--card);
  }
  .link-form p {
    margin: 0 0 10px;
  }
  .fields {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 10px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12.5px;
    font-weight: 600;
  }
  .field.grow {
    flex: 1;
    min-width: 200px;
  }
  .suffixed {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .suffix-pick {
    padding: 4px 6px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--card);
    color: var(--text);
    font: inherit;
    font-weight: 600;
  }
  .suffix {
    color: var(--muted);
  }
  .check {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 36px;
    font-size: 14px;
  }

  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 18px 0 8px;
  }
  .filters button {
    padding: 6px 12px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: none;
    color: var(--muted);
    font-size: 13px;
    font-weight: 600;
  }
  .filters button.on {
    border-color: var(--accent);
    color: var(--text);
  }
  .count {
    opacity: 0.6;
  }

  .list {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .list li {
    padding: 14px 0;
    border-bottom: 1px solid var(--border);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 10px 16px;
  }
  .main {
    flex: 1;
    min-width: 220px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .name-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .title {
    font-size: 14px;
  }
  .note {
    color: var(--muted);
    font-style: italic;
  }
  .pill {
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--hover);
    color: var(--muted);
    font-size: 11.5px;
    font-weight: 700;
  }
  .pill.live {
    background: color-mix(in srgb, var(--online) 18%, transparent);
    color: var(--online);
  }
  .pill.pending {
    background: color-mix(in srgb, #e5a50a 20%, transparent);
    color: #b27b00;
  }
  .pill.rejected {
    background: color-mix(in srgb, var(--danger) 16%, transparent);
    color: var(--danger);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .inline {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
  }
  .inline input {
    flex: 1;
    min-width: 200px;
  }

  .source {
    position: absolute;
    inset: 16px;
    z-index: 5;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--card);
    box-shadow: 0 30px 80px -30px rgb(0 0 0 / 0.5);
    overflow: hidden;
  }
  .source header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px 10px 16px;
    border-bottom: 1px solid var(--border);
  }
  .source header .small {
    flex: 1;
  }
  .source pre {
    flex: 1;
    margin: 0;
    padding: 14px 16px;
    overflow: auto;
    font: 12.5px/1.5 ui-monospace, Menlo, monospace;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .source p {
    padding: 16px;
  }
</style>
