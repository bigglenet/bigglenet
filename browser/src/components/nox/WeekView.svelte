<script lang="ts">
  // biggle://nox/week: "This week on the Bigglenet": new sites, the most visited ones, the busiest
  // guestbooks and threads.
  import { api, errorText } from '../../lib/api';
  import { browser, type Tab } from '../../lib/browser.svelte';
  import { i18n, plural, t } from '../../lib/i18n.svelte';
  import { siteHome, siteHost } from '../../lib/url';
  import Icon from '../Icon.svelte';
  import Page from '../community/Page.svelte';

  let { tab }: { tab: Tab } = $props();

  type Site = { name: string; tld: 'biggle' | 'b'; title: string | null };
  type Week = {
    new: (Site & { created_at: number })[];
    visited: (Site & { visits: number })[];
    guestbooks: (Site & { notes: number })[];
    threads: { id: number; title: string; board: string; posts: number }[];
  };

  let week = $state<Week | null>(null);
  let error = $state('');

  $effect(() => {
    api<Week>('GET', '/api/discover/week').then(
      (w) => (week = w),
      (e) => (error = errorText(e)),
    );
  });
</script>

{#snippet sites(list: { s: Site; note: string }[])}
  <ul class="list">
    {#each list as { s, note } (s.name)}
      <li>
        <button class="item" onclick={() => browser.go(tab, siteHome(s.name, s.tld))}>
          <span class="emoji-tile">{s.name[0].toUpperCase()}</span>
          <span class="text">
            <span class="name">{siteHost(s.name, s.tld)}</span>
            <span class="sub">{s.title ? `${s.title} · ` : ''}{note}</span>
          </span>
        </button>
      </li>
    {/each}
  </ul>
{/snippet}

<Page>
  <button class="back" onclick={() => browser.go(tab, 'biggle://nox')}><Icon name="back" size={16} /> Nox</button>
  <header class="top"><h1>{t('This week on the Bigglenet')}</h1></header>
  {#if error}
    <p class="bad">{error}</p>
  {:else if !week}
    <p class="muted">{t('Loading…')}</p>
  {:else}
    <h2>{t('New sites')}</h2>
    {#if week.new.length}
      {@render sites(week.new.map((s) => ({ s, note: new Date(s.created_at * 1000).toLocaleDateString(i18n.locale, { weekday: 'long' }) })))}
    {:else}
      <p class="muted small">{t('No new sites this week.')}</p>
    {/if}

    <h2>{t('Most visited')}</h2>
    {#if week.visited.length}
      {@render sites(week.visited.map((s) => ({ s, note: plural(s.visits, '{n} visit', '{n} visits') })))}
    {:else}
      <p class="muted small">{t('Nobody has been anywhere yet.')}</p>
    {/if}

    {#if week.guestbooks.length}
      <h2>{t('Busiest guestbooks')}</h2>
      {@render sites(week.guestbooks.map((s) => ({ s, note: plural(s.notes, '{n} new note', '{n} new notes') })))}
    {/if}

    {#if week.threads.length}
      <h2>{t('Talked about on the board')}</h2>
      <ul class="list">
        {#each week.threads as th (th.id)}
          <li>
            <button class="item" onclick={() => browser.go(tab, `biggle://board.biggle/thread/${th.id}`)}>
              <Icon name="chat" size={18} />
              <span class="text">
                <span class="name">{th.title}</span>
                <span class="sub">{plural(th.posts, '{n} post this week', '{n} posts this week')}</span>
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</Page>
