<script lang="ts">
  // The site editor's settings box: who can edit the site with you, how many people visit it,
  // and (for code sites) what a link to it looks like when it's shared.
  import { account } from '../lib/account.svelte';
  import { api, errorText } from '../lib/api';
  import type { HeadMeta } from '../lib/headmeta';
  import { i18n, plural, t } from '../lib/i18n.svelte';
  import { overlays } from '../lib/overlays.svelte';
  import { social } from '../lib/social.svelte';
  import { siteHost } from '../lib/url';
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';

  type Stats = {
    today: number;
    days: { day: number; visits: number }[];
    pages: { path: string; views: number }[];
    from: { site: string; visits: number }[];
    totals: { visits: number; visitors: number; likes: number; notes: number; comments: number };
  };

  let {
    name,
    owner,
    editors,
    canManage,
    head,
    images,
    start = 'people',
    onhead,
    onchange,
    onleave,
    onclose,
  }: {
    name: string;
    owner: string | null;
    editors: string[];
    canManage: boolean;
    /** The code site's head, or null for easy sites (the easy editor has its own). */
    head: HeadMeta | null;
    images: string[];
    start?: 'people' | 'stats' | 'sharing';
    onhead: (meta: HeadMeta) => void;
    onchange: () => void;
    onleave: () => void;
    onclose: () => void;
  } = $props();

  // svelte-ignore state_referenced_locally
  let section = $state<'people' | 'stats' | 'sharing'>(start);
  let adding = $state('');
  let error = $state('');
  let busy = $state(false);
  let stats = $state<Stats | null>(null);
  let statsError = $state('');
  // svelte-ignore state_referenced_locally
  let meta = $state<HeadMeta>(head ? { ...head } : { description: '', image: '', icon: '' });
  let box = $state<HTMLDivElement>();

  const enc = encodeURIComponent;
  const me = $derived(account.user?.username ?? '');
  const choices = $derived(social.friends.filter((f) => f.username !== owner && !editors.includes(f.username)));

  $effect(() => {
    const release = overlays.hold();
    box?.focus();
    return release;
  });

  $effect(() => {
    if (section !== 'stats' || stats) return;
    api<Stats>('GET', `/api/sites/${enc(name)}/stats`)
      .then((s) => (stats = s))
      .catch((e) => (statsError = errorText(e)));
  });

  async function add(e: SubmitEvent) {
    e.preventDefault();
    if (!adding || busy) return;
    busy = true;
    error = '';
    try {
      await api('POST', `/api/sites/${enc(name)}/editors`, { username: adding });
      adding = '';
      onchange();
    } catch (err) {
      error = errorText(err);
    } finally {
      busy = false;
    }
  }

  async function remove(username: string) {
    error = '';
    try {
      await api('DELETE', `/api/sites/${enc(name)}/editors/${enc(username)}`);
      if (username === me) onleave();
      else onchange();
    } catch (err) {
      error = errorText(err);
    }
  }

  // The last 30 days as bars, oldest first.
  const days = $derived.by(() => {
    if (!stats) return [];
    const byDay = new Map(stats.days.map((d) => [d.day, d.visits]));
    return Array.from({ length: 30 }, (_, i) => {
      const day = stats!.today - 29 + i;
      return { day, visits: byDay.get(day) ?? 0 };
    });
  });
  const peak = $derived(Math.max(1, ...days.map((d) => d.visits)));
  const month = $derived(days.reduce((n, d) => n + d.visits, 0));
  const dayName = (day: number) => new Date(day * 86_400_000).toLocaleDateString(i18n.locale, { day: 'numeric', month: 'short' });
  const n = (v: number) => v.toLocaleString(i18n.locale);

  const changedHead = $derived(!!head && (meta.description !== head.description || meta.image !== head.image || meta.icon !== head.icon));
</script>

