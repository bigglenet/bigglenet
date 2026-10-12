<script lang="ts">
  import { pictureInPicture, printPage, saveForOffline, setGameMode, toggleReader } from '../lib/actions.svelte';
  import { bookmarks } from '../lib/bookmarks.svelte';
  import { browser } from '../lib/browser.svelte';
  import { menu, type MenuItem } from '../lib/contextmenu.svelte';
  import { loadDirectory } from '../lib/directory';
  import { downloads } from '../lib/downloads.svelte';
  import { pageHistory } from '../lib/history.svelte';
  import { t } from '../lib/i18n.svelte';
  import { offline } from '../lib/offline.svelte';
  import { overlays } from '../lib/overlays.svelte';
  import { perf } from '../lib/perf.svelte';
  import { isApp } from '../lib/platform';
  import { siteSettings } from '../lib/sitesettings.svelte';
  import { social } from '../lib/social.svelte';
  import { suggest, type Suggestion } from '../lib/suggest';
  import { parse, siteHost, siteKey, START } from '../lib/url';
  import { zoom } from '../lib/zoom.svelte';
  import AccountButton from './AccountButton.svelte';
  import BookmarkButton from './BookmarkButton.svelte';
  import Icon from './Icon.svelte';
  import NotificationBell from './NotificationBell.svelte';
  import SiteInfo from './SiteInfo.svelte';
  import { shot } from './ScreenshotTool.svelte';

  const tab = $derived(browser.active);
  const zoomed = $derived(tab ? zoom.of(tab.url) : 1);
  const site = $derived.by(() => {
    const u = tab && parse(tab.url);
    return u?.kind === 'site' ? u : null;
  });

  let input = $state<HTMLInputElement>();
  let editing = $state(false);
  let value = $state('');
  let infoOpen = $state(false);

  // The address to show: the one the tab is at or loading (as soon as you go somewhere, even
  // while the old page is still on screen), and nothing on the start page.
  const shownUrl = () => (!tab || tab.url === START ? '' : tab.url);

  // Show the tab's address unless the user is typing.
  $effect(() => {
    const url = shownUrl();
    if (!editing) value = url;
  });

  $effect(() => {
    if (browser.addressFocus) {
      input?.focus();
      input?.select();
    }
  });

  // --- Suggestions while typing ---

  let sites = $state<{ name: string; tld?: string; title?: string | null }[]>([]);
  let typed = $state(false);
  let selected = $state(-1);
  const suggestions = $derived(
    editing && typed
      ? suggest(value, { tabs: browser.tabs, activeId: browser.activeId, bookmarks: bookmarks.list, visits: tab?.private ? [] : pageHistory.visits, sites })
      : [],
  );
  $effect(() => {
    if (suggestions.length) return overlays.hold();
  });
  $effect(() => {
    if (editing) loadDirectory().then((d) => (sites = d), () => {});
  });

  function choose(sg: Suggestion) {
    if (!tab) return;
    typed = false;
    input?.blur();
    if (sg.tabId !== undefined) browser.activate(sg.tabId);
    else if (sg.href) browser.go(tab, sg.href);
  }

  function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!tab || !value.trim()) return;
    const sg = selected >= 0 ? suggestions[selected] : null;
    if (sg) return choose(sg);
    typed = false;
    browser.open(tab, value);
    input?.blur();
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (suggestions.length) {
        typed = false;
        return;
      }
      editing = false;
      value = shownUrl();
      input?.blur();
    } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && suggestions.length) {
      e.preventDefault();
      const n = suggestions.length;
      selected = e.key === 'ArrowDown' ? (selected + 1) % n : selected <= 0 ? n - 1 : selected - 1;
    }
  }

  // --- The page menu (⋯) ---

  function pageMenu(e: MouseEvent) {
    if (!tab) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const t0 = tab;
    const items: MenuItem[] = [];
    const isPage = t0.view.type === 'page' || t0.view.type === 'web';
    if (isPage) {
      items.push(
        { label: t0.reader ? t('Leave reader mode') : t('Reader mode'), icon: 'book', action: () => toggleReader(t0) },
        { label: t('Picture-in-picture'), icon: 'pip', action: () => pictureInPicture(t0) },
      );
    }
    items.push({ label: t('Print…'), icon: 'printer', action: () => printPage(t0) });
    if (isApp) items.push({ label: t('Take a screenshot'), icon: 'camera', action: () => shot.start() });
    items.push({ label: t('Find in page'), icon: 'search', action: () => browser.shortcut('f') }, { separator: true });
    if (site) {
      const key = siteKey(site);
      items.push(
        { label: siteSettings.dark(key) ? t('Turn off dark mode here') : t('Dark mode for this site'), icon: 'moon', action: () => siteSettings.setDark(key, !siteSettings.dark(key)) },
        offline.has(key)
          ? { label: t('Remove the offline copy'), icon: 'wifi', action: () => offline.remove(key) }
          : { label: t('Save for offline'), icon: 'wifi', action: () => saveForOffline(t0) },
      );
    }
    items.push(
      { label: t('Zoom in'), icon: 'plus', action: () => zoom.step(t0.url, 1) },
      { label: t('Zoom out'), icon: 'close', action: () => zoom.step(t0.url, -1) },
      { separator: true },
      { label: t0.muted ? t('Unmute this tab') : t('Mute this tab'), icon: t0.muted ? 'volume' : 'mute', action: () => browser.mute(t0) },
      { label: browser.gameMode ? t('Leave game mode') : t('Game mode'), icon: 'gamepad', action: () => setGameMode(!browser.gameMode) },
      { label: perf.on ? t('Hide the performance overlay') : t('Performance overlay (FPS)'), icon: 'gauge', action: () => perf.toggle() },
    );
    menu.show(r.right - 230, r.bottom + 6, items);
  }
