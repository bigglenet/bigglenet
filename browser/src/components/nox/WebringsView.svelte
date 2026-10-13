<script lang="ts">
  // biggle://nox/webrings: webrings, like the old web. biggle://nox/webrings/<id>: one ring, its
  // sites, adding yours, and the tag to put on your pages (server/src/webrings.ts).
  import { api, errorText } from '../../lib/api';
  import { browser, type Tab } from '../../lib/browser.svelte';
  import { plural, t } from '../../lib/i18n.svelte';
  import { sites } from '../../lib/sites.svelte';
  import { siteHome, siteHost } from '../../lib/url';
  import Icon from '../Icon.svelte';
  import Page from '../community/Page.svelte';

  let { tab, id }: { tab: Tab; id: number | null } = $props();

  type RingCard = { id: number; name: string; description: string | null; owner: string | null; sites: number };
  type Ring = {
    ring: { id: number; name: string; description: string | null; owner: string | null };
    sites: { site: string; address: string; title: string | null; canRemove: boolean }[];
    mine: boolean;
  };

  let rings = $state<RingCard[] | null>(null);
  let ring = $state<Ring | null>(null);
  let error = $state('');
  let busy = $state(false);
  let creating = $state(false);
  let form = $state({ name: '', description: '' });
  let adding = $state('');
  let confirmDelete = $state(false);

  async function load() {
    error = '';
    try {
      if (id) ring = await api<Ring>('GET', `/api/webrings/${id}`);
      else rings = (await api<{ rings: RingCard[] }>('GET', '/api/webrings')).rings;
    } catch (e) {
      error = errorText(e);
    }
  }

  $effect(() => {
    void id;
    ring = null;
    confirmDelete = false;
    load();
    if (!sites.mine) sites.refreshMine();
  });

  $effect(() => {
    if (ring) tab.title = ring.ring.name;
  });

  async function act(fn: () => Promise<unknown>) {
    if (busy) return;
    busy = true;
    error = '';
    try {
      await fn();
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  }

  const create = (e: SubmitEvent) => {
    e.preventDefault();
    act(async () => {
      const r = await api<{ id: number }>('POST', '/api/webrings', form);
      form = { name: '', description: '' };
      creating = false;
      browser.go(tab, `biggle://nox/webrings/${r.id}`);
    });
  };
  const join = (e: SubmitEvent) => {
    e.preventDefault();
    if (!adding) return;
    act(async () => (await api('POST', `/api/webrings/${id}/sites`, { site: adding }), (adding = ''), await load()));
  };
  const remove = (site: string) => act(async () => (await api('DELETE', `/api/webrings/${id}/sites/${encodeURIComponent(site)}`), await load()));
  const del = () => act(async () => (await api('DELETE', `/api/webrings/${id}`), browser.go(tab, 'biggle://nox/webrings', 'replace')));

  // Your live sites that aren't in this ring yet.
  const addable = $derived((sites.mine ?? []).filter((s) => s.status === 'live' && !ring?.sites.some((x) => x.site === s.name)));
  const code = $derived(id ? `<biggle-webring ring="${id}"></biggle-webring>` : '');

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      browser.say(t('Copied. Paste it into your pages.'));
    } catch {}
  }
</script>