<div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <div
    class="dialog"
    role="dialog"
    aria-modal="true"
    aria-label={t('Site settings')}
    tabindex="-1"
    bind:this={box}
    onkeydown={(e) => e.key === 'Escape' && onclose()}
  >
    <header>
      <h2>{siteHost(name)}</h2>
      <button class="icon" aria-label={t('Close')} onclick={onclose}><Icon name="close" size={16} /></button>
    </header>
    <div class="sections" role="tablist">
      <button role="tab" aria-selected={section === 'people'} onclick={() => (section = 'people')}>{t('People')}</button>
      <button role="tab" aria-selected={section === 'stats'} onclick={() => (section = 'stats')}>{t('Stats')}</button>
      {#if head}
        <button role="tab" aria-selected={section === 'sharing'} onclick={() => (section = 'sharing')}>{t('Sharing')}</button>
      {/if}
    </div>

    <div class="body">
      {#if section === 'people'}
        <p class="muted">
          {t('Editors can change the site’s files and publish changes. Only the owner can delete the site or change its address.')}
        </p>
        <ul class="people">
          {#if owner}
            <li>
              <Avatar name={owner} user={owner} size={30} />
              <span class="who">{owner}{owner === me ? ` (${t('you')})` : ''}</span>
              <span class="role">{t('Owner')}</span>
            </li>
          {/if}
          {#each editors as editor (editor)}
            <li>
              <Avatar name={editor} user={editor} size={30} />
              <span class="who">{editor}{editor === me ? ` (${t('you')})` : ''}</span>
              {#if canManage}
                <button class="ghost small" onclick={() => remove(editor)}>{t('Remove')}</button>
              {:else if editor === me}
                <button class="ghost small" onclick={() => remove(editor)}>{t('Leave')}</button>
              {:else}
                <span class="role">{t('Editor')}</span>
              {/if}
            </li>
          {/each}
        </ul>
        {#if canManage}
          {#if editors.length >= 10}
            <p class="muted">{t('A site can have up to 10 editors.')}</p>
          {:else if choices.length}
            <form class="add" onsubmit={add}>
              <select bind:value={adding} aria-label={t('Friend to add as an editor')}>
                <option value="">{t('Add a friend as an editor…')}</option>
                {#each choices as f (f.username)}<option value={f.username}>{f.nickname || f.username}</option>{/each}
              </select>
              <button class="primary" disabled={!adding || busy}>{t('Add')}</button>
            </form>
          {:else if social.friends.length}
            <p class="muted">{t('All your friends are editors already.')}</p>
          {:else}
            <p class="muted">{t('You can add friends as editors. Add some friends first.')}</p>
          {/if}
        {/if}
        {#if error}<p class="bad">{error}</p>{/if}
      {:else if section === 'stats'}
        {#if statsError}
          <p class="bad">{statsError}</p>
        {:else if !stats}
          <p class="muted">{t('Loading…')}</p>
        {:else}
          <div class="totals">
            <div><strong>{n(month)}</strong><span>{t('visits in 30 days')}</span></div>
            <div><strong>{n(stats.totals.visitors)}</strong><span>{t('people ever')}</span></div>
            <div><strong>{n(stats.totals.likes)}</strong><span>{t('likes')}</span></div>
            <div><strong>{n(stats.totals.notes + stats.totals.comments)}</strong><span>{t('notes and comments')}</span></div>
          </div>
          <svg class="chart" viewBox="0 0 300 80" preserveAspectRatio="none" role="img" aria-label={t('Visits each day for the last 30 days')}>
            {#each days as d, i (d.day)}
              <rect x={i * 10 + 1} y={80 - (d.visits / peak) * 76} width="8" height={Math.max(d.visits ? 2 : 0.6, (d.visits / peak) * 76)} rx="1.5" class:empty={!d.visits}>
                <title>{dayName(d.day)}: {plural(d.visits, '{n} visit', '{n} visits')}</title>
              </rect>
            {/each}
          </svg>
          <div class="axis"><span>{dayName(days[0].day)}</span><span>{t('Today')}</span></div>
          <p class="muted">{t('A visit is one person on one day, however many pages they look at.')}</p>

          <div class="lists">
            <section>
              <h3>{t('Pages')}</h3>
              {#each stats.pages as p (p.path)}
                <div class="row"><span class="path">{p.path}</span><span>{n(p.views)}</span></div>
              {:else}
                <p class="muted">{t('No page views yet.')}</p>
              {/each}
            </section>
            <section>
              <h3>{t('Where they came from')}</h3>
              {#each stats.from as f (f.site)}
                <div class="row"><span class="path">{siteHost(f.site)}</span><span>{n(f.visits)}</span></div>
              {:else}
                <p class="muted">{t('Nobody has followed a link here from another site yet.')}</p>
              {/each}
            </section>
          </div>
        {/if}
      {:else if section === 'sharing' && head}
        <p class="muted">{t('What people see when they share a link to your site, and the icon on its tab. This changes the head of index.bhtml.')}</p>
        <label>
          <span>{t('Description')}</span>
          <textarea bind:value={meta.description} rows="2" maxlength="200" placeholder={t('A line about your site, shown when someone shares a link to it')}></textarea>
        </label>
        <label>
          <span>{t('Preview picture')}</span>
          <select bind:value={meta.image}>
            <option value="">{t('None')}</option>
            {#each images as path (path)}<option value={path}>{path}</option>{/each}
            {#if meta.image && !images.includes(meta.image)}<option value={meta.image}>{meta.image}</option>{/if}
          </select>
        </label>
        <label>
          <span>{t('Tab icon')}</span>
          <select bind:value={meta.icon}>
            <option value="">{t('None')}</option>
            {#each images as path (path)}<option value={path}>{path}</option>{/each}
            {#if meta.icon && !images.includes(meta.icon)}<option value={meta.icon}>{meta.icon}</option>{/if}
          </select>
        </label>
        {#if !images.length}<p class="muted">{t('Upload a picture in Files to use it here.')}</p>{/if}
        <div class="foot">
          <button class="primary" disabled={!changedHead} onclick={() => onhead({ ...meta })}>{t('Save')}</button>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: grid;
    place-items: center;
    padding: 20px;
    background: rgb(0 0 0 / 0.35);
  }
  .dialog {
    display: flex;
    flex-direction: column;
    width: min(520px, 100%);
    max-height: min(640px, 100%);
    border: 1px solid var(--border);
    border-radius: 18px;
    background: var(--card);
    box-shadow: 0 30px 70px -30px rgb(0 0 0 / 0.5);
    outline: 0;
  }
  header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 16px 16px 6px 20px;
  }
  h2 {
    flex: 1;
    min-width: 0;
    margin: 0;
    font-size: 18px;
    overflow-wrap: anywhere;
  }
  h3 {
    margin: 0 0 6px;
    font-size: 13px;
    color: var(--muted);
    font-weight: 600;
  }
  p {
    margin: 0;
  }
  .muted {
    color: var(--muted);
    font-size: 13.5px;
  }
  .bad {
    color: var(--danger);
    font-size: 13.5px;
  }
  button {
    font: inherit;
    cursor: pointer;
  }
  .icon {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: 9px;
    background: none;
    color: var(--text);
  }
  .icon:hover {
    background: var(--hover);
  }
  .sections {
    display: flex;
    gap: 4px;
    padding: 0 16px 10px;
    border-bottom: 1px solid var(--border);
  }
  .sections button {
    padding: 6px 12px;
    border: 0;
    border-radius: 8px;
    background: none;
    color: var(--muted);
    font-size: 13.5px;
    font-weight: 600;
  }
  .sections button[aria-selected='true'] {
    background: var(--accent-soft);
    color: var(--text);
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px 20px 20px;
    overflow: auto;
  }
  .people {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .people li {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .who {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 600;
  }
  .role {
    color: var(--muted);
    font-size: 13px;
  }
  .add,
  .foot {
    display: flex;
    gap: 8px;
  }
  .foot {
    justify-content: flex-end;
  }
  select,
  textarea {
    flex: 1;
    min-width: 0;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 14px;
  }
  textarea {
    resize: vertical;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 13px;
    font-weight: 600;
  }
  .primary,
  .ghost {
    height: 36px;
    padding: 0 16px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
  }
  .small {
    height: 30px;
    padding: 0 12px;
    font-size: 13px;
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
  .ghost {
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--text);
  }
  .totals {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }
  .totals div {
    display: flex;
    flex-direction: column;
    padding: 10px;
    border-radius: 12px;
    background: var(--surface);
  }
  .totals strong {
    font-size: 20px;
  }
  .totals span {
    color: var(--muted);
    font-size: 12px;
  }
  .chart {
    width: 100%;
    height: 90px;
  }
  .chart rect {
    fill: var(--accent);
  }
  .chart rect.empty {
    fill: var(--border);
  }
  .axis {
    display: flex;
    justify-content: space-between;
    margin-top: -8px;
    color: var(--muted);
    font-size: 11.5px;
  }
  .lists {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  .row {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    padding: 4px 0;
    border-bottom: 1px solid var(--border);
    font-size: 13.5px;
  }
  .path {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: ui-monospace, Menlo, monospace;
    font-size: 12.5px;
  }
  @media (max-width: 520px) {
    .totals {
      grid-template-columns: 1fr 1fr;
    }
    .lists {
      grid-template-columns: 1fr;
    }
  }
</style>