</script>

<div class="toolbar">
  <div class="nav">
    <button
      aria-label="Back"
      title="Back"
      disabled={!tab || tab.index <= 0}
      onclick={() => tab && browser.back(tab)}
    >
      <Icon name="back" />
    </button>
    <button
      class="wide-only"
      aria-label="Forward"
      title="Forward"
      disabled={!tab || tab.index >= tab.history.length - 1}
      onclick={() => tab && browser.forward(tab)}
    >
      <Icon name="forward" />
    </button>
    {#if tab?.loading}
      <button class="wide-only" aria-label="Stop" title="Stop" onclick={() => tab && browser.stop(tab)}>
        <Icon name="close" />
      </button>
    {:else}
      <button
        class="wide-only"
        aria-label="Reload"
        title="Reload"
        disabled={!site}
        onclick={() => tab && browser.reload(tab)}
      >
        <Icon name="reload" size={17} />
      </button>
    {/if}
  </div>

  <form class="address" class:editing class:private={tab?.private} onsubmit={submit}>
    <button type="button" class="badge" title={t('About this site')} aria-expanded={infoOpen} onclick={() => (infoOpen = !infoOpen)}>
      <Icon name={tab?.private ? 'incognito' : 'shield'} size={15} />
    </button>
    {#if infoOpen && tab}<SiteInfo {tab} onclose={() => (infoOpen = false)} />{/if}
    <div class="field">
      <input
        bind:this={input}
        bind:value
        onfocus={() => {
          editing = true;
          typed = false;
          selected = -1;
          input?.select();
        }}
        onblur={() => setTimeout(() => ((editing = false), (typed = false)), 150)}
        oninput={() => ((typed = true), (selected = -1))}
        {onkeydown}
        placeholder={tab?.private ? t('Private tab: search or type an address') : t('Search or type a .biggle address')}
        role="combobox"
        aria-expanded={suggestions.length > 0}
        aria-controls="address-suggestions"
        aria-autocomplete="list"
        aria-label={t('Address')}
        spellcheck="false"
        autocomplete="off"
        autocapitalize="off"
      />
      {#if site && !editing}
        <div class="pretty" aria-hidden="true">
          <span class="host">{siteHost(site.name, site.tld)}</span><span class="rest"
            >{site.path === '/' ? '' : site.path}{site.search}{site.hash}</span
          >
        </div>
      {/if}
    </div>
    {#if tab?.preview && site}
      <span class="preview" title="This site is waiting for approval. Only its owner and admins can see it.">Preview</span>
    {/if}
    {#if zoomed !== 1 && !editing}
      <button
        type="button"
        class="zoom"
        title="Zoomed to {Math.round(zoomed * 100)}%. Click to go back to 100%."
        onclick={() => tab && zoom.reset(tab.url)}>{Math.round(zoomed * 100)}%</button
      >
    {/if}
    {#if tab?.private && !editing}<span class="private-pill">{t('Private')}</span>{/if}
    <BookmarkButton />
    {#if tab && tab.url !== START}
      <button type="button" class="more" aria-label={t('More for this page')} title={t('More for this page')} onclick={pageMenu}>
        <Icon name="more" size={18} />
      </button>
    {/if}
    {#if suggestions.length}
      <ul class="suggestions" id="address-suggestions" role="listbox">
        {#each suggestions as sg, i (sg.id)}
          <li role="option" aria-selected={i === selected}>
            <button type="button" class:selected={i === selected} onpointerdown={(e) => e.preventDefault()} onclick={() => choose(sg)}>
              <Icon name={sg.icon} size={15} />
              <span class="label">{sg.label}</span>
              {#if sg.detail}<span class="detail">{sg.detail}</span>{/if}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </form>

  <div class="side">
    <button
      class="tabs-button narrow-only"
      aria-label="{browser.tabs.length} {browser.tabs.length === 1 ? 'tab' : 'tabs'}"
      title="Tabs"
      onclick={() => (browser.switcher = true)}
    >
      {browser.tabs.length}
    </button>
    <button
      class="friends"
      class:on={social.open}
      aria-label={social.unread ? `Chats, ${social.unread} new` : 'Chats'}
      title="Chats"
      aria-pressed={social.open}
      onclick={() => (social.open = !social.open)}
    >
      <Icon name="chat" />
      {#if social.unread}
        <span class="count">{social.unread > 9 ? '9+' : social.unread}</span>
      {/if}
    </button>
    {#if downloads.active.length}
      <button class="friends" title={t('Downloads')} aria-label={t('Downloads')} onclick={() => browser.newTab('biggle://downloads', { after: tab?.id })}>
        <Icon name="download" />
        <span class="ring" style:--done="{Math.round((downloads.active.reduce((n, d) => n + d.received, 0) / Math.max(1, downloads.active.reduce((n, d) => n + d.total, 0))) * 100)}%"></span>
      </button>
    {/if}
    <NotificationBell />
    <AccountButton />
  </div>
</div>

<style>
  .toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 46px;
    padding: 0 10px;
    background: var(--toolbar);
    border-bottom: 1px solid var(--border);
  }

  .nav {
    display: flex;
    gap: 2px;
  }
  .nav button {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: 8px;
    background: none;
    color: var(--text);
  }
  .nav button:hover:not(:disabled) {
    background: var(--hover);
  }
  .nav button:disabled {
    color: var(--faint);
  }

  .side {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .friends,
  .tabs-button {
    position: relative;
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border: 0;
    border-radius: 8px;
    background: none;
    color: var(--text);
  }
  .friends:hover,
  .friends.on {
    background: var(--hover);
  }
  .tabs-button {
    font: inherit;
    font-size: 12px;
    font-weight: 700;
  }
  .tabs-button::before {
    content: '';
    position: absolute;
    inset: 8px;
    border: 2px solid currentColor;
    border-radius: 6px;
  }
  .count {
    position: absolute;
    top: 2px;
    right: 1px;
    min-width: 17px;
    height: 17px;
    padding: 0 4px;
    border-radius: 9px;
    background: var(--danger);
    color: #fff;
    font-size: 10.5px;
    font-weight: 700;
    line-height: 17px;
    box-shadow: 0 0 0 2px var(--toolbar);
  }

  .narrow-only {
    display: none !important;
  }
  @media (max-width: 699px) {
    .wide-only {
      display: none !important;
    }
    .narrow-only {
      display: grid !important;
    }
    .toolbar {
      gap: 4px;
      padding: 0 6px;
    }
  }

  .address {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    height: 34px;
    border-radius: 17px;
    background: var(--field);
    border: 1px solid transparent;
    transition:
      background 0.15s,
      border-color 0.15s,
      box-shadow 0.15s;
  }
  .address:hover {
    background: var(--field-hover);
  }
  .address.editing {
    background: var(--surface);
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }

  .badge {
    display: grid;
    place-items: center;
    width: 34px;
    height: 100%;
    padding: 0;
    border: 0;
    border-radius: 17px 0 0 17px;
    background: none;
    color: var(--accent);
    flex: none;
  }
  .badge:hover {
    color: var(--text);
  }
  .address {
    position: relative;
  }
  .address.private .badge {
    color: var(--private);
  }
  .private-pill {
    flex: none;
    margin-right: 6px;
    padding: 3px 9px;
    border-radius: 10px;
    background: var(--private);
    color: #fff;
    font-size: 11.5px;
    font-weight: 700;
  }
  .more {
    flex: none;
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    margin-right: 2px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: none;
    color: var(--muted);
  }
  .more:hover {
    background: var(--hover);
    color: var(--text);
  }
  .suggestions {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    right: 0;
    z-index: 45;
    margin: 0;
    padding: 6px;
    list-style: none;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--card);
    box-shadow: 0 16px 40px -16px rgb(0 0 0 / 0.45);
  }
  .suggestions button {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border: 0;
    border-radius: 9px;
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 14px;
    text-align: left;
  }
  .suggestions button.selected,
  .suggestions button:hover {
    background: var(--hover);
  }
  .suggestions .label {
    flex: none;
    max-width: 55%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--text);
  }
  .suggestions .detail {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 12.5px;
  }
  .ring {
    position: absolute;
    inset: 3px;
    border-radius: 50%;
    background: conic-gradient(var(--accent) var(--done), transparent 0);
    mask: radial-gradient(circle, transparent 12px, #000 12.5px);
  }

  .field {
    position: relative;
    flex: 1;
    min-width: 0;
    height: 100%;
  }
  input {
    width: 100%;
    height: 100%;
    padding: 0 14px 0 0;
    border: 0;
    outline: 0;
    background: none;
    color: var(--text);
    font: inherit;
    font-size: 14px;
  }
  /* The address drawn over the box hides the box's own text, placeholder included. */
  .address:not(.editing) .field:has(.pretty) input,
  .address:not(.editing) .field:has(.pretty) input::placeholder {
    color: transparent;
  }
  input::placeholder {
    color: var(--muted);
  }

  .preview {
    flex: none;
    margin-right: 6px;
    padding: 3px 9px;
    border-radius: 10px;
    background: var(--accent);
    color: var(--on-accent);
    font-size: 11.5px;
    font-weight: 700;
  }

  .zoom {
    flex: none;
    height: 24px;
    margin-right: 4px;
    padding: 0 8px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 12px;
    font-weight: 600;
  }
  .zoom:hover {
    border-color: var(--accent);
  }

  .pretty {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    padding-right: 14px;
    font-size: 14px;
    white-space: nowrap;
    overflow: hidden;
    pointer-events: none;
  }
  .host {
    color: var(--text);
    font-weight: 500;
  }
  .rest {
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
