<script lang="ts">
  // biggle://settings: what new tabs open (and a way back to the normal new tab page), the
  // bookmarks bar, notifications, updates, which version this is, and what's new in each version.
  // biggle://settings/updates, /notifications and /whats-new open at those parts.
  import { tick } from 'svelte';
  import { browser, type Tab } from '../lib/browser.svelte';
  import { bookmarks } from '../lib/bookmarks.svelte';
  import { CHANGELOG } from '../lib/changelog';
  import { i18n, t, type LangChoice } from '../lib/i18n.svelte';
  import { notices } from '../lib/notify.svelte';
  import { people } from '../lib/people.svelte';
  import { desktop, isMac } from '../lib/platform';
  import { startSettings as settings } from '../lib/startpage.svelte';
  import { updates } from '../lib/updates.svelte';
  import Icon from './Icon.svelte';

  let { tab, path = '' }: { tab: Tab; path?: string } = $props();

  // Open at the part the address names.
  let page = $state<HTMLElement>();
  $effect(() => {
    const id = path;
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
  const date = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString([], { dateStyle: 'medium' });

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
    saved = settings.newTab ? `New tabs open ${settings.newTab}.` : 'New tabs open the new tab page.';
  }

  function useDefault() {
    settings.useDefaultNewTab();
    ownPage = false;
    pageText = '';
    error = '';
    saved = 'New tabs open the new tab page again.';
  }

  function customize() {
    settings.openCustomize = true;
    browser.go(tab, 'biggle://newtab');
  }
</script>

<div class="settings" bind:this={page}>
  <div class="inner">
    <h1>Settings</h1>

    <section id="new-tabs">
      <h2>New tabs</h2>
      {#if settings.newTab}
        <div class="current">
          <span>New tabs open <strong>{settings.newTab}</strong></span>
          <button class="primary" onclick={useDefault}>Use the default new tab page</button>
        </div>
      {/if}

      <label class="choice">
        <input type="radio" name="newtab" checked={!ownPage} onchange={useDefault} />
        <span><strong>The new tab page</strong> <em>(default)</em><br /><span class="muted">Search, shortcuts and more. You can change how it looks.</span></span>
      </label>
      <label class="choice">
        <input type="radio" name="newtab" checked={ownPage} onchange={() => ((ownPage = true), (saved = ''))} />
        <span><strong>A page of my choice</strong><br /><span class="muted">Any .biggle or .b site, or a built-in page like biggle://nox.</span></span>
      </label>
      {#if ownPage}
        <form class="row" onsubmit={useOwn}>
          <input bind:value={pageText} placeholder="home.biggle" aria-label="Page new tabs open" autocapitalize="off" spellcheck="false" />
          <button class="primary" disabled={!pageText.trim()}>Use it</button>
        </form>
      {/if}
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      {#if saved}<p class="saved" role="status">{saved}</p>{/if}

      <div class="more">
        <button class="ghost" onclick={customize}><Icon name="settings" size={15} /> Customize the new tab page</button>
        <p class="muted small">The new tab page is always at <code>biggle://newtab</code>, whatever new tabs open.</p>
      </div>
    </section>

    <section id="bookmarks">
      <h2>Bookmarks and history</h2>
      <label class="choice">
        <input type="checkbox" checked={bookmarks.bar} onchange={(e) => bookmarks.showBar(e.currentTarget.checked)} />
        <span>
          <strong>Show the bookmarks bar</strong><br />
          <span class="muted">Under the address bar, once you’ve bookmarked something ({isMac ? '⌘D' : 'Ctrl+D'}). {isMac ? '⇧⌘B' : 'Ctrl+Shift+B'} shows and hides it.</span>
        </span>
      </label>
      <div class="links">
        <button class="ghost" onclick={() => browser.go(tab, 'biggle://bookmarks')}><Icon name="star" size={15} /> All bookmarks</button>
        <button class="ghost" onclick={() => browser.go(tab, 'biggle://history')}><Icon name="clock" size={15} /> History</button>
      </div>
      <p class="muted small">Bookmarks and history stay on this device.</p>
    </section>

    <section id="language">
      <h2>{t('Language')}</h2>
      <select class="select" value={i18n.choice} onchange={(e) => i18n.set(e.currentTarget.value as LangChoice)} aria-label={t('Language')}>
        <option value="system">{t('Same as this device')}</option>
        <option value="en">English</option>
        <option value="tr">Türkçe</option>
      </select>
    </section>

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
      <h2>Notifications</h2>
      <label class="choice">
        <input type="checkbox" checked={notices.enabled} onchange={(e) => notices.setEnabled(e.currentTarget.checked)} />
        <span>
          <strong>Tell me when someone messages or calls me</strong><br />
          <span class="muted">While Bigglenet is open but you’re using something else.</span>
        </span>
      </label>
      {#if notices.enabled}
        {#if notices.permission === 'default'}
          <div class="current">
            <span>Your browser needs to allow Bigglenet’s notifications first.</span>
            <button class="primary" onclick={() => notices.allow()}>Allow notifications</button>
          </div>
        {:else if notices.permission === 'denied'}
          <p class="error">Your browser is blocking Bigglenet’s notifications. Allow them in its site settings, then come back.</p>
        {:else if notices.permission === 'unsupported'}
          <p class="muted small">This browser can’t show notifications.</p>
        {:else}
          <button class="ghost" onclick={() => notices.test()}><Icon name="bell" size={15} /> Send a test notification</button>
        {/if}
      {/if}
      <p class="muted small" style:margin-top="12px">New messages are also counted on Bigglenet’s icon{desktop ? (isMac ? ' in the Dock' : ' in the taskbar') : ''}.</p>
    </section>

    <section id="updates">
      <h2>Updates</h2>
      <div class="update-row">
        <div>
          <strong>Bigglenet {updates.current}</strong>
          <p class="muted small">
            {#if updates.status === 'ready'}
              {updates.version ? `Bigglenet ${updates.version} is ready.` : 'A new version is ready.'}
              {desktop ? 'Restart to start using it.' : 'Reload to start using it.'}
            {:else if updates.status === 'downloading'}
              Downloading Bigglenet {updates.version}…
            {:else if updates.status === 'failed'}
              {UPDATE_TEXT.failed} {updates.error}
            {:else if UPDATE_TEXT[updates.status]}
              {UPDATE_TEXT[updates.status]}
            {:else}
              {desktop ? 'Updates download by themselves; you’re asked before restarting.' : 'The web app updates itself.'}
            {/if}
          </p>
        </div>
        {#if updates.status === 'ready'}
          <button class="primary" disabled={updates.installing} onclick={() => updates.apply()}>
            {updates.installing ? 'Updating…' : desktop ? 'Restart' : 'Reload'}
          </button>
        {:else}
          <button class="ghost" disabled={updates.status === 'checking' || updates.status === 'downloading'} onclick={() => updates.check(true)}>
            Check for updates
          </button>
        {/if}
      </div>
    </section>

    <section id="about">
      <h2>About</h2>
      <dl class="about">
        <dt>Version</dt>
        <dd>{updates.current}</dd>
        <dt>App</dt>
        <dd>{desktop ? 'Desktop app' : 'Web app'}</dd>
        {#if engine}
          <dt>Engine</dt>
          <dd>Chromium {engine.chromium} (Electron {engine.electron})</dd>
        {/if}
      </dl>
      <div class="links">
        <button class="ghost" onclick={() => browser.go(tab, 'biggle://requests')}><Icon name="idea" size={15} /> Request a feature</button>
        <a class="ghost" href="https://github.com/bigglenet/bigglenet/releases" target="_blank" rel="noreferrer"><Icon name="external" size={14} /> All releases</a>
      </div>
      <p class="muted small">Made by the Bigglenet. Open source, MIT licence.</p>
    </section>

    <section id="whats-new">
      <h2>What’s new</h2>
      <ol class="changelog">
        {#each releases as r (r.version)}
          <li>
            <div class="release-head">
              <strong>{r.version}</strong>
              {#if r.version === updates.current}<span class="pill">This version</span>{/if}
              <span class="muted small">{date(r.date)}</span>
            </div>
            <ul>
              {#each r.changes as change, i (i)}<li>{change}</li>{/each}
            </ul>
          </li>
        {/each}
      </ol>
      {#if !showAll && CHANGELOG.length > releases.length}
        <button class="ghost" onclick={() => (showAll = true)}>Show older versions</button>
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
