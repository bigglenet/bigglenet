<script lang="ts">
  // biggle://u/<name>: someone's profile. Their picture, status, bio, sites and achievements, and
  // buttons to add them, message them or block them. Your own has an Edit button.
  import { account } from '../lib/account.svelte';
  import { errorText } from '../lib/api';
  import { BADGE_INFO } from '../lib/badges';
  import { browser, type Tab } from '../lib/browser.svelte';
  import { chats } from '../lib/chats.svelte';
  import { SERVER } from '../lib/config';
  import { i18n, plural, t } from '../lib/i18n.svelte';
  import { people, squareImage, type Profile } from '../lib/people.svelte';
  import { report } from '../lib/report.svelte';
  import { social } from '../lib/social.svelte';
  import { siteHome, siteHost } from '../lib/url';
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';

  let { tab, path }: { tab: Tab; path: string } = $props();

  const username = $derived((path || account.user?.username || '').toLowerCase());
  let profile = $state<Profile | null>(null);
  let error = $state('');
  let busy = $state(false);
  let confirmBlock = $state(false);
  let confirmUnfriend = $state(false);

  // Editing your own.
  let editing = $state(false);
  let bio = $state('');
  let emoji = $state('');
  let statusText = $state('');
  let clearAfter = $state<'never' | '30m' | '1h' | '4h' | 'today'>('never');
  let share = $state(false);
  let picker = $state<HTMLInputElement>();

  async function load() {
    error = '';
    try {
      profile = await people.profile(username);
      if (profile.me) tab.title = t('My profile');
      else tab.title = profile.username;
    } catch (e) {
      profile = null;
      error = errorText(e);
    }
  }

  $effect(() => {
    void username;
    editing = false;
    confirmBlock = false;
    confirmUnfriend = false;
    load();
  });

  // Live changes to friendship or status show up here too.
  $effect(() => {
    void social.friends;
    void social.incoming;
    void social.outgoing;
    if (profile && !profile.me) {
      const name = profile.username;
      profile.friendship = social.friends.some((f) => f.username === name)
        ? 'friends'
        : social.incoming.includes(name)
          ? 'incoming'
          : social.outgoing.includes(name)
            ? 'outgoing'
            : null;
    }
  });

  async function act(fn: () => Promise<unknown>) {
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

  function startEditing() {
    if (!profile) return;
    bio = profile.bio ?? '';
    emoji = profile.status?.emoji ?? '';
    statusText = profile.status?.text ?? '';
    clearAfter = 'never';
    share = !!profile.shareActivity;
    editing = true;
  }

  function untilFor(choice: typeof clearAfter): number | null {
    const now = Date.now();
    if (choice === '30m') return now + 30 * 60_000;
    if (choice === '1h') return now + 60 * 60_000;
    if (choice === '4h') return now + 4 * 60 * 60_000;
    if (choice === 'today') {
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      return end.getTime();
    }
    return null;
  }

  async function save(e: SubmitEvent) {
    e.preventDefault();
    await act(async () => {
      const keepUntil = clearAfter === 'never' && profile?.status && profile.status.text === statusText && profile.status.emoji === emoji;
      await people.update({
        bio,
        status: { emoji, text: statusText, until: keepUntil ? profile!.status!.until : untilFor(clearAfter) },
        shareActivity: share,
      });
      editing = false;
    });
  }

  async function pickPicture() {
    const file = picker?.files?.[0];
    if (picker) picker.value = '';
    if (!file) return;
    await act(async () => people.setAvatar(await squareImage(file)));
  }

  async function message() {
    if (!profile) return;
    const id = await chats.openWith(profile.username);
    social.showChat(id);
  }

  const joined = $derived(profile ? new Date(profile.joined * 1000).toLocaleDateString(i18n.locale, { month: 'long', year: 'numeric' }) : '');
  const status = $derived(profile?.status && (!profile.status.until || profile.status.until > Date.now()) ? profile.status : null);
  const untilText = $derived(
    status?.until ? t('until {time}', { time: new Date(status.until).toLocaleTimeString(i18n.locale, { hour: '2-digit', minute: '2-digit' }) }) : '',
  );
</script>

<div class="page">
  <div class="inner">
    {#if error && !profile}
      <div class="empty">
        <Icon name="users" size={28} />
        <p>{error}</p>
      </div>
    {:else if profile}
      <header class="head">
        <div class="picture">
          <Avatar name={profile.username} user={profile.username} size={112} />
          {#if profile.me}
            <button class="change" onclick={() => picker?.click()} disabled={busy} title={t('Change your picture')}>
              <Icon name="edit" size={15} />
              <span class="sr-only">{t('Change your picture')}</span>
            </button>
            <input bind:this={picker} type="file" accept="image/*" hidden onchange={pickPicture} />
          {/if}
        </div>
        <div class="who">
          <h1>{profile.username}</h1>
          {#if status}
            <p class="status"><span class="emoji">{status.emoji}</span> {status.text} {#if untilText}<span class="muted">· {untilText}</span>{/if}</p>
          {/if}
          {#if profile.activity}
            <p class="activity"><span class="live"></span> {t('On {place}', { place: profile.activity.text })}</p>
          {/if}
          <p class="muted small">
            {t('Joined {date}', { date: joined })} · {plural(profile.friends, '{n} friend', '{n} friends')}
          </p>
        </div>
      </header>

      {#if !editing && profile.bio}
        <p class="bio">{profile.bio}</p>
      {/if}

      {#if profile.me}
        {#if editing}
          <form class="edit" onsubmit={save}>
            <label>
              <span>{t('About you')}</span>
              <textarea bind:value={bio} rows="3" maxlength="300" placeholder={t('A line or two about you')}></textarea>
            </label>
            <div class="status-edit">
              <label class="emoji-field">
                <span>{t('Emoji')}</span>
                <input bind:value={emoji} maxlength="4" placeholder="😀" />
              </label>
              <label class="grow">
                <span>{t('Status')}</span>
                <input bind:value={statusText} maxlength="60" placeholder={t('What’s happening?')} />
              </label>
              <label>
                <span>{t('Clear after')}</span>
                <select bind:value={clearAfter}>
                  <option value="never">{t('Don’t clear')}</option>
                  <option value="30m">{t('30 minutes')}</option>
                  <option value="1h">{t('1 hour')}</option>
                  <option value="4h">{t('4 hours')}</option>
                  <option value="today">{t('Today')}</option>
                </select>
              </label>
            </div>
            <label class="check">
              <input type="checkbox" bind:checked={share} />
              <span>
                <strong>{t('Let friends see what I’m up to')}</strong><br />
                <span class="muted small">{t('Like “Playing GTA V”: the site you’re on in Bigglenet. Private tabs are never shared.')}</span>
              </span>
            </label>
            <div class="actions">
              {#if account.user?.avatar}
                <button type="button" class="ghost" disabled={busy} onclick={() => act(() => people.removeAvatar())}>{t('Remove picture')}</button>
              {/if}
              <span class="spacer"></span>
              <button type="button" class="ghost" onclick={() => (editing = false)}>{t('Cancel')}</button>
              <button class="primary" disabled={busy}>{t('Save')}</button>
            </div>
          </form>
        {:else}
          <div class="actions">
            <button class="primary" onclick={startEditing}><Icon name="edit" size={15} /> {t('Edit profile')}</button>
          </div>
        {/if}
      {:else}
        <div class="actions">
          {#if profile.blocked}
            <span class="muted">{t('You’ve blocked {name}.', { name: profile.username })}</span>
            <button class="ghost" disabled={busy} onclick={() => act(() => people.unblock(profile!.username))}>{t('Unblock')}</button>
          {:else}
            {#if profile.friendship === 'friends'}
              <button class="primary" onclick={message}><Icon name="chat" size={15} /> {t('Message')}</button>
              {#if confirmUnfriend}
                <span class="confirm">
                  {t('Remove {name} from your friends?', { name: profile.username })}
                  <button class="danger" disabled={busy} onclick={() => act(() => social.remove(profile!.username))}>{t('Remove')}</button>
                  <button class="ghost" onclick={() => (confirmUnfriend = false)}>{t('Keep')}</button>
                </span>
              {:else}
                <button class="ghost" onclick={() => (confirmUnfriend = true)}>{t('Friends')} ✓</button>
              {/if}
            {:else if profile.friendship === 'incoming'}
              <button class="primary" disabled={busy} onclick={() => act(() => social.accept(profile!.username))}>{t('Accept friend request')}</button>
              <button class="ghost" disabled={busy} onclick={() => act(() => social.remove(profile!.username))}>{t('Decline')}</button>
            {:else if profile.friendship === 'outgoing'}
              <button class="ghost" disabled={busy} onclick={() => act(() => social.remove(profile!.username))}>{t('Request sent · Cancel')}</button>
            {:else}
              <button class="primary" disabled={busy} onclick={() => act(() => social.addFriend(profile!.username))}><Icon name="userPlus" size={15} /> {t('Add friend')}</button>
            {/if}
            <span class="spacer"></span>
            {#if confirmBlock}
              <span class="confirm">
                {t('Block {name}? They can’t add you, message you or sign your guestbooks.', { name: profile.username })}
                <button class="danger" disabled={busy} onclick={() => act(() => people.block(profile!.username))}>{t('Block')}</button>
                <button class="ghost" onclick={() => (confirmBlock = false)}>{t('Cancel')}</button>
              </span>
            {:else}
              <button class="ghost quiet" onclick={() => (confirmBlock = true)}>{t('Block')}</button>
              <button class="ghost quiet" onclick={() => report.open('user', profile!.username, profile!.username)}>{t('Report')}</button>
            {/if}
          {/if}
        </div>
      {/if}
      {#if error}<p class="error" role="alert">{error}</p>{/if}

      {#if profile.sites.length}
        <section>
          <h2>{t('Sites')}</h2>
          <ul class="sites">
            {#each profile.sites as site (site.name)}
              <li>
                <button onclick={() => browser.go(tab, siteHome(site.name, site.tld))}>
                  <span class="tile">{site.name[0].toUpperCase()}</span>
                  <span class="text">
                    <strong>{siteHost(site.name, site.tld)}</strong>
                    {#if site.title}<span class="muted small">{site.title}</span>{/if}
                  </span>
                </button>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if profile.badges?.length}
        <section>
          <h2>{t('Badges')}</h2>
          <ul class="badges">
            {#each profile.badges as b (b.badge)}
              {@const info = BADGE_INFO[b.badge]}
              {#if info}
                <li title={`${t(info.about)} · ${new Date(b.at * 1000).toLocaleDateString(i18n.locale)}`}>
                  <span class="badge-emoji" aria-hidden="true">{info.emoji}</span>
                  <strong>{t(info.name)}</strong>
                  <span class="muted small">{t(info.about)}</span>
                </li>
              {/if}
            {/each}
          </ul>
        </section>
      {/if}

      {#if profile.stamps?.length}
        <section>
          <h2>{t('Stamps')} <span class="muted small">{profile.stamps.length}</span></h2>
          <ul class="stamps">
            {#each profile.stamps as s (s.site)}
              <li>
                <button onclick={() => browser.go(tab, siteHome(s.site))} title={s.title ? `${siteHost(s.site)} · ${s.title}` : siteHost(s.site)}>
                  <img src={`${SERVER}/site/${encodeURIComponent(s.site)}/.button`} width="88" height="31" alt={siteHost(s.site)} loading="lazy" />
                </button>
              </li>
            {/each}
          </ul>
        </section>
      {:else if profile.me}
        <section>
          <h2>{t('Stamps')}</h2>
          <p class="muted">{t('Collect a site’s stamp from its ⋯ menu. Your stamps show here, as the sites’ buttons.')}</p>
        </section>
      {/if}

      {#if profile.clubs?.length}
        <section>
          <h2>{t('Clubs')}</h2>
          <ul class="sites">
            {#each profile.clubs as club (club.id)}
              <li>
                <button onclick={() => browser.go(tab, `biggle://clubs/${club.id}`)}>
                  <span class="tile">{club.emoji || club.name[0]?.toUpperCase()}</span>
                  <span class="text"><strong>{club.name}</strong></span>
                </button>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if profile.collections?.length}
        <section>
          <h2>{t('Collections')}</h2>
          <ul class="sites">
            {#each profile.collections as c (c.id)}
              <li>
                <button onclick={() => browser.go(tab, `biggle://collections/${c.id}`)}>
                  <span class="tile"><Icon name="star" size={16} /></span>
                  <span class="text">
                    <strong>{c.title}</strong>
                    <span class="muted small">{plural(c.sites, '{n} site', '{n} sites')}</span>
                  </span>
                </button>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if profile.achievements.length}
        <section>
          <h2>{t('Achievements')}</h2>
          <ul class="achievements">
            {#each profile.achievements as a (a.site + a.key)}
              <li title={a.description ?? ''}>
                <span class="trophy"><Icon name="star" size={16} filled /></span>
                <span class="text">
                  <strong>{a.title}</strong>
                  <span class="muted small">{siteHost(a.site)}</span>
                </span>
              </li>
            {/each}
          </ul>
        </section>
      {/if}
    {:else}
      <p class="muted">{t('Loading…')}</p>
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
    max-width: 720px;
    margin: 0 auto;
    padding: 40px 20px 64px;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 22px;
    margin-bottom: 18px;
  }
  .picture {
    position: relative;
    flex: none;
  }
  .change {
    position: absolute;
    right: 0;
    bottom: 0;
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border: 2px solid var(--surface);
    border-radius: 50%;
    background: var(--card);
    color: var(--text);
  }
  .who {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  h1 {
    margin: 0;
    font-size: 30px;
    letter-spacing: -0.02em;
    overflow-wrap: anywhere;
  }
  h2 {
    margin: 0 0 10px;
    font-size: 13px;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  p {
    margin: 0;
  }
  .status {
    font-size: 15px;
  }
  .emoji {
    font-size: 17px;
  }
  .activity {
    display: flex;
    align-items: center;
    gap: 7px;
    color: var(--online);
    font-size: 14px;
    font-weight: 600;
  }
  .live {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--online);
  }
  .bio {
    margin-bottom: 18px;
    font-size: 15.5px;
    line-height: 1.5;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .muted {
    color: var(--muted);
  }
  .small {
    font-size: 13px;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-bottom: 26px;
  }
  .spacer {
    flex: 1;
  }
  .confirm {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    font-size: 14px;
  }
  button {
    font: inherit;
  }
  .primary,
  .ghost,
  .danger {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 36px;
    padding: 0 14px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
  }
  .primary {
    border: 0;
    background: var(--accent);
    color: var(--on-accent);
  }
  .ghost {
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--text);
  }
  .ghost.quiet {
    color: var(--muted);
  }
  .danger {
    border: 0;
    background: var(--danger);
    color: #fff;
  }
  .error {
    margin: -14px 0 20px;
    color: var(--danger);
    font-size: 14px;
  }
  .edit {
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin-bottom: 26px;
    padding: 18px;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--card);
  }
  .edit label {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 13px;
    color: var(--muted);
  }
  .edit textarea,
  .edit input:not([type='checkbox']),
  .edit select {
    padding: 8px 11px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 14.5px;
  }
  .edit textarea {
    resize: vertical;
  }
  .status-edit {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .emoji-field input {
    width: 64px;
    text-align: center;
  }
  .grow {
    flex: 1;
    min-width: 160px;
  }
  .edit .check {
    flex-direction: row;
    align-items: flex-start;
    gap: 10px;
    color: var(--text);
    font-size: 14px;
    cursor: pointer;
  }
  .edit .check input {
    margin-top: 3px;
  }
  .edit .actions {
    margin: 0;
  }
  section {
    margin-bottom: 26px;
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .sites {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 10px;
  }
  .sites button {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--card);
    color: var(--text);
    text-align: left;
  }
  .sites button:hover {
    border-color: var(--accent);
  }
  .tile {
    flex: none;
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: 11px;
    background: var(--accent);
    color: var(--on-accent);
    font-weight: 700;
    font-size: 18px;
  }
  .text {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .text > * {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .badges {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .badges li {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 12px;
    border-radius: 14px;
    background: var(--surface);
    text-align: center;
  }
  .badge-emoji {
    font-size: 28px;
    line-height: 1.2;
  }
  .stamps {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .stamps button {
    display: block;
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
  }
  .stamps img {
    display: block;
    image-rendering: pixelated;
  }
  .stamps button:hover img {
    outline: 2px solid var(--accent);
  }
  .achievements {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 8px;
  }
  .achievements li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--card);
  }
  .trophy {
    flex: none;
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: color-mix(in srgb, #e8a400 20%, transparent);
    color: #e8a400;
  }
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 48px 20px;
    color: var(--muted);
    text-align: center;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
  @media (max-width: 560px) {
    .head {
      flex-direction: column;
      text-align: center;
    }
    .who {
      align-items: center;
    }
  }
</style>
