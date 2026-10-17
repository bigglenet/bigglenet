<script lang="ts">
  // biggle://challenge: the weekly challenge (server/src/challenges.ts). Admins set a theme,
  // people enter one of their sites, everyone votes for their favourite, and the winner is the
  // site of the day.
  import { account } from '../../lib/account.svelte';
  import { api, errorText } from '../../lib/api';
  import { browser, type Tab } from '../../lib/browser.svelte';
  import { SERVER } from '../../lib/config';
  import { i18n, plural, t } from '../../lib/i18n.svelte';
  import { sites } from '../../lib/sites.svelte';
  import { siteHome, siteHost } from '../../lib/url';
  import Trans from '../Trans.svelte';
  import Page from './Page.svelte';

  let { tab }: { tab: Tab } = $props();

  type Entry = { site: string; title: string | null; username: string; votes: number; mine: boolean };
  type Data = {
    challenge: { id: number; title: string; about: string | null; startsAt: number; endsAt: number; over: boolean; winner: string | null } | null;
    entries: Entry[];
    you: { entry: string | null; vote: string | null };
    past: { id: number; title: string; endedAt: number; winner: string | null; winnerTitle: string | null }[];
  };

  let data = $state<Data | null>(null);
  let error = $state('');
  let busy = $state(false);
  let picking = $state('');
  let form = $state({ title: '', about: '', days: 7 });

  const load = () =>
    api<Data>('GET', '/api/challenge').then(
      (d) => (data = d),
      (e) => (error = errorText(e)),
    );
  $effect(() => {
    load();
    sites.refreshMine();
  });

  const myLive = $derived((sites.mine ?? []).filter((s) => s.status === 'live' && s.role !== 'editor'));
  const open = $derived(data?.challenge && !data.challenge.over ? data.challenge : null);
  const ends = (s: number) => new Date(s * 1000).toLocaleString(i18n.locale, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  const day = (s: number) => new Date(s * 1000).toLocaleDateString(i18n.locale, { day: 'numeric', month: 'short', year: 'numeric' });

  async function act(fn: () => Promise<unknown>) {
    if (busy) return;
    busy = true;
    error = '';
    try {
      await fn();
      await load();
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  }

  const enter = () => act(() => api('POST', `/api/challenge/${open!.id}/enter`, { site: picking }));
  const leave = () => act(() => api('DELETE', `/api/challenge/${open!.id}/enter`));
  const vote = (site: string) => act(() => api('POST', `/api/challenge/${open!.id}/vote`, { site }));
  const start = (e: SubmitEvent) => {
    e.preventDefault();
    act(async () => {
      await api('POST', '/api/challenge', form);
      form = { title: '', about: '', days: 7 };
    });
  };
</script>

<Page>
  <header class="top"><h1>{t('Weekly challenge')}</h1></header>
  {#if error}<p class="bad" role="alert">{error}</p>{/if}

  {#if !data}
    <p class="muted">{t('Loading…')}</p>
  {:else}
    {#if data.challenge}
      {@const c = data.challenge}
      <section class="card theme">
        <p class="muted small">{c.over ? t('The last challenge') : t('This week’s theme')}</p>
        <h2>{c.title}</h2>
        {#if c.about}<p>{c.about}</p>{/if}
        <p class="muted small">{c.over ? t('Ended {when}', { when: day(c.endsAt) }) : t('Voting ends {when}', { when: ends(c.endsAt) })}</p>
        {#if c.over && c.winner}
          <p class="winner">🏆 <Trans text={t('{site} won! It’s the site of the day.')}>{#snippet site()}<button class="link" onclick={() => browser.go(tab, siteHome(c.winner!))}>{siteHost(c.winner!)}</button>{/snippet}</Trans></p>
        {:else if c.over}
          <p class="muted">{t('Nobody won this one: no votes came in.')}</p>
        {/if}
      </section>

      {#if open}
        <section class="card">
          {#if data.you.entry}
            <div class="row">
              <span class="grow">{t('You entered {site}.', { site: siteHost(data.you.entry) })}</span>
              <button class="ghost" disabled={busy} onclick={leave}>{t('Take it out')}</button>
            </div>
          {:else if myLive.length}
            <form class="row" onsubmit={(e) => (e.preventDefault(), enter())}>
              <select bind:value={picking} aria-label={t('Your site')}>
                <option value="" disabled>{t('Pick one of your sites…')}</option>
                {#each myLive as s (s.name)}<option value={s.name}>{siteHost(s.name, s.tld)}</option>{/each}
              </select>
              <button class="primary" disabled={busy || !picking}>{t('Enter it')}</button>
            </form>
          {:else}
            <p class="muted">{t('Make a site for it, then enter it here once an admin approves it.')}</p>
            <button class="ghost" onclick={() => browser.go(tab, 'biggle://sites')}>{t('Make a site')}</button>
          {/if}
        </section>
      {/if}

      <h2>{plural(data.entries.length, '{n} entry', '{n} entries')}</h2>
      {#if data.entries.length}
        <ul class="list">
          {#each data.entries as e (e.site)}
            <li class="item entry" class:won={c.winner === e.site}>
              <button class="shot" onclick={() => browser.go(tab, siteHome(e.site))} title={t('Visit')}>
                <img src={`${SERVER}/site/${encodeURIComponent(e.site)}/.button`} width="88" height="31" alt="" />
              </button>
              <div class="text">
                <button class="link name" onclick={() => browser.go(tab, siteHome(e.site))}>{siteHost(e.site)}</button>
                <span class="sub">{e.title ? `${e.title} · ` : ''}{t('by {who}', { who: e.username })}</span>
              </div>
              <span class="votes">{plural(e.votes, '{n} vote', '{n} votes')}</span>
              {#if open && !e.mine}
                <button class={data.you.vote === e.site ? 'primary' : 'ghost'} disabled={busy} aria-pressed={data.you.vote === e.site} onclick={() => vote(e.site)}>
                  {data.you.vote === e.site ? t('Your vote') : t('Vote')}
                </button>
              {/if}
            </li>
          {/each}
        </ul>
      {:else}
        <p class="muted empty">{open ? t('No entries yet. Be the first!') : t('Nothing was entered.')}</p>
      {/if}
    {:else}
      <p class="muted empty">{t('There’s no challenge on yet. Admins start one each week.')}</p>
    {/if}

    {#if account.user?.admin && !open}
      <form class="card stack" onsubmit={start}>
        <h2>{t('Start the next challenge')}</h2>
        <label class="cp-field">{t('Theme')}<input bind:value={form.title} maxlength="100" required placeholder={t('Make a site about your pet')} /></label>
        <label class="cp-field">{t('More about it (optional)')}<textarea bind:value={form.about} rows="2" maxlength="1000"></textarea></label>
        <label class="cp-field">{t('How many days')}<input type="number" min="1" max="30" bind:value={form.days} /></label>
        <div class="row"><button class="primary" disabled={busy || !form.title.trim()}>{t('Start it')}</button></div>
      </form>
    {/if}

    {#if data.past.length}
      <h2>{t('Past winners')}</h2>
      <ul class="list">
        {#each data.past as p (p.id)}
          <li class="item">
            <div class="text">
              <span class="name">{p.title}</span>
              <span class="sub">
                {day(p.endedAt)} ·
                {#if p.winner}<button class="link" onclick={() => browser.go(tab, siteHome(p.winner!))}>🏆 {siteHost(p.winner)}</button>{:else}{t('no winner')}{/if}
              </span>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</Page>

<style>
  .theme h2 {
    margin: 2px 0 6px;
    font-size: 24px;
  }
  .winner {
    margin-top: 10px;
    font-weight: 600;
  }
  .entry {
    align-items: center;
  }
  .entry .text {
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: flex-start;
    min-width: 0;
  }
  form.row {
    flex-wrap: nowrap;
  }
  form.row select {
    flex: 1;
    width: auto;
    min-width: 0;
  }
  .entry.won {
    outline: 2px solid var(--accent);
    border-radius: 12px;
  }
  .shot {
    flex: none;
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
  }
  .shot img {
    display: block;
    image-rendering: pixelated;
  }
  .votes {
    color: var(--muted);
    font-size: 13px;
    white-space: nowrap;
  }
</style>
