<script lang="ts">
  // biggle://settings: what new tabs open (and a way back to the normal new tab page), the
  // bookmarks bar, notifications, updates, which version this is, and what's new in each version.
  // biggle://settings/updates, /notifications and /whats-new open at those parts.
  import { tick } from 'svelte';
  import Trans from './Trans.svelte';
  import { browser, type Tab } from '../lib/browser.svelte';
  import { bookmarks } from '../lib/bookmarks.svelte';
  import { CHANGELOG } from '../lib/changelog';
  import { i18n, t, type LangChoice } from '../lib/i18n.svelte';
  import { notices } from '../lib/notify.svelte';
  import { push } from '../lib/push.svelte';
  import { people } from '../lib/people.svelte';
  import { couch } from '../lib/couch.svelte';
  import { theme, THEMES, type Appearance } from '../lib/theme.svelte';
  import AccountSettings from './AccountSettings.svelte';
  import SiteSettingsList from './SiteSettingsList.svelte';
  import { desktop, isMac } from '../lib/platform';
  import { startSettings as settings } from '../lib/startpage.svelte';
  import { updates } from '../lib/updates.svelte';
  import Icon from './Icon.svelte';

  let { tab, path = '' }: { tab: Tab; path?: string } = $props();

  // Open at the part the address names (biggle://settings/sites/<site> opens at that site).
  let page = $state<HTMLElement>();
  const section = $derived(path.split('/')[0]);
  $effect(() => {
    const id = section;
    if (id) tick().then(() => page?.querySelector(`#${CSS.escape(id)}`)?.scrollIntoView({ block: 'start' }));
  });

  // The desktop app's engine, for About.
  let engine = $state<{ electron: string; chromium: string } | null>(null);
  $effect(() => {
    desktop?.info().then((i) => (engine = i));
  });

  const UPDATE_TEXT: Record<string, string> = {
    idle: '',
    checking: 'Checking…',
    current: 'You’re up to date.',
    failed: 'Couldn’t check for updates.',
  };
  let showAll = $state(false);
  const releases = $derived(showAll ? CHANGELOG : CHANGELOG.slice(0, 4));
  const date = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(i18n.locale, { dateStyle: 'medium' });

  // Notifications while Bigglenet is closed: web push on the web, running in the background on desktop.
  let pushBusy = $state(false);
  let pushError = $state('');
  let background = $state(false);
  $effect(() => {
    push.refresh();
    desktop?.background.get().then((on) => (background = on));
  });
  async function setPush(on: boolean) {
    pushBusy = true;
    pushError = '';
    try {
      await (on ? push.enable() : push.disable());
    } catch (e) {
      pushError = (e as Error).message;
    } finally {
      pushBusy = false;
    }
  }
  async function setBackground(on: boolean) {
    background = (await desktop?.background.set(on)) ?? false;
  }

  let ownPage = $state(settings.newTab !== null);
  let pageText = $state(settings.newTab ?? '');
  let error = $state('');
  let saved = $state('');

  function useOwn(e: SubmitEvent) {
    e.preventDefault();
    saved = '';
    error = settings.useNewTab(pageText) ?? '';
    if (error) return;
    pageText = settings.newTab ?? '';
    ownPage = settings.newTab !== null;
    saved = settings.newTab ? t('New tabs open {newTab}.', { newTab: settings.newTab }) : t('New tabs open the new tab page.');
  }

  function useDefault() {
    settings.useDefaultNewTab();
    ownPage = false;
    pageText = '';
    error = '';
    saved = t('New tabs open the new tab page again.');
  }

  function customize() {
    settings.openCustomize = true;
    browser.go(tab, 'biggle://newtab');
  }
</script>

