<script lang="ts">
  // biggle://clubs: your clubs, invites and open clubs to join. biggle://clubs/<id>: one club,
  // with its members, chat, shared site and events (server/src/clubs.ts).
  import { account } from '../../lib/account.svelte';
  import { api, errorText } from '../../lib/api';
  import { browser, type Tab } from '../../lib/browser.svelte';
  import { when } from '../../lib/community';
  import { plural, t } from '../../lib/i18n.svelte';
  import { sites } from '../../lib/sites.svelte';
  import { social } from '../../lib/social.svelte';
  import { siteHome, siteHost } from '../../lib/url';
  import Avatar from '../Avatar.svelte';
  import Icon from '../Icon.svelte';
  import Linked from './Linked.svelte';
  import Page from './Page.svelte';

  let { tab, path }: { tab: Tab; path: string } = $props();

  type Card = { id: number; name: string; description: string | null; emoji: string | null; open: boolean; site: string | null; members: number; from?: string | null };
  type Club = {
    club: Card;
    owner: string | null;
    you: { member: boolean; invited: boolean; owner: boolean; canManage: boolean };
    members: { username: string; avatar: number | null; joinedAt: number }[];
    chat: number | null;
    site: { name: string; title: string | null; live: boolean } | null;
    events: { id: number; title: string; startsAt: number; place: string | null; going: number }[];
  };

  const id = $derived(Number(path) || null);

  // --- The list ---
  let lists = $state<{ mine: Card[]; open: Card[]; invited: Card[] } | null>(null);
  let creating = $state(false);
  let form = $state({ name: '', emoji: '', description: '', open: true });

  // --- One club ---
  let club = $state<Club | null>(null);
  let editing = $state(false);
  let edit = $state({ name: '', emoji: '', description: '', open: true, site: '' });
  let inviting = $state('');
  let confirmDelete = $state(false);

  let error = $state('');
  let busy = $state(false);

  async function load() {
    error = '';
    try {
      if (id) club = await api<Club>('GET', `/api/clubs/${id}`);
      else lists = await api('GET', '/api/clubs');
    } catch (e) {
      error = errorText(e);
    }
  }

  $effect(() => {
    void id;
    club = null;
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
      const r = await api<{ id: number }>('POST', '/api/clubs', form);
      creating = false;
      form = { name: '', emoji: '', description: '', open: true };
      browser.go(tab, `biggle://clubs/${r.id}`);
    });
  };

  const join = () => act(async () => (await api('POST', `/api/clubs/${id}/join`), await load(), sites.refreshMine()));
  const leave = () =>
    act(async () => {
      await api('POST', `/api/clubs/${id}/leave`);
      sites.refreshMine();
      browser.go(tab, 'biggle://clubs', 'replace');
    });
  const remove = (username: string) => act(async () => (await api('DELETE', `/api/clubs/${id}/members/${encodeURIComponent(username)}`), await load()));
  const del = () =>
    act(async () => {
      await api('DELETE', `/api/clubs/${id}`);
      sites.refreshMine();
      browser.go(tab, 'biggle://clubs', 'replace');
    });

  function startEdit() {
    if (!club) return;
    edit = { name: club.club.name, emoji: club.club.emoji ?? '', description: club.club.description ?? '', open: club.club.open, site: club.club.site ?? '' };
    editing = true;
    if (!sites.mine) sites.refreshMine();
  }
  const save = (e: SubmitEvent) => {
    e.preventDefault();
    act(async () => {
      await api('PATCH', `/api/clubs/${id}`, edit);
      editing = false;
      await load();
      sites.refreshMine();
    });
  };

  const sendInvite = (e: SubmitEvent) => {
    e.preventDefault();
    if (!inviting) return;
    act(async () => {
      await api('POST', `/api/clubs/${id}/invite`, { username: inviting });
      browser.say(t('Invited {who}', { who: inviting }));
      inviting = '';
    });
  };

  // Friends who aren't in it yet, to invite.
  const invitable = $derived(club ? social.friends.filter((f) => !club!.members.some((m) => m.username === f.username)) : []);
  // Your own sites, to share with the club.
  const mySites = $derived((sites.mine ?? []).filter((s) => s.role !== 'editor'));
  const me = $derived(account.user?.username ?? '');

  // The tab shows the club's name.
  $effect(() => {
    if (club) tab.title = club.club.name;
  });
</script>

