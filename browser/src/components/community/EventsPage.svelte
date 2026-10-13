<script lang="ts">
  // biggle://events: what's coming up. biggle://events/new: plan one (?club=<id> for a club's).
  // biggle://events/<id>: one event, who's coming, and your answer (server/src/events.ts).
  import { api, errorText } from '../../lib/api';
  import { browser, type Tab } from '../../lib/browser.svelte';
  import { fromLocalInput, toLocalInput, when } from '../../lib/community';
  import { plural, t } from '../../lib/i18n.svelte';
  import { social } from '../../lib/social.svelte';
  import { parse } from '../../lib/url';
  import Avatar from '../Avatar.svelte';
  import Icon from '../Icon.svelte';
  import Linked from './Linked.svelte';
  import Page from './Page.svelte';

  let { tab, path }: { tab: Tab; path: string } = $props();

  type Who = 'friends' | 'club' | 'invited' | 'everyone';
  type Card = { id: number; title: string; place: string | null; startsAt: number; endsAt: number | null; who: Who; maker: string | null; club: { id: number; name: string } | null; going: number; answer: string | null };
  type Person = { username: string; avatar: number | null };
  type Detail = {
    event: { id: number; title: string; description: string | null; place: string | null; startsAt: number; endsAt: number | null; who: Who; maker: string | null; club: { id: number; name: string } | null; over: boolean };
    going: Person[];
    maybe: Person[];
    no: Person[];
    invited: Person[];
    you: { answer: string | null; canEdit: boolean; canDelete: boolean };
  };

  const view = $derived(path === 'new' ? 'new' : Number(path) ? 'event' : 'list');
  const id = $derived(Number(path) || null);

  let lists = $state<{ upcoming: Card[]; recent: Card[] } | null>(null);
  let detail = $state<Detail | null>(null);
  let clubs = $state<{ id: number; name: string }[]>([]);
  let error = $state('');
  let busy = $state(false);
  let editing = $state(false);
  let confirmDelete = $state(false);
  let inviting = $state('');

  // The form, for a new event or changing one.
  const blank = () => {
    // Tomorrow at 20:00 is a good guess for a game night.
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(20, 0, 0, 0);
    return { title: '', startsAt: toLocalInput(d.getTime() / 1000), endsAt: '', place: '', description: '', who: 'friends' as Who, club: '', invite: [] as string[] };
  };
  let form = $state(blank());

  async function load() {
    error = '';
    try {
      if (view === 'list') lists = await api('GET', '/api/events');
      else if (view === 'event') detail = await api<Detail>('GET', `/api/events/${id}`);
    } catch (e) {
      error = errorText(e);
    }
  }

  async function loadClubs() {
    try {
      clubs = (await api<{ mine: { id: number; name: string }[] }>('GET', '/api/clubs')).mine;
    } catch {}
  }

  $effect(() => {
    void path;
    detail = null;
    editing = false;
    confirmDelete = false;
    if (view === 'new') {
      form = blank();
      const club = new URLSearchParams(parse(tab.url)?.search ?? '').get('club');
      if (club) {
        form.club = club;
        form.who = 'club';
      }
      loadClubs();
    }
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

  const payload = () => ({
    title: form.title,
    startsAt: fromLocalInput(form.startsAt),
    endsAt: fromLocalInput(form.endsAt),
    place: form.place,
    description: form.description,
    who: form.who,
    club: form.club ? Number(form.club) : null,
  });

  const create = (e: SubmitEvent) => {
    e.preventDefault();
    act(async () => {
      const r = await api<{ id: number }>('POST', '/api/events', { ...payload(), invite: form.invite });
      browser.go(tab, `biggle://events/${r.id}`, 'replace');
    });
  };

  function startEdit() {
    if (!detail) return;
    const ev = detail.event;
    form = {
      title: ev.title,
      startsAt: toLocalInput(ev.startsAt),
      endsAt: ev.endsAt ? toLocalInput(ev.endsAt) : '',
      place: ev.place ?? '',
      description: ev.description ?? '',
      who: ev.who,
      club: ev.club ? String(ev.club.id) : '',
      invite: [],
    };
    editing = true;
    loadClubs();
  }

  const save = (e: SubmitEvent) => {
    e.preventDefault();
    act(async () => {
      await api('PATCH', `/api/events/${id}`, payload());
      editing = false;
      await load();
    });
  };

  const answer = (a: 'going' | 'maybe' | 'no') => act(async () => (await api('POST', `/api/events/${id}/answer`, { answer: a }), await load()));
  const callOff = () => act(async () => (await api('DELETE', `/api/events/${id}`), browser.go(tab, 'biggle://events', 'replace')));
  const sendInvite = (e: SubmitEvent) => {
    e.preventDefault();
    if (!inviting) return;
    act(async () => {
      await api('POST', `/api/events/${id}/invite`, { usernames: [inviting] });
      browser.say(t('Invited {who}', { who: inviting }));
      inviting = '';
      await load();
    });
  };

  /** Save an .ics file, for adding it to a calendar. */
  function addToCalendar(ev: Detail['event']) {
    const stamp = (s: number) => new Date(s * 1000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const text = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`);
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Bigglenet//Events//EN',
      'BEGIN:VEVENT',
      `UID:event-${ev.id}@bigglenet`,
      `DTSTAMP:${stamp(Date.now() / 1000)}`,
      `DTSTART:${stamp(ev.startsAt)}`,
      `DTEND:${stamp(ev.endsAt ?? ev.startsAt + 7200)}`,
      `SUMMARY:${text(ev.title)}`,
      ...(ev.place ? [`LOCATION:${text(ev.place)}`] : []),
      `DESCRIPTION:${text([ev.description ?? '', `biggle://events/${ev.id}`].filter(Boolean).join('\n\n'))}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ];
    const url = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ev.title.replace(/[^\w -]+/g, '').trim() || 'event'}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  const friendsNotIn = $derived(
    detail ? social.friends.filter((f) => ![...detail!.going, ...detail!.maybe, ...detail!.no, ...detail!.invited].some((p) => p.username === f.username)) : [],
  );
  // The tab shows the event's name.
  $effect(() => {
    if (detail) tab.title = detail.event.title;
  });

  const WHO_LABEL: Record<Who, string> = {
    friends: 'My friends',
    club: 'The club’s members',
    invited: 'Only people I invite',
    everyone: 'Everyone on the Bigglenet',
  };
</script>

{#snippet eventForm(onsubmit: (e: SubmitEvent) => void, isNew: boolean)}
  <form class="card stack" {onsubmit}>
    <input bind:value={form.title} maxlength="80" placeholder={t('What’s happening? (Game night)')} aria-label={t('Name')} required />
    <div class="row">
      <label class="cp-field grow">{t('Starts')}<input type="datetime-local" bind:value={form.startsAt} required /></label>
      <label class="cp-field grow">{t('Ends (if you like)')}<input type="datetime-local" bind:value={form.endsAt} /></label>
    </div>
    <label class="cp-field">{t('Where')}<input bind:value={form.place} maxlength="200" placeholder={t('A site, a call, anywhere')} /></label>
    <textarea bind:value={form.description} rows="3" maxlength="1000" placeholder={t('Anything people should know')} aria-label={t('Description')}></textarea>
    {#if clubs.length}
      <label class="cp-field">
        {t('For a club')}
        <select bind:value={form.club} onchange={() => (form.who = form.club ? 'club' : form.who === 'club' ? 'friends' : form.who)}>
          <option value="">{t('No club')}</option>
          {#each clubs as c (c.id)}<option value={String(c.id)}>{c.name}</option>{/each}
        </select>
      </label>
    {/if}
    <label class="cp-field">
      {t('Who can see it and answer')}
      <select bind:value={form.who}>
        {#each Object.entries(WHO_LABEL) as [value, label] (value)}
          {#if value !== 'club' || form.club}<option {value}>{t(label)}</option>{/if}
        {/each}
      </select>
    </label>
    {#if isNew && social.friends.length}
      <fieldset class="friends">
        <legend>{t('Invite friends (they get a notification)')}</legend>
        {#each social.friends as f (f.username)}
          <label class="check"><input type="checkbox" value={f.username} bind:group={form.invite} disabled={!form.invite.includes(f.username) && form.invite.length >= 10} /> {f.nickname || f.username}</label>
        {/each}
      </fieldset>
    {/if}
    {#if error}<p class="bad">{error}</p>{/if}
    <div class="row">
      <button class="primary" disabled={busy || !form.title.trim() || !form.startsAt}>{isNew ? t('Plan it') : t('Save')}</button>
      <button type="button" class="ghost" onclick={() => (isNew ? browser.go(tab, 'biggle://events') : (editing = false))}>{t('Cancel')}</button>
    </div>
  </form>
{/snippet}

{#snippet people(list: Person[], label: string)}
  {#if list.length}
    <h3>{label}</h3>
    <div class="row people">
      {#each list as p (p.username)}
        <button class="person" onclick={() => browser.go(tab, `biggle://u/${p.username}`)} title={p.username}>
          <Avatar name={p.username} user={p.username} size={28} />
          <span>{p.username}</span>
        </button>
      {/each}
    </div>
  {/if}
{/snippet}

<Page>
  {#if view === 'new'}
    <button class="back" onclick={() => browser.go(tab, 'biggle://events')}><Icon name="back" size={16} /> {t('Events')}</button>
    <header class="top"><h1>{t('Plan an event')}</h1></header>
    {@render eventForm(create, true)}
  {:else if view === 'event'}
    <button class="back" onclick={() => browser.go(tab, 'biggle://events')}><Icon name="back" size={16} /> {t('Events')}</button>
    {#if detail}
      {@const ev = detail.event}
      {#if editing}
        <header class="top"><h1>{t('Change the event')}</h1></header>
        {@render eventForm(save, false)}
      {:else}
        <header class="top">
          <div class="grow">
            <h1>{ev.title}</h1>
            <p class="muted">
              {when(ev.startsAt)}{ev.endsAt ? ` – ${when(ev.endsAt)}` : ''}
              {#if ev.over}<span class="pill">{t('Over')}</span>{/if}
            </p>
          </div>
        </header>
        <div class="card stack">
          {#if ev.place}<p class="row"><Icon name="globe" size={16} /> <Linked text={ev.place} /></p>{/if}
          <p class="row muted small">
            {#if ev.maker}{t('Planned by {who}', { who: ev.maker })}{/if}
            {#if ev.club}{' · '}<button class="link" onclick={() => browser.go(tab, `biggle://clubs/${ev.club!.id}`)}>{ev.club.name}</button>{/if}
          </p>
          {#if ev.description}<p><Linked text={ev.description} /></p>{/if}
          {#if !ev.over}
            <div class="row answers" role="group" aria-label={t('Are you going?')}>
              {#each [['going', 'Going'], ['maybe', 'Maybe'], ['no', 'Can’t go']] as [value, label] (value)}
                <button class:primary={detail.you.answer === value} class:ghost={detail.you.answer !== value} aria-pressed={detail.you.answer === value} disabled={busy} onclick={() => answer(value as 'going' | 'maybe' | 'no')}>{t(label)}</button>
              {/each}
            </div>
            {#if detail.you.answer === 'going' || detail.you.answer === 'maybe'}<p class="muted small">{t('You’ll get a reminder 15 minutes before it starts.')}</p>{/if}
          {/if}
          {#if error}<p class="bad">{error}</p>{/if}
        </div>

        <section class="who">
          {@render people(detail.going, `${t('Going')} · ${detail.going.length}`)}
          {@render people(detail.maybe, `${t('Maybe')} · ${detail.maybe.length}`)}
          {@render people(detail.no, `${t('Can’t go')} · ${detail.no.length}`)}
          {@render people(detail.invited, `${t('Invited')} · ${detail.invited.length}`)}
        </section>

        {#if !ev.over && friendsNotIn.length && (ev.who !== 'invited' || detail.you.canEdit)}
          <form class="row invite" onsubmit={sendInvite}>
            <select class="grow" bind:value={inviting} aria-label={t('Friend to invite')}>
              <option value="">{t('Invite a friend…')}</option>
              {#each friendsNotIn as f (f.username)}<option value={f.username}>{f.nickname || f.username}</option>{/each}
            </select>
            <button class="primary" disabled={!inviting || busy}>{t('Invite')}</button>
          </form>
        {/if}

        <div class="row actions">
          <button class="ghost" onclick={() => addToCalendar(ev)}>{t('Add to calendar')}</button>
          {#if detail.you.canEdit && !ev.over}<button class="ghost" onclick={startEdit}>{t('Change')}</button>{/if}
          {#if detail.you.canDelete}
            {#if confirmDelete}
              <button class="danger" disabled={busy} onclick={callOff}>{t('Call it off')}</button>
              <button class="link small" onclick={() => (confirmDelete = false)}>{t('Keep it')}</button>
            {:else}
              <button class="ghost" onclick={() => (confirmDelete = true)}>{t('Call off…')}</button>
            {/if}
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
      <h1>{t('Events')}</h1>
      <button class="primary" onclick={() => browser.go(tab, 'biggle://events/new')}><Icon name="plus" size={15} /> {t('Plan an event')}</button>
    </header>
    {#if error}<p class="bad">{error}</p>{/if}
    {#snippet eventList(list: Card[])}
      <ul class="list">
        {#each list as e (e.id)}
          <li>
            <button class="item" onclick={() => browser.go(tab, `biggle://events/${e.id}`)}>
              <span class="date">
                <span class="day">{new Date(e.startsAt * 1000).getDate()}</span>
                <span class="month">{new Date(e.startsAt * 1000).toLocaleDateString(undefined, { month: 'short' })}</span>
              </span>
              <span class="text">
                <span class="name">{e.title}</span>
                <span class="sub">
                  {when(e.startsAt)}{e.club ? ` · ${e.club.name}` : e.maker ? ` · ${t('by {who}', { who: e.maker })}` : ''} · {plural(e.going, '{n} going', '{n} going')}
                </span>
              </span>
              {#if e.answer === 'going'}<span class="pill">{t('Going')}</span>{:else if e.answer === 'maybe'}<span class="pill">{t('Maybe')}</span>{:else if e.answer === null && e.maker}<span class="pill new">{t('Answer')}</span>{/if}
            </button>
          </li>
        {/each}
      </ul>
    {/snippet}
    {#if lists}
      <h2>{t('Coming up')}</h2>
      {#if lists.upcoming.length}
        {@render eventList(lists.upcoming)}
      {:else}
        <div class="card empty">
          <p>{t('Nothing planned.')}</p>
          <p class="small">{t('Plan a game night and invite your friends.')}</p>
        </div>
      {/if}
      {#if lists.recent.length}
        <h2>{t('Recently')}</h2>
        {@render eventList(lists.recent)}
      {/if}
    {:else if !error}
      <p class="muted">{t('Loading…')}</p>
    {/if}
  {/if}
</Page>

<style>
  .answers {
    margin-top: 4px;
  }
  .who {
    margin-top: 20px;
  }
  .who :global(h3) {
    margin-top: 16px;
  }
  .people {
    gap: 6px;
  }
  .person {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px 4px 4px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--card);
    color: var(--text);
    font: inherit;
    font-size: 13.5px;
    cursor: pointer;
  }
  .invite {
    margin-top: 16px;
  }
  .actions {
    margin-top: 24px;
  }
  .friends {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    margin: 0;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
  }
  .friends legend {
    padding: 0 4px;
    font-size: 13px;
    font-weight: 600;
  }
  .date {
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 46px;
    height: 46px;
    border-radius: 12px;
    background: var(--accent-soft);
    line-height: 1.05;
  }
  .day {
    font-size: 18px;
    font-weight: 700;
  }
  .month {
    font-size: 11px;
    text-transform: uppercase;
    color: var(--muted);
  }
  .pill.new {
    background: var(--accent);
    color: var(--on-accent);
  }
</style>