<div class="settings" bind:this={page}>
  <div class="inner">
    <h1>{t('Settings')}</h1>

    <section id="new-tabs">
      <h2>{t('New tabs')}</h2>
      {#if settings.newTab}
        <div class="current">
          <span><Trans text={t('New tabs open {page}')}>{#snippet page()}<strong>{settings.newTab}</strong>{/snippet}</Trans></span>
          <button class="primary" onclick={useDefault}>{t('Use the default new tab page')}</button>
        </div>
      {/if}

      <label class="choice">
        <input type="radio" name="newtab" checked={!ownPage} onchange={useDefault} />
        <span><strong>{t('The new tab page')}</strong> <em>{t('(default)')}</em><br /><span class="muted">{t('Search, shortcuts and more. You can change how it looks.')}</span></span>
      </label>
      <label class="choice">
        <input type="radio" name="newtab" checked={ownPage} onchange={() => ((ownPage = true), (saved = ''))} />
        <span><strong>{t('A page of my choice')}</strong><br /><span class="muted">{t('Any .biggle or .b site, or a built-in page like biggle://nox.')}</span></span>
      </label>
      {#if ownPage}
        <form class="row" onsubmit={useOwn}>
          <input bind:value={pageText} placeholder={t('home.biggle')} aria-label={t('Page new tabs open')} autocapitalize="off" spellcheck="false" />
          <button class="primary" disabled={!pageText.trim()}>{t('Use it')}</button>
        </form>
      {/if}
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      {#if saved}<p class="saved" role="status">{saved}</p>{/if}

      <div class="more">
        <button class="ghost" onclick={customize}><Icon name="settings" size={15} /> {t('Customize the new tab page')}</button>
        <p class="muted small"><Trans text={t('The new tab page is always at {address}, whatever new tabs open.')}>{#snippet address()}<code>biggle://newtab</code>{/snippet}</Trans></p>
      </div>
    </section>

    <section id="bookmarks">
      <h2>{t('Bookmarks and history')}</h2>
      <label class="choice">
        <input type="checkbox" checked={bookmarks.bar} onchange={(e) => bookmarks.showBar(e.currentTarget.checked)} />
        <span>
          <strong>{t('Show the bookmarks bar')}</strong><br />
          <span class="muted">{t('Under the address bar, once you’ve bookmarked something ({isMac}). {isMac2} shows and hides it.', { isMac: isMac ? '⌘D' : 'Ctrl+D', isMac2: isMac ? '⇧⌘B' : 'Ctrl+Shift+B' })}</span>
        </span>
      </label>
      <div class="links">
        <button class="ghost" onclick={() => browser.go(tab, 'biggle://bookmarks')}><Icon name="star" size={15} /> {t('All bookmarks')}</button>
        <button class="ghost" onclick={() => browser.go(tab, 'biggle://history')}><Icon name="clock" size={15} /> {t('History')}</button>
      </div>
      <p class="muted small">{t('Bookmarks and history stay on this device.')}</p>
    </section>

    <section id="appearance">
      <h2>{t('Appearance')}</h2>
      <div class="segmented" role="radiogroup" aria-label={t('Light or dark')}>
        {#each [['system', 'Same as this device'], ['light', 'Light'], ['dark', 'Dark']] as [value, label] (value)}
          <button role="radio" aria-checked={theme.appearance === value} class:on={theme.appearance === value} onclick={() => theme.set({ appearance: value as Appearance })}>{t(label)}</button>
        {/each}
      </div>
      <div class="themes" role="radiogroup" aria-label={t('Colour')}>
        {#each THEMES as th (th.id)}
          <button role="radio" aria-checked={theme.theme === th.id} class:on={theme.theme === th.id} onclick={() => theme.set({ theme: th.id })} title={t(th.name)}>
            <span class="dot" style:background={th.light ?? 'var(--text)'}></span>
            {t(th.name)}
          </button>
        {/each}
      </div>
    </section>

    <section id="tabs">
      <h2>{t('Tabs')}</h2>
      <label class="choice">
        <input type="radio" name="startup" checked={browser.startup === 'newtab'} onchange={() => browser.setStartup('newtab')} />
        <span><strong>{t('Start with a new tab')}</strong><br /><span class="muted">{t('Pinned tabs always come back.')}</span></span>
      </label>
      <label class="choice">
        <input type="radio" name="startup" checked={browser.startup === 'restore'} onchange={() => browser.setStartup('restore')} />
        <span><strong>{t('Continue where you left off')}</strong><br /><span class="muted">{t('Your tabs from last time open again. Private tabs never do.')}</span></span>
      </label>
      <label class="row-label">
        <span>{t('Put tabs to sleep after')}</span>
        <select class="select" value={String(browser.sleepAfter)} onchange={(e) => browser.setSleepAfter(Number(e.currentTarget.value))}>
          <option value="10">{t('10 minutes')}</option>
          <option value="30">{t('30 minutes')}</option>
          <option value="60">{t('1 hour')}</option>
          <option value="0">{t('Never')}</option>
        </select>
      </label>
      <p class="muted small">{t('Sleeping tabs use no memory, which helps big games run. They wake up when you open them.')}</p>
      <label class="choice">
        <input type="checkbox" checked={couch.enabled} onchange={(e) => couch.setEnabled(e.currentTarget.checked)} />
        <span>
          <strong>{t('Get around with a game controller')}</strong><br />
          <span class="muted">{t('The D-pad moves, A presses, B goes back, LB and RB switch tabs. On a game, press Home to use it for Bigglenet.')}</span>
        </span>
      </label>
    </section>

    <section id="sites">
      <h2>{t('Sites')}</h2>
      <SiteSettingsList focus={path.split('/')[1] ?? ''} />
    </section>

    <section id="language">
      <h2>{t('Language')}</h2>
      <select class="select" value={i18n.choice} onchange={(e) => i18n.set(e.currentTarget.value as LangChoice)} aria-label={t('Language')}>
        <option value="system">{t('Same as this device')}</option>
        <option value="en">{t('English')}</option>
        <option value="tr">{t('Türkçe')}</option>
      </select>
    </section>

    <AccountSettings />

    <section id="privacy">
      <h2>{t('Privacy')}</h2>
      <label class="choice">
        <input type="checkbox" checked={people.shareActivity} onchange={(e) => people.update({ shareActivity: e.currentTarget.checked }).catch(() => {})} />
        <span>
          <strong>{t('Let friends see what I’m up to')}</strong><br />
          <span class="muted">{t('Like “Playing GTA V”: the site you’re on in Bigglenet. Private tabs are never shared.')}</span>
        </span>
      </label>
      <h3>{t('Blocked people')}</h3>
      {#if people.blocked.length}
        <ul class="blocked">
          {#each people.blocked as name (name)}
            <li>
              <span>{name}</span>
              <button class="ghost" onclick={() => people.unblock(name).catch(() => {})}>{t('Unblock')}</button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="muted small">{t('Nobody. Block someone from their profile.')}</p>
      {/if}
    </section>

    <section id="notifications">
      <h2>{t('Notifications')}</h2>
      <label class="choice">
        <input type="checkbox" checked={notices.enabled} onchange={(e) => notices.setEnabled(e.currentTarget.checked)} />
        <span>
          <strong>{t('Tell me when someone messages or calls me')}</strong><br />
          <span class="muted">{t('While Bigglenet is open but you’re using something else.')}</span>
        </span>
      </label>
      {#if notices.enabled}
        {#if notices.permission === 'default'}
          <div class="current">
            <span>{t('Your browser needs to allow Bigglenet’s notifications first.')}</span>
            <button class="primary" onclick={() => notices.allow()}>{t('Allow notifications')}</button>
          </div>
        {:else if notices.permission === 'denied'}
          <p class="error">{t('Your browser is blocking Bigglenet’s notifications. Allow them in its site settings, then come back.')}</p>
        {:else if notices.permission === 'unsupported'}
          <p class="muted small">{t('This browser can’t show notifications.')}</p>
        {:else}
          <button class="ghost" onclick={() => notices.test()}><Icon name="bell" size={15} /> {t('Send a test notification')}</button>
        {/if}
      {/if}
      {#if push.supported}
        <label class="choice">
          <input type="checkbox" checked={push.on} disabled={pushBusy} onchange={(e) => setPush(e.currentTarget.checked)} />
          <span>
            <strong>{t('Notify me even when Bigglenet is closed')}</strong><br />
            <span class="muted">{t('Messages, calls and reminders on this device, like other apps.')}</span>
          </span>
        </label>
        {#if pushError}<p class="error">{pushError}</p>{/if}
      {:else if desktop}
        <label class="choice">
          <input type="checkbox" checked={background} onchange={(e) => setBackground(e.currentTarget.checked)} />
          <span>
            <strong>{t('Keep running in the background')}</strong><br />
            <span class="muted">{isMac ? t('After you close the window, Bigglenet stays in the menu bar and still tells you about messages, calls and reminders.') : t('After you close the window, Bigglenet stays in the system tray and still tells you about messages, calls and reminders.')}</span>
          </span>
        </label>
      {/if}
      <p class="muted small" style:margin-top="12px">{!desktop ? t('New messages are also counted on Bigglenet’s icon.') : isMac ? t('New messages are also counted on Bigglenet’s icon in the Dock.') : t('New messages are also counted on Bigglenet’s icon in the taskbar.')}</p>
    </section>

    <section id="updates">
      <h2>{t('Updates')}</h2>
      <div class="update-row">
        <div>
          <strong>{t('Bigglenet {current}', { current: updates.current })}</strong>
          <p class="muted small">
            {#if updates.status === 'ready'}
              {updates.version ? `Bigglenet ${updates.version} is ready.` : 'A new version is ready.'}
              {desktop ? t('Restart to start using it.') : t('Reload to start using it.')}
            {:else if updates.status === 'downloading'}
              Downloading Bigglenet {updates.version}…
            {:else if updates.status === 'failed'}
              {UPDATE_TEXT.failed} {updates.error}
            {:else if UPDATE_TEXT[updates.status]}
              {t(UPDATE_TEXT[updates.status])}
            {:else}
              {desktop ? t('Updates download by themselves; you’re asked before restarting.') : t('The web app updates itself.')}
            {/if}
          </p>
        </div>
        {#if updates.status === 'ready'}
          <button class="primary" disabled={updates.installing} onclick={() => updates.apply()}>
            {updates.installing ? t('Updating…') : desktop ? 'Restart' : 'Reload'}
          </button>
        {:else}
          <button class="ghost" disabled={updates.status === 'checking' || updates.status === 'downloading'} onclick={() => updates.check(true)}>
            {t('Check for updates')}
          </button>
        {/if}
      </div>
    </section>

    <section id="about">
      <h2>{t('About')}</h2>
      <dl class="about">
        <dt>{t('Version')}</dt>
        <dd>{updates.current}</dd>
        <dt>{t('App')}</dt>
        <dd>{desktop ? t('Desktop app') : t('Web app')}</dd>
        {#if engine}
          <dt>{t('Engine')}</dt>
          <dd>{t('Chromium {chromium} (Electron {electron})', { chromium: engine.chromium, electron: engine.electron })}</dd>
        {/if}
      </dl>
      <div class="links">
        <button class="ghost" onclick={() => browser.go(tab, 'biggle://requests')}><Icon name="idea" size={15} /> {t('Request a feature')}</button>
        <a class="ghost" href="https://github.com/bigglenet/bigglenet/releases" target="_blank" rel="noreferrer"><Icon name="external" size={14} /> {t('All releases')}</a>
      </div>
      <p class="muted small">{t('Made by the Bigglenet. Open source, MIT licence.')}</p>
    </section>

    <section id="whats-new">
      <h2>{t('What’s new')}</h2>
      <ol class="changelog">
        {#each releases as r (r.version)}
          <li>
            <div class="release-head">
              <strong>{r.version}</strong>
              {#if r.version === updates.current}<span class="pill">{t('This version')}</span>{/if}
              <span class="muted small">{date(r.date)}</span>
            </div>
            <ul>
              {#each r.changes as change, i (i)}<li>{t(change)}</li>{/each}
            </ul>
          </li>
        {/each}
      </ol>
      {#if !showAll && CHANGELOG.length > releases.length}
        <button class="ghost" onclick={() => (showAll = true)}>{t('Show older versions')}</button>
      {/if}
    </section>
  </div>
</div>

<style>
  .settings {
    height: 100%;
    overflow: auto;
    background: var(--surface);
  }
  .inner {
    max-width: 640px;
    margin: 0 auto;
    padding: 40px 20px 64px;
  }
  h1 {
    margin: 0 0 24px;
    font-size: 28px;
    letter-spacing: -0.02em;
  }
  h2 {
    margin: 0 0 12px;
    font-size: 17px;
  }
  section {
    margin-bottom: 18px;
    scroll-margin-top: 16px;
    padding: 20px;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--card);
  }
  p {
    margin: 0;
  }
  .muted {
    color: var(--muted);
  }
  .small {
    font-size: 13px;
  }
  em {
    color: var(--muted);
    font-style: normal;
  }
  button {
    font: inherit;
    cursor: pointer;
  }
  .primary,
  .ghost {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 36px;
    padding: 0 14px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
  }
  .primary {
    border: 0;
    background: var(--accent);
    color: var(--on-accent);
  }
  .primary:disabled {
    opacity: 0.5;
  }
  .ghost {
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
  }
  .current {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 14px;
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--accent-soft);
    font-size: 14px;
    overflow-wrap: anywhere;
  }
  .choice {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 0;
    font-size: 14.5px;
    line-height: 1.4;
    cursor: pointer;
  }
  .choice input {
    margin-top: 3px;
  }
  .choice .muted {
    font-size: 13px;
  }
  .row {
    display: flex;
    gap: 8px;
    margin: 4px 0 0 26px;
  }
  .row input {
    flex: 1;
    min-width: 0;
    height: 36px;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 14px;
  }
  .row input:focus {
    outline: 0;
    border-color: var(--accent);
  }
  .error {
    margin-top: 10px;
    color: var(--danger);
    font-size: 13.5px;
  }
  .saved {
    margin-top: 10px;
    color: var(--online);
    font-size: 13.5px;
  }
  .more {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    margin-top: 18px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
  }
  code {
    padding: 1px 6px;
    border-radius: 6px;
    background: var(--hover);
    font-size: 12.5px;
  }
  .update-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
  }
  .update-row p {
    margin-top: 2px;
  }
  .about {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 6px 18px;
    margin: 0 0 14px;
    font-size: 14px;
  }
  .about dt {
    color: var(--muted);
  }
  .about dd {
    margin: 0;
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
  }
  a.ghost {
    text-decoration: none;
  }
  .changelog {
    margin: 0 0 12px;
    padding: 0;
    list-style: none;
  }
  .changelog > li {
    padding: 12px 0;
    border-top: 1px solid var(--border);
  }
  .changelog > li:first-child {
    padding-top: 0;
    border-top: 0;
  }
  .release-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }
  .changelog ul {
    margin: 0;
    padding-left: 20px;
    font-size: 14px;
    line-height: 1.5;
  }
  .segmented {
    display: inline-flex;
    gap: 2px;
    padding: 3px;
    border-radius: 11px;
    background: var(--hover);
  }
  .segmented button {
    height: 30px;
    padding: 0 12px;
    border: 0;
    border-radius: 8px;
    background: none;
    color: var(--text);
    font-size: 13.5px;
  }
  .segmented button.on {
    background: var(--card);
    font-weight: 600;
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.12);
  }
  .themes {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 12px;
  }
  .themes button {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: 32px;
    padding: 0 11px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
    color: var(--text);
    font-size: 13px;
  }
  .themes button.on {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-soft);
  }
  .themes .dot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
  }
  .row-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin: 8px 0 4px;
    font-size: 14.5px;
  }
  .select {
    height: 36px;
    padding: 0 10px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 14px;
  }
  h3 {
    margin: 14px 0 8px;
    font-size: 14px;
  }
  .blocked {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .blocked li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 0;
    border-top: 1px solid var(--border);
    font-size: 14px;
  }
  .blocked li:first-child {
    border-top: 0;
  }
  .pill {
    padding: 1px 8px;
    border-radius: 999px;
    background: var(--accent-soft);
    font-size: 11.5px;
    font-weight: 700;
  }
</style>
