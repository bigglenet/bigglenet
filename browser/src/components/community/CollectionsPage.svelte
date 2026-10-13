<script lang="ts">
  // biggle://collections: your collections. biggle://collections/<id>: one, to share or change
  // (server/src/collections.ts).
  import { api, errorText } from '../../lib/api';
  import { browser, type Tab } from '../../lib/browser.svelte';
  import { ago } from '../../lib/community';
  import { plural, t } from '../../lib/i18n.svelte';
  import { fromInput, siteHome } from '../../lib/url';
  import Avatar from '../Avatar.svelte';
  import Icon from '../Icon.svelte';
  import Linked from './Linked.svelte';
  import Page from './Page.svelte';

  let { tab, path }: { tab: Tab; path: string } = $props();

  type Card = { id: string; title: string; description: string | null; listed: boolean; sites: number; updatedAt: number };
  type Detail = {
    collection: Card & { by: string; avatar: number | null; createdAt: number };
    sites: { site: string; address: string; title: string | null; note: string | null; live: boolean }[];
    mine: boolean;
  };

  let list = $state<Card[] | null>(null);
  let detail = $state<Detail | null>(null);
  let error = $state('');
  let busy = $state(false);
  let creating = $state(false);
  let form = $state({ title: '', description: '', listed: true });
  let adding = $state('');
  let note = $state('');
  let editing = $state(false);
  let confirmDelete = $state(false);

  async function load() {
    error = '';
    try {
      if (path) detail = await api<Detail>('GET', `/api/collections/${encodeURIComponent(path)}`);
      else list = (await api<{ collections: Card[] }>('GET', '/api/collections')).collections;
    } catch (e) {
      error = errorText(e);
    }
  }

  $effect(() => {
    void path;
    detail = null;
    editing = false;
    confirmDelete = false;
    load();
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
      const r = await api<{ id: string }>('POST', '/api/collections', form);
      form = { title: '', description: '', listed: true };
      creating = false;
      browser.go(tab, `biggle://collections/${r.id}`);
    });
  };

  const add = (e: SubmitEvent) => {
    e.preventDefault();
    const target = fromInput(adding.trim());
    const site = target?.kind === 'biggle' ? /^biggle:\/\/([^/?#]+)/.exec(target.href)?.[1] : null;
    if (!site) return void (error = t('Type a site’s address, like hello.biggle.'));
    act(async () => {
      await api('POST', `/api/collections/${path}/sites`, { site, note });
      adding = '';
      note = '';
      await load();
    });
  };

  const remove = (site: string) => act(async () => (await api('DELETE', `/api/collections/${path}/sites/${encodeURIComponent(site)}`), await load()));

  function move(i: number, by: number) {
    if (!detail) return;
    const order = detail.sites.map((s) => s.site);
    const j = i + by;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    detail.sites = order.map((site) => detail!.sites.find((s) => s.site === site)!);
    act(() => api('PUT', `/api/collections/${path}/order`, { sites: order }));
  }

  function startEdit() {
    if (!detail) return;
    form = { title: detail.collection.title, description: detail.collection.description ?? '', listed: detail.collection.listed };
    editing = true;
  }
  const save = (e: SubmitEvent) => {
    e.preventDefault();
    act(async () => (await api('PATCH', `/api/collections/${path}`, form), (editing = false), await load()));
  };
  const del = () => act(async () => (await api('DELETE', `/api/collections/${path}`), browser.go(tab, 'biggle://collections', 'replace')));

  // The tab shows the collection's name.
  $effect(() => {
    if (detail) tab.title = detail.collection.title;
  });

  async function share() {
    try {
      await navigator.clipboard.writeText(`biggle://collections/${path}`);
      browser.say(t('Link copied. Paste it in a chat to share the collection.'));
    } catch {}
  }
</script>

<Page>
  {#if path}
    <button class="back" onclick={() => browser.go(tab, 'biggle://collections')}><Icon name="back" size={16} /> {t('Collections')}</button>
    {#if detail}
      {@const c = detail.collection}
      {#if editing}
        <form class="card stack" onsubmit={save}>
          <input bind:value={form.title} maxlength="60" aria-label={t('Name')} required />
          <textarea bind:value={form.description} rows="2" maxlength="500" placeholder={t('What’s in it?')} aria-label={t('Description')}></textarea>
          <label class="check"><input type="checkbox" bind:checked={form.listed} /> {t('Show it on my profile (otherwise only people with the link can see it)')}</label>
          <div class="row">
            <button class="primary" disabled={busy}>{t('Save')}</button>
            <button type="button" class="ghost" onclick={() => (editing = false)}>{t('Cancel')}</button>
          </div>
        </form>
      {:else}
        <header class="top">
          <div class="grow">
            <h1>{c.title}</h1>
            <p class="row muted">
              <button class="by" onclick={() => browser.go(tab, `biggle://u/${c.by}`)}><Avatar name={c.by} user={c.by} size={20} /> {c.by}</button>
              · {plural(detail.sites.length, '{n} site', '{n} sites')}
              {#if !c.listed}<span class="pill">{t('Only with the link')}</span>{/if}
            </p>
          </div>
          <button class="ghost" onclick={share}><Icon name="copy" size={15} /> {t('Copy link')}</button>
        </header>
        {#if c.description}<p class="description"><Linked text={c.description} /></p>{/if}
      {/if}
      {#if error}<p class="bad">{error}</p>{/if}

      {#if detail.sites.length}
        <ul class="list">
          {#each detail.sites as s, i (s.site)}
            <li class="row site">
              <button class="item grow" onclick={() => browser.go(tab, siteHome(s.site))} disabled={!s.live}>
                <span class="emoji-tile">{s.site[0].toUpperCase()}</span>
                <span class="text">
                  <span class="name">{s.address}{s.live ? '' : ` · ${t('waiting for approval')}`}</span>
                  {#if s.title}<span class="sub">{s.title}</span>{/if}
                  {#if s.note}<span class="sub note">“{s.note}”</span>{/if}
                </span>
              </button>
              {#if detail.mine}
                <button class="icon" aria-label={t('Move up')} disabled={i === 0} onclick={() => move(i, -1)}><Icon name="up" size={15} /></button>
                <button class="icon" aria-label={t('Move down')} disabled={i === detail.sites.length - 1} onclick={() => move(i, 1)}><Icon name="down" size={15} /></button>
                <button class="icon" aria-label={t('Remove {site}', { site: s.address })} onclick={() => remove(s.site)}><Icon name="close" size={15} /></button>
              {/if}
            </li>
          {/each}
        </ul>
      {:else}
        <div class="card empty">{detail.mine ? t('Nothing in it yet. Add a site below, or use “Add to collection” in a site’s menu.') : t('Nothing in it yet.')}</div>
      {/if}

      {#if detail.mine}
        <form class="card stack add" onsubmit={add}>
          <h3>{t('Add a site')}</h3>
          <div class="row">
            <input class="grow" bind:value={adding} placeholder="hello.biggle" aria-label={t('Site address')} spellcheck="false" autocapitalize="off" />
            <input class="grow" bind:value={note} maxlength="200" placeholder={t('Why it’s good (optional)')} aria-label={t('Note')} />
            <button class="primary" disabled={busy || !adding.trim()}>{t('Add')}</button>
          </div>
        </form>
        <div class="row actions">
          {#if !editing}<button class="ghost" onclick={startEdit}>{t('Change name and sharing')}</button>{/if}
          {#if confirmDelete}
            <button class="danger" onclick={del}>{t('Delete the collection')}</button>
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
    <header class="top">
      <h1>{t('Collections')}</h1>
      <button class="primary" onclick={() => (creating = !creating)}><Icon name="plus" size={15} /> {t('New collection')}</button>
    </header>
    <p class="muted intro">{t('Lists of sites you love, to share with friends. Listed ones show on your profile.')}</p>
    {#if creating}
      <form class="card stack" onsubmit={create}>
        <input bind:value={form.title} maxlength="60" placeholder={t('Name (Best games)')} aria-label={t('Name')} required />
        <textarea bind:value={form.description} rows="2" maxlength="500" placeholder={t('What’s in it?')} aria-label={t('Description')}></textarea>
        <label class="check"><input type="checkbox" bind:checked={form.listed} /> {t('Show it on my profile (otherwise only people with the link can see it)')}</label>
        <div class="row">
          <button class="primary" disabled={busy || !form.title.trim()}>{t('Make it')}</button>
          <button type="button" class="ghost" onclick={() => (creating = false)}>{t('Cancel')}</button>
        </div>
      </form>
    {/if}
    {#if error}<p class="bad">{error}</p>{/if}
    {#if list}
      {#if list.length}
        <ul class="list">
          {#each list as c (c.id)}
            <li>
              <button class="item" onclick={() => browser.go(tab, `biggle://collections/${c.id}`)}>
                <Icon name="star" size={20} />
                <span class="text">
                  <span class="name">{c.title}</span>
                  <span class="sub">{plural(c.sites, '{n} site', '{n} sites')} · {t('changed {when}', { when: ago(c.updatedAt * 1000) })}</span>
                </span>
                {#if !c.listed}<span class="pill">{t('Only with the link')}</span>{/if}
              </button>
            </li>
          {/each}
        </ul>
      {:else if !creating}
        <div class="card empty">{t('No collections yet.')}</div>
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
  .by {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .site {
    flex-wrap: nowrap;
    gap: 2px;
    padding-right: 8px;
  }
  .note {
    font-style: italic;
  }
  .icon {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border: 0;
    border-radius: 8px;
    background: none;
    color: var(--muted);
    cursor: pointer;
  }
  .icon:hover:not(:disabled) {
    background: var(--hover);
    color: var(--text);
  }
  .icon:disabled {
    opacity: 0.35;
  }
  .add {
    margin-top: 16px;
  }
  .actions {
    margin-top: 20px;
  }
  form.card {
    margin-bottom: 16px;
  }
</style>