<Page>
  {#if id}
    <button class="back" onclick={() => browser.go(tab, 'biggle://clubs')}><Icon name="back" size={16} /> {t('Clubs')}</button>
    {#if error && !club}
      <p class="bad">{error}</p>
    {:else if !club}
      <p class="muted">{t('Loading…')}</p>
    {:else}
      {@const c = club.club}
      <header class="top">
        <span class="emoji-tile big">{c.emoji || c.name[0]?.toUpperCase()}</span>
        <div class="grow">
          <h1>{c.name}</h1>
          <p class="muted">
            {plural(c.members, '{n} member', '{n} members')} · {c.open ? t('Open: anyone can join') : t('Closed: members invite people')}
          </p>
        </div>
        {#if club.you.member}
          {#if club.chat}<button class="primary" onclick={() => social.showChat(club!.chat!)}><Icon name="chat" size={15} /> {t('Club chat')}</button>{/if}
        {:else if c.open || club.you.invited}
          <button class="primary" disabled={busy} onclick={join}>{t('Join')}</button>
        {/if}
      </header>

      {#if club.you.invited && !club.you.member}<p class="card">{t('You’ve been invited to join.')}</p>{/if}
      {#if c.description}<p class="description"><Linked text={c.description} /></p>{/if}
      {#if error}<p class="bad">{error}</p>{/if}

      {#if editing}
        <form class="card stack" onsubmit={save}>
          <h3>{t('Club settings')}</h3>
          <div class="row">
            <input class="emoji-in" bind:value={edit.emoji} maxlength="4" aria-label={t('Emoji')} placeholder="🎲" />
            <input class="grow" bind:value={edit.name} maxlength="40" aria-label={t('Name')} required />
          </div>
          <textarea bind:value={edit.description} rows="3" maxlength="500" placeholder={t('What’s the club about?')} aria-label={t('Description')}></textarea>
          <label class="check"><input type="checkbox" bind:checked={edit.open} /> {t('Anyone can join (otherwise members invite people)')}</label>
          <label class="cp-field">
            {t('Club site: every member can edit it')}
            <select bind:value={edit.site}>
              <option value="">{t('No site')}</option>
              {#each mySites as s (s.name)}<option value={s.name}>{siteHost(s.name, s.tld)}</option>{/each}
              {#if edit.site && !mySites.some((s) => s.name === edit.site)}<option value={edit.site}>{siteHost(edit.site)}</option>{/if}
            </select>
          </label>
          <div class="row">
            <button class="primary" disabled={busy}>{t('Save')}</button>
            <button type="button" class="ghost" onclick={() => (editing = false)}>{t('Cancel')}</button>
          </div>
        </form>
      {/if}

      {#if club.site}
        <h2>{t('Club site')}</h2>
        <div class="card row">
          <div class="grow">
            <p class="name">{siteHost(club.site.name)}</p>
            {#if club.site.title}<p class="muted small">{club.site.title}</p>{/if}
          </div>
          {#if club.site.live}<button class="ghost" onclick={() => browser.go(tab, siteHome(club!.site!.name))}>{t('Visit')}</button>{/if}
          {#if club.you.member}<button class="primary" onclick={() => browser.go(tab, `biggle://sites/${club!.site!.name}`)}>{t('Edit')}</button>{/if}
        </div>
      {/if}

      <h2 class="row">
        <span class="grow">{t('Events')}</span>
        {#if club.you.member}<button class="link small" onclick={() => browser.go(tab, `biggle://events/new?club=${id}`)}>{t('Plan an event')}</button>{/if}
      </h2>
      {#if club.events.length}
        <ul class="list">
          {#each club.events as e (e.id)}
            <li>
              <button class="item" onclick={() => browser.go(tab, `biggle://events/${e.id}`)}>
                <Icon name="clock" size={18} />
                <span class="text">
                  <span class="name">{e.title}</span>
                  <span class="sub">{when(e.startsAt)} · {plural(e.going, '{n} going', '{n} going')}</span>
                </span>
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="muted small">{t('Nothing planned yet.')}</p>
      {/if}

      <h2>{t('Members')}</h2>
      <ul class="list">
        {#each club.members as m (m.username)}
          <li class="row member">
            <button class="item grow" onclick={() => browser.go(tab, `biggle://u/${m.username}`)}>
              <Avatar name={m.username} user={m.username} size={30} />
              <span class="text">
                <span class="name">{m.username}{m.username === me ? ` (${t('you')})` : ''}</span>
              </span>
              {#if m.username === club.owner}<span class="pill">{t('Owner')}</span>{/if}
            </button>
            {#if club.you.canManage && m.username !== club.owner}
              <button class="ghost remove" disabled={busy} onclick={() => remove(m.username)}>{t('Remove')}</button>
            {/if}
          </li>
        {/each}
      </ul>

      {#if club.you.member}
        {#if invitable.length && club.members.length < 30}
          <form class="row invite" onsubmit={sendInvite}>
            <select class="grow" bind:value={inviting} aria-label={t('Friend to invite')}>
              <option value="">{t('Invite a friend…')}</option>
              {#each invitable as f (f.username)}<option value={f.username}>{f.nickname || f.username}</option>{/each}
            </select>
            <button class="primary" disabled={!inviting || busy}>{t('Invite')}</button>
          </form>
        {/if}
        <div class="row actions">
          {#if club.you.canManage && !editing}<button class="ghost" onclick={startEdit}>{t('Club settings')}</button>{/if}
          <button class="ghost" disabled={busy} onclick={leave}>{t('Leave the club')}</button>
          {#if club.you.canManage}
            {#if confirmDelete}
              <button class="danger" disabled={busy} onclick={del}>{t('Delete the club')}</button>
              <button class="link small" onclick={() => (confirmDelete = false)}>{t('Keep it')}</button>
            {:else}
              <button class="ghost" onclick={() => (confirmDelete = true)}>{t('Delete…')}</button>
            {/if}
          {/if}
        </div>
      {/if}
    {/if}
  {:else}
    <header class="top">
      <h1>{t('Clubs')}</h1>
      <button class="primary" onclick={() => (creating = !creating)}><Icon name="plus" size={15} /> {t('Start a club')}</button>
    </header>
    <p class="muted intro">{t('A club is a group with its own chat, events and, if you like, a site everyone in it can edit.')}</p>

    {#if creating}
      <form class="card stack" onsubmit={create}>
        <div class="row">
          <input class="emoji-in" bind:value={form.emoji} maxlength="4" aria-label={t('Emoji')} placeholder="🎲" />
          <input class="grow" bind:value={form.name} maxlength="40" placeholder={t('Club name')} aria-label={t('Club name')} required />
        </div>
        <textarea bind:value={form.description} rows="2" maxlength="500" placeholder={t('What’s the club about?')} aria-label={t('Description')}></textarea>
        <label class="check"><input type="checkbox" bind:checked={form.open} /> {t('Anyone can join (otherwise members invite people)')}</label>
        <div class="row">
          <button class="primary" disabled={busy || !form.name.trim()}>{t('Start the club')}</button>
          <button type="button" class="ghost" onclick={() => (creating = false)}>{t('Cancel')}</button>
        </div>
      </form>
    {/if}
    {#if error}<p class="bad">{error}</p>{/if}

    {#if !lists}
      {#if !error}<p class="muted">{t('Loading…')}</p>{/if}
    {:else}
      {#snippet clubList(list: Card[], note?: (c: Card) => string)}
        <ul class="list">
          {#each list as c (c.id)}
            <li>
              <button class="item" onclick={() => browser.go(tab, `biggle://clubs/${c.id}`)}>
                <span class="emoji-tile">{c.emoji || c.name[0]?.toUpperCase()}</span>
                <span class="text">
                  <span class="name">{c.name}</span>
                  <span class="sub">{note ? note(c) : plural(c.members, '{n} member', '{n} members')}{c.description ? ` · ${c.description}` : ''}</span>
                </span>
                {#if !c.open}<span class="pill">{t('Closed')}</span>{/if}
              </button>
            </li>
          {/each}
        </ul>
      {/snippet}

      {#if lists.invited.length}
        <h2>{t('Invites')}</h2>
        {@render clubList(lists.invited, (c) => t('{who} invited you', { who: c.from ?? '' }))}
      {/if}
      <h2>{t('Your clubs')}</h2>
      {#if lists.mine.length}
        {@render clubList(lists.mine)}
      {:else}
        <p class="muted small">{t('You’re not in any clubs yet.')}</p>
      {/if}
      <h2>{t('Open clubs')}</h2>
      {#if lists.open.length}
        {@render clubList(lists.open)}
      {:else}
        <p class="muted small">{t('No open clubs to join yet. Start one!')}</p>
      {/if}
    {/if}
  {/if}
</Page>

<style>
  .emoji-tile.big {
    width: 56px;
    height: 56px;
    border-radius: 16px;
    font-size: 28px;
  }
  .description {
    margin: 0 0 16px;
  }
  .intro {
    margin-bottom: 16px;
  }
  .emoji-in {
    width: 64px;
    text-align: center;
    font-size: 20px;
  }
  .name {
    font-weight: 600;
  }
  .member {
    flex-wrap: nowrap;
    padding-right: 10px;
  }
  .remove {
    height: 30px;
    padding: 0 12px;
    font-size: 13px;
  }
  .invite {
    margin-top: 12px;
  }
  .actions {
    margin-top: 24px;
  }
  h2.row {
    margin-top: 28px;
  }
  form.card {
    margin-bottom: 16px;
  }
</style>
