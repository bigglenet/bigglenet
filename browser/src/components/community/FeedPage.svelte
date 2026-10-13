<script lang="ts">
  // biggle://feed: what your friends have been up to (server/src/feed.ts).
  import { api, errorText } from '../../lib/api';
  import { browser, type Tab } from '../../lib/browser.svelte';
  import { follows } from '../../lib/follows.svelte';
  import { ago, when } from '../../lib/community';
  import { t } from '../../lib/i18n.svelte';
  import { siteHome, siteHost } from '../../lib/url';
  import Avatar from '../Avatar.svelte';
  import Icon from '../Icon.svelte';
  import InviteCard from './InviteCard.svelte';
  import Page from './Page.svelte';

  let { tab }: { tab: Tab } = $props();

  type Item = { id: number; kind: string; user: string; avatar: number | null; site: string | null; siteTitle: string | null; data: Record<string, unknown>; at: number };
  type Upcoming = { id: number; title: string; startsAt: number; going: number; answer: string | null };

  let items = $state<Item[] | null>(null);
  let next = $state<number | null>(null);
  let error = $state('');
  let loadingMore = $state(false);
  let events = $state<Upcoming[]>([]);

  async function load() {
    try {
      const r = await api<{ items: Item[]; next: number | null }>('GET', '/api/feed');
      items = r.items;
      next = r.next;
      error = '';
    } catch (e) {
      error = errorText(e);
    }
  }

  async function more() {
    if (!next || loadingMore) return;
    loadingMore = true;
    try {
      const r = await api<{ items: Item[]; next: number | null }>('GET', `/api/feed?before=${next}`);
      items = [...(items ?? []), ...r.items];
      next = r.next;
    } catch (e) {
      error = errorText(e);
    } finally {
      loadingMore = false;
    }
  }

  $effect(() => {
    load();
    api<{ upcoming: Upcoming[] }>('GET', '/api/events').then(
      (r) => (events = r.upcoming.slice(0, 4)),
      () => {},
    );
  });

  const s = (v: unknown) => (typeof v === 'string' ? v : '');

  /** What it says, and where clicking it goes. */
  function describe(i: Item): { text: string; href: string } {
    const d = i.data;
    const site = i.site ? siteHost(i.site) : '';
    switch (i.kind) {
      case 'site-new':
        return { text: t('{who} made a new site: {site}', { who: i.user, site }), href: siteHome(i.site!) };
      case 'site-updated':
        return { text: t('{who} updated {site}', { who: i.user, site }), href: siteHome(i.site!) };
      case 'guestbook':
        return { text: t('{who} signed {site}’s guestbook: “{body}”', { who: i.user, site, body: s(d.body) }), href: siteHome(i.site!) };
      case 'club-new':
        return { text: t('{who} started a club: {club}', { who: i.user, club: `${s(d.emoji)} ${s(d.name)}`.trim() }), href: `biggle://clubs/${d.club}` };
      case 'club-joined':
        return { text: t('{who} joined {club}', { who: i.user, club: `${s(d.emoji)} ${s(d.name)}`.trim() }), href: `biggle://clubs/${d.club}` };
      case 'event-new':
        return { text: t('{who} is planning {event} · {when}', { who: i.user, event: s(d.title), when: when(Number(d.startsAt)) }), href: `biggle://events/${d.event}` };
      case 'thread-new':
        return { text: t('{who} started a thread on the board: {title}', { who: i.user, title: s(d.title) }), href: `biggle://board.biggle/thread/${d.thread}` };
      case 'collection-new':
        return { text: t('{who} made a collection: {title}', { who: i.user, title: s(d.title) }), href: `biggle://collections/${d.collection}` };
      case 'joined':
        return {
          text: d.via ? t('{who} joined the Bigglenet, invited by {via}', { who: i.user, via: s(d.via) }) : t('{who} joined the Bigglenet', { who: i.user }),
          href: `biggle://u/${i.user}`,
        };
      default:
        return { text: t('{who} did something', { who: i.user }), href: `biggle://u/${i.user}` };
    }
  }

  const open = (href: string) => browser.go(tab, href);
  const places = [
    { href: 'biggle://clubs', label: 'Clubs', icon: 'users' },
    { href: 'biggle://events', label: 'Events', icon: 'clock' },
    { href: 'biggle://board.biggle', label: 'The board', icon: 'chat' },
    { href: 'biggle://collections', label: 'Collections', icon: 'star' },
  ] as const;