<Page>
  {#if id}
    <button class="back" onclick={() => browser.go(tab, 'biggle://nox/webrings')}><Icon name="back" size={16} /> {t('Webrings')}</button>
    {#if ring}
      <header class="top">
        <div class="grow">
          <h1>{ring.ring.name}</h1>
          <p class="muted">{plural(ring.sites.length, '{n} site', '{n} sites')}{ring.ring.owner ? ` · ${t('started by {who}', { who: ring.ring.owner })}` : ''}</p>
        </div>
      </header>
      {#if ring.ring.description}<p class="description">{ring.ring.description}</p>{/if}
      {#if error}<p class="bad">{error}</p>{/if}

      {#if ring.sites.length}
        <ol class="list ring">
          {#each ring.sites as s, i (s.site)}
            <li class="row nowrap">
              <button class="item grow" onclick={() => browser.go(tab, siteHome(s.site))}>
                <span class="pos">{i + 1}</span>
                <span class="text">
                  <span class="name">{s.address}</span>
                  {#if s.title}<span class="sub">{s.title}</span>{/if}
                </span>
              </button>
              {#if s.canRemove}<button class="ghost small-btn" disabled={busy} onclick={() => remove(s.site)}>{t('Take out')}</button>{/if}
            </li>
          {/each}
        </ol>
      {:else}
        <div class="card empty">{t('No sites in this ring yet.')}</div>
      {/if}

      {#if addable.length}
        <form class="row add" onsubmit={join}>
          <select class="grow" bind:value={adding} aria-label={t('Your site')}>
            <option value="">{t('Add one of your sites…')}</option>
            {#each addable as s (s.name)}<option value={s.name}>{siteHost(s.name, s.tld)}</option>{/each}
          </select>
          <button class="primary" disabled={!adding || busy}>{t('Add')}</button>
        </form>
      {/if}

      <section class="card stack code-card">
        <h3>{t('Show the ring on your site')}</h3>
        <p class="muted small">{t('Put this on your pages. It links to the site before yours, the one after, and a random one. In the easy editor, add a Webring block.')}</p>
        <div class="row">
          <code class="grow">{code}</code>
          <button class="ghost" onclick={copyCode}><Icon name="copy" size={15} /> {t('Copy')}</button>
        </div>
      </section>

      {#if ring.mine}
        <div class="row actions">
          {#if confirmDelete}
            <button class="danger" onclick={del}>{t('Delete the webring')}</button>
            <button class="link small" onclick={() => (confirmDelete = false)}>{t('Keep it')}</button>
          {:else}
            <button class="ghost" onclick={() => (confirmDelete = true)}>{t('Delete…')}</button>
          {/if}
        </div>
      {/if}
    {:else if error}
      <p class="bad">{error}</p>
    {:else}
      <p class="muted">{t('Loading…')}</p>
    {/if}
  {:else}
    <button class="back" onclick={() => browser.go(tab, 'biggle://nox')}><Icon name="back" size={16} /> Nox</button>
    <header class="top">
      <h1>{t('Webrings')}</h1>
      <button class="primary" onclick={() => (creating = !creating)}><Icon name="plus" size={15} /> {t('Start a webring')}</button>
    </header>
    <p class="muted intro">{t('Like the old web: sites linked in a circle, each pointing to the next. Join one with your site, or start your own.')}</p>
    {#if creating}
      <form class="card stack" onsubmit={create}>
        <input bind:value={form.name} maxlength="50" placeholder={t('Name (Pixel art ring)')} aria-label={t('Name')} required />
        <textarea bind:value={form.description} rows="2" maxlength="300" placeholder={t('What kind of sites is it for?')} aria-label={t('Description')}></textarea>
        <div class="row">
          <button class="primary" disabled={busy || !form.name.trim()}>{t('Start it')}</button>
          <button type="button" class="ghost" onclick={() => (creating = false)}>{t('Cancel')}</button>
        </div>
      </form>
    {/if}
    {#if error}<p class="bad">{error}</p>{/if}
    {#if rings}
      {#if rings.length}
        <ul class="list">
          {#each rings as r (r.id)}
            <li>
              <button class="item" onclick={() => browser.go(tab, `biggle://nox/webrings/${r.id}`)}>
                <Icon name="reload" size={20} />
                <span class="text">
                  <span class="name">{r.name}</span>
                  <span class="sub">{plural(r.sites, '{n} site', '{n} sites')}{r.description ? ` · ${r.description}` : ''}</span>
                </span>
              </button>
            </li>
          {/each}
        </ul>
      {:else if !creating}
        <div class="card empty">{t('No webrings yet. Start the first one!')}</div>
      {/if}
    {:else if !error}
      <p class="muted">{t('Loading…')}</p>
    {/if}
  {/if}
</Page>

<style>
  .intro,
  .description {
    margin-bottom: 16px;
  }
  .nowrap {
    flex-wrap: nowrap;
    padding-right: 10px;
  }
  .pos {
    flex: none;
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--accent-soft);
    font-size: 13px;
    font-weight: 700;
  }
  .small-btn {
    height: 30px;
    padding: 0 12px;
    font-size: 13px;
  }
  .add {
    margin-top: 12px;
  }
  .code-card {
    margin-top: 20px;
  }
  code {
    padding: 8px 10px;
    border-radius: 8px;
    background: var(--surface);
    font-size: 12.5px;
    overflow-wrap: anywhere;
  }
  .actions {
    margin-top: 20px;
  }
  form.card {
    margin-bottom: 16px;
  }
</style>
