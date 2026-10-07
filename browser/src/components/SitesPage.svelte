<script lang="ts">
  import { account } from '../lib/account.svelte';
  import { api, errorText } from '../lib/api';
  import { browser, type Tab } from '../lib/browser.svelte';
  import { renderFiles, starterSite, THEMES, type Theme } from '../lib/easysite';
  import { sites, type MySite } from '../lib/sites.svelte';
  import { NAME_RE } from '../lib/url';
  import Icon from './Icon.svelte';

  let { tab }: { tab: Tab } = $props();

  let creating = $state(false);
  let name = $state('');
  let title = $state('');
  let theme = $state<Theme>('sunset');
  let withCode = $state(false);
  let availability = $state<{ name: string; ok: boolean; reason: string | null } | null>(null);
  let busy = $state(false);
  let error = $state('');

  const clean = $derived(name.trim().toLowerCase().replace(/\.biggle$/, ''));
  const atLimit = $derived(sites.limit !== null && (sites.mine?.length ?? 0) >= sites.limit);

  $effect(() => {
    if (account.token) sites.refreshMine();
  });

  // Check the name as you type.
  $effect(() => {
    const n = clean;
    availability = null;
    if (!n || !NAME_RE.test(n) || n.length < 2) return;
    const timer = setTimeout(async () => {
      try {
        const r = await api<{ available: boolean; reason: string | null }>('GET', `/api/sites/available/${encodeURIComponent(n)}`);
        if (clean === n) availability = { name: n, ok: r.available, reason: r.reason };
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
        ? { name: clean, title: siteTitle, template: 'page' }
        : { name: clean, title: siteTitle, files: renderFiles(starterSite(siteTitle, theme)) };
      const r = await api<{ site: MySite }>('POST', '/api/sites', body);
      await sites.refreshMine();
      browser.go(tab, `biggle://sites/${r.site.name}`);
    } catch (err) {
      error = errorText(err);
    } finally {
      busy = false;
    }
  }

  function open(site: MySite) {
    if (site.status === 'live') browser.newTab(`biggle://${site.name}.biggle/`, { after: tab.id });
    else browser.openPreview(site.name);
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
                <strong>{site.name}.biggle</strong>
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

      {#if creating}
        <form class="create" onsubmit={create}>
          <h2>Make a new site</h2>

          <label class="field">
            <span>Address</span>
            <span class="address">
              <input
                bind:value={name}
                placeholder="yourname"
                required
                autocapitalize="off"
                spellcheck="false"
                aria-describedby="name-hint"
              />
              <span class="suffix">.biggle</span>
            </span>
            <span id="name-hint" class="hint" class:ok={availability?.ok} class:bad={availability && !availability.ok}>
              {#if availability}
                {availability.ok ? `${availability.name}.biggle is free` : availability.reason}
              {:else}
                Letters, numbers and dashes.
              {/if}
            </span>
          </label>

          <label class="field">
            <span>Title</span>
            <input bind:value={title} placeholder="My corner of the Bigglenet" maxlength="80" />
          </label>

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

          {#if error}
            <p class="error" role="alert">{error}</p>
          {/if}
          <p class="muted small">New sites are checked by an admin before anyone else can see them. You can edit yours straight away.</p>
          <div class="actions">
            <button type="button" class="ghost" onclick={() => (creating = false)}>Cancel</button>
            <button class="primary" disabled={busy || availability?.ok === false}>
              {busy ? 'Making it…' : 'Make my site'}
            </button>
          </div>
        </form>
      {:else if atLimit}
        <p class="muted">You've made {sites.limit} sites, which is the most you can have.</p>
      {:else}
        <button class="new" onclick={() => (creating = true)}>
          <Icon name="plus" size={20} />
          <span>
            <strong>Make a new site</strong>
            <span class="muted">Pick a name and a look. It takes a minute.</span>
          </span>
        </button>
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
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
</style>