</script>

<Page wide>
  <header class="top">
    <h1>{t('Feed')}</h1>
    <nav class="row" aria-label={t('Community')}>
      {#each places as p (p.href)}
        <button class="ghost place" onclick={() => open(p.href)}><Icon name={p.icon} size={15} /> {t(p.label)}</button>
      {/each}
    </nav>
  </header>

  <div class="layout">
    <main>
      {#if error}
        <p class="bad">{error}</p>
      {:else if !items}
        <p class="muted">{t('Loading…')}</p>
      {:else if !items.length}
        <div class="card empty">
          <p>{t('Nothing here yet.')}</p>
          <p class="small">{t('When your friends make sites, sign guestbooks or plan events, you’ll see it here.')}</p>
        </div>
      {:else}
        <ul class="list">
          {#each items as i (i.id)}
            {@const d = describe(i)}
            <li>
              <button class="item" onclick={() => open(d.href)}>
                <Avatar name={i.user} user={i.user} size={34} />
                <span class="text">
                  <span>{d.text}</span>
                  <span class="sub">{ago(i.at)}{i.siteTitle && i.kind !== 'guestbook' ? ` · ${i.siteTitle}` : ''}</span>
                </span>
              </button>
            </li>
          {/each}
        </ul>
        {#if next}
          <p class="more"><button class="ghost" disabled={loadingMore} onclick={more}>{loadingMore ? t('Loading…') : t('Show older')}</button></p>
        {/if}
      {/if}
    </main>

    <aside class="stack">
      {#if follows.list.length}
        <section class="card stack">
          <div class="row">
            <h3 class="grow">{t('Following')}</h3>
            <button class="link small" onclick={() => open('biggle://nox/following')}>{t('All')}</button>
          </div>
          {#each [...follows.list].sort((a, b) => Number(b.changed) - Number(a.changed)).slice(0, 5) as f (f.site)}
            <button class="followed" onclick={() => open(siteHome(f.site, f.tld))}>
              <span class="grow">{siteHost(f.site, f.tld)}</span>
              {#if f.changed}<span class="dot" title={t('Changed since you looked')}></span>{/if}
            </button>
          {/each}
        </section>
      {/if}
      <InviteCard />
      <section class="card stack">
        <div class="row">
          <h3 class="grow">{t('Coming up')}</h3>
          <button class="link small" onclick={() => open('biggle://events/new')}>{t('Plan one')}</button>
        </div>
        {#each events as e (e.id)}
          <button class="event" onclick={() => open(`biggle://events/${e.id}`)}>
            <span class="name">{e.title}</span>
            <span class="muted small">{when(e.startsAt)}{e.answer === 'going' ? ` · ${t('you’re going')}` : ''}</span>
          </button>
        {:else}
          <p class="muted small">{t('No events planned. Make a game night?')}</p>
        {/each}
      </section>
    </aside>
  </div>
</Page>

<style>
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px;
    gap: 20px;
    align-items: start;
  }
  .place {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .more {
    margin-top: 14px;
    text-align: center;
  }
  .followed {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border: 0;
    border-radius: 8px;
    background: none;
    color: var(--text);
    font: inherit;
    font-size: 14px;
    text-align: left;
    cursor: pointer;
  }
  .followed:hover {
    background: var(--hover);
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--danger);
  }
  .event {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 8px 10px;
    border: 0;
    border-radius: 10px;
    background: var(--accent-soft);
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .event .name {
    font-weight: 600;
  }
  @media (max-width: 820px) {
    .layout {
      grid-template-columns: 1fr;
    }
    aside {
      order: -1;
    }
  }
</style>
