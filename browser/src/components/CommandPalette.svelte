<script lang="ts" module>
  // ⌘K: the command palette. ⇧⌘A: the same, searching only open tabs.
  class Palette {
    open = $state<'all' | 'tabs' | null>(null);
  }
  export const palette = new Palette();
</script>

<script lang="ts">
  import { tick } from 'svelte';
  import { pictureInPicture, printPage, saveForOffline, setGameMode, toggleReader } from '../lib/actions.svelte';
  import { account } from '../lib/account.svelte';
  import { api, errorText } from '../lib/api';
  import { bookmarks } from '../lib/bookmarks.svelte';
  import { browser, type Tab } from '../lib/browser.svelte';
  import { chats } from '../lib/chats.svelte';
  import { loadDirectory } from '../lib/directory';
  import { find } from '../lib/find.svelte';
  import { pageHistory } from '../lib/history.svelte';
  import { i18n, t } from '../lib/i18n.svelte';
  import { overlays } from '../lib/overlays.svelte';
  import { perf } from '../lib/perf.svelte';
  import { isApp, isMac } from '../lib/platform';
  import { siteSettings } from '../lib/sitesettings.svelte';
  import { social } from '../lib/social.svelte';
  import { updates } from '../lib/updates.svelte';
  import { parse, siteHome, siteHost, siteKey, START } from '../lib/url';
  import { zoom } from '../lib/zoom.svelte';
  import { collect } from '../lib/collect.svelte';
  import { follows } from '../lib/follows.svelte';
  import { couch } from '../lib/couch.svelte';
  import { canScreenshot, shot } from './ScreenshotTool.svelte';
  import Icon, { type IconName } from './Icon.svelte';

  type Entry = { id: string; label: string; detail?: string; icon: IconName; hint?: string; run: () => void; kind: string };

  let query = $state('');
  let selected = $state(0);
  let input = $state<HTMLInputElement>();
  let list = $state<HTMLElement>();
  let sites = $state<{ name: string; tld?: string; title?: string | null }[]>([]);

  const mod = isMac ? '⌘' : 'Ctrl+';
  const shift = isMac ? '⇧' : 'Shift+';

  $effect(() => {
    if (!palette.open) return;
    query = '';
    selected = 0;
    const release = overlays.hold();
    tick().then(() => input?.focus());
    loadDirectory().then((d) => (sites = d), () => {});
    return release;
  });

  const tab = $derived(browser.active);
  // A real site (not chat.biggle or board.biggle, which are built in).
  const site = $derived.by(() => {
    const u = tab && parse(tab.url);
    return u?.kind === 'site' && tab?.view.type !== 'internal' ? u : null;
  });

  function go(href: string) {
    if (tab && tab.url === START) browser.go(tab, href);
    else browser.newTab(href, { after: tab?.id });
  }

  const commands = $derived.by((): Entry[] => {
    const c = (id: string, label: string, icon: IconName, run: () => void, hint?: string): Entry => ({ id, label, icon, run, hint, kind: t('Command') });
    const list: Entry[] = [
      c('new-tab', t('New tab'), 'plus', () => browser.shortcut('t'), `${mod}T`),
      c('private', t('New private tab'), 'incognito', () => browser.shortcut('shift+n'), `${shift}${mod}N`),
      c('reopen', t('Reopen closed tab'), 'reload', () => browser.reopenClosed(), `${shift}${mod}T`),
      c('bookmarks', t('Bookmarks'), 'star', () => go('biggle://bookmarks')),
      c('history', t('History'), 'clock', () => go('biggle://history'), isMac ? '⌘Y' : 'Ctrl+H'),
      c('settings', t('Settings'), 'settings', () => go('biggle://settings')),
      c('profile', t('My profile'), 'users', () => go(`biggle://u/${account.user?.username ?? ''}`)),
      c('sites', t('My sites'), 'globe', () => go('biggle://sites')),
      c('nox', t('Search the Bigglenet with Nox'), 'search', () => go('biggle://nox')),
      c('chat', t('Chats'), 'chat', () => (social.open = true)),
      c('feed', t('Feed: what friends are up to'), 'users', () => go('biggle://feed')),
      c('clubs', t('Clubs'), 'users', () => go('biggle://clubs')),
      c('events', t('Events'), 'clock', () => go('biggle://events')),
      c('new-event', t('Plan an event'), 'plus', () => go('biggle://events/new')),
      c('board', t('The board (forums)'), 'chat', () => go('biggle://board.biggle')),
      c('collections', t('My collections'), 'star', () => go('biggle://collections')),
      c('bar', bookmarks.bar ? t('Hide the bookmarks bar') : t('Show the bookmarks bar'), 'star', () => bookmarks.showBar(!bookmarks.bar), `${shift}${mod}B`),
      c('game', browser.gameMode ? t('Leave game mode') : t('Game mode'), 'gamepad', () => setGameMode(!browser.gameMode), `${shift}${mod}F`),
      c('perf', perf.on ? t('Hide the performance overlay') : t('Show the performance overlay (FPS)'), 'gauge', () => perf.toggle()),
      c('couch', couch.enabled ? t('Turn off controller navigation') : t('Use a game controller to get around'), 'gamepad', () => couch.setEnabled(!couch.enabled)),
      c('updates', t('Check for updates'), 'download', () => (go('biggle://settings/updates'), updates.check(true))),
    ];
    if (isApp) {
      list.push(c('downloads', t('Downloads'), 'download', () => go('biggle://downloads'), isMac ? '⇧⌘J' : 'Ctrl+J'));
      list.push(c('window', t('New window'), 'external', () => browser.moveToNewWindow(browser.newTab(START, { activate: false }))));
    }
    if (tab && tab.url !== START) {
      list.push(
        c('find', t('Find in page'), 'search', () => find.show(tab.id), `${mod}F`),
        c('reader', tab.reader ? t('Leave reader mode') : t('Reader mode'), 'book', () => toggleReader(tab), `${shift}${mod}R`),
        c('print', t('Print'), 'printer', () => printPage(tab), `${mod}P`),
        c('pip', t('Picture-in-picture'), 'pip', () => pictureInPicture(tab)),
        c('zoom-in', t('Zoom in'), 'plus', () => zoom.step(tab.url, 1), `${mod}+`),
        c('zoom-out', t('Zoom out'), 'close', () => zoom.step(tab.url, -1), `${mod}−`),
        c('zoom-reset', t('Actual size'), 'search', () => zoom.reset(tab.url), `${mod}0`),
        c('pin', tab.pinned ? t('Unpin tab') : t('Pin tab'), 'pin', () => browser.pin(tab, !tab.pinned)),
        c('mute', tab.muted ? t('Unmute tab') : t('Mute tab'), tab.muted ? 'volume' : 'mute', () => browser.mute(tab)),
        c('duplicate', t('Duplicate tab'), 'copy', () => browser.duplicate(tab)),
        c('move', t('Move tab to new window'), 'external', () => browser.moveToNewWindow(tab)),
      );
      if (canScreenshot) list.push(c('shot', t('Take a screenshot'), 'camera', () => shot.start(), `${shift}${mod}S`));
      if (site) {
        const key = siteKey(site);
        list.push(
          c('dark', siteSettings.dark(key) ? t('Turn off dark mode for this site') : t('Dark mode for this site'), 'moon', () => siteSettings.setDark(key, !siteSettings.dark(key))),
          c('offline', t('Save this site for offline'), 'download', () => saveForOffline(tab)),
          c('collect', t('Add this site to a collection'), 'star', () => collect.open(key)),
          c('follow', follows.has(key) ? t('Unfollow this site') : t('Follow this site'), 'bell', () => follows.toggle(key, (m) => browser.say(m))),
          c('site-settings', t('Site settings'), 'settings', () => go(`biggle://settings/sites/${key}`)),
        );
        if (account.user?.admin) {
          list.push(
            c('site-of-day', t('Make this the site of the day'), 'star', () =>
              api('PUT', '/api/admin/site-of-day', { site: key }).then(
                () => browser.say(t('{site} is the site of the day', { site: siteHost(key) })),
                (e) => browser.say(errorText(e)),
              ),
            ),
          );
        }
      }
      const others = browser.tabs.filter((o) => o.id !== tab.id);
      if (others.length && !browser.inSplit(tab.id)) list.push(c('split', t('Side by side with the next tab'), 'split', () => browser.splitWith(tab.id, others[0].id)));
      if (browser.inSplit(tab.id)) list.push(c('unsplit', t('Stop side by side'), 'split', () => (browser.split = null)));
    }
    return list;
  });

  const tabEntries = (tabs: Tab[]): Entry[] =>
    tabs.map((x) => ({
      id: `tab-${x.id}`,
      label: x.title,
      detail: x.url === START ? '' : x.url.replace(/^biggle:\/\//, ''),
      icon: x.private ? 'incognito' : 'tabs',
      kind: t('Tab'),
      run: () => browser.activate(x.id),
    }));

  /** Lower case for matching, so Turkish İ/I and ı/i match what people type. */
  const fold = (text: string) => text.toLocaleLowerCase(i18n.locale).replace(/ı/g, 'i');

  /** Every word typed appears in it; earlier and at-the-start matches first. */
  function score(text: string, words: string[]): number {
    const hay = fold(text);
    let total = 0;
    for (const w of words) {
      const i = hay.indexOf(w);
      if (i === -1) return -1;
      total += i === 0 ? 0 : hay[i - 1] === ' ' || hay[i - 1] === '/' || hay[i - 1] === '.' ? 1 : 3 + i / 50;
    }
    return total;
  }

  const results = $derived.by((): Entry[] => {
    const words = fold(query.trim()).split(/\s+/).filter(Boolean);
    const tabs = tabEntries(browser.tabs);
    if (palette.open === 'tabs') {
      if (!words.length) return tabs;
      return tabs.map((e) => ({ e, s: score(`${e.label} ${e.detail}`, words) })).filter((x) => x.s >= 0).sort((a, b) => a.s - b.s).map((x) => x.e);
    }
    if (!words.length) return [...commands.slice(0, 8), ...tabs.slice(0, 6)];
    const pool: Entry[] = [
      ...commands,
      ...tabs,
      ...bookmarks.list.map((b): Entry => ({ id: `bm-${b.id}`, label: b.title, detail: b.url.replace(/^biggle:\/\//, ''), icon: 'star', kind: t('Bookmark'), run: () => go(b.url) })),
      ...social.friends.map((f): Entry => ({
        id: `friend-${f.username}`,
        label: f.nickname || f.username,
        detail: t('Message {name}', { name: f.username }),
        icon: 'chat',
        kind: t('Friend'),
        run: async () => social.showChat(await chats.openWith(f.username)),
      })),
      ...sites.map((s): Entry => ({ id: `site-${s.name}`, label: siteHost(s.name, s.tld), detail: s.title ?? '', icon: 'globe', kind: t('Site'), run: () => go(siteHome(s.name, s.tld)) })),
      ...[...new Map(pageHistory.visits.map((v) => [v.url, v])).values()]
        .slice(0, 300)
        .map((v): Entry => ({ id: `h-${v.url}`, label: v.title, detail: v.url.replace(/^biggle:\/\//, ''), icon: 'clock', kind: t('History'), run: () => go(v.url) })),
    ];
    const seen = new Set<string>();
    return pool
      .map((e) => ({ e, s: score(`${e.label} ${e.detail ?? ''}`, words) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => a.s - b.s)
      .map((x) => x.e)
      .filter((e) => !seen.has(e.id) && seen.add(e.id))
      .slice(0, 40);
  });

  $effect(() => {
    void query;
    selected = 0;
  });

  function choose(e: Entry) {
    palette.open = null;
    e.run();
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      palette.open = null;
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      selected = (selected + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % Math.max(1, results.length);
      tick().then(() => list?.querySelector('.selected')?.scrollIntoView({ block: 'nearest' }));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const entry = results[selected];
      if (entry) choose(entry);
    }
  }
</script>

{#if palette.open}
  <div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && (palette.open = null)}>
    <div class="palette" role="dialog" aria-label={t('Command palette')}>
      <div class="field">
        <Icon name={palette.open === 'tabs' ? 'tabs' : 'command'} size={17} />
        <input
          bind:this={input}
          bind:value={query}
          {onkeydown}
          placeholder={palette.open === 'tabs' ? t('Search your open tabs') : t('Type a command, a site, a friend, a tab…')}
          aria-label={t('Search')}
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-results"
          spellcheck="false"
          autocomplete="off"
        />
      </div>
      <ul id="palette-results" role="listbox" bind:this={list}>
        {#each results as e, i (e.id)}
          <li role="option" aria-selected={i === selected}>
            <button class:selected={i === selected} onclick={() => choose(e)} onmousemove={() => (selected = i)}>
              <span class="icon"><Icon name={e.icon} size={16} /></span>
              <span class="text">
                <span class="label">{e.label}</span>
                {#if e.detail}<span class="detail">{e.detail}</span>{/if}
              </span>
              {#if e.hint}<kbd>{e.hint}</kbd>{:else}<span class="kind">{e.kind}</span>{/if}
            </button>
          </li>
        {:else}
          <li class="none">{t('Nothing matches “{query}”.', { query })}</li>
        {/each}
      </ul>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 85;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 12vh 16px 16px;
    background: rgb(0 0 0 / 0.25);
  }
  .palette {
    width: min(640px, 100%);
    max-height: 70vh;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--card);
    box-shadow: 0 30px 80px -30px rgb(0 0 0 / 0.55);
    overflow: hidden;
  }
  .field {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 16px;
    border-bottom: 1px solid var(--border);
    color: var(--muted);
  }
  input {
    flex: 1;
    height: 52px;
    border: 0;
    outline: 0;
    background: none;
    color: var(--text);
    font: inherit;
    font-size: 16px;
  }
  ul {
    margin: 0;
    padding: 6px;
    list-style: none;
    overflow: auto;
  }
  button {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 10px;
    border: 0;
    border-radius: 10px;
    background: none;
    color: var(--text);
    font: inherit;
    text-align: left;
  }
  button.selected {
    background: var(--hover);
  }
  .icon {
    flex: none;
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 8px;
    background: var(--accent-soft);
  }
  .text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .label,
  .detail {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .label {
    font-size: 14px;
  }
  .detail {
    color: var(--muted);
    font-size: 12px;
  }
  kbd,
  .kind {
    flex: none;
    color: var(--muted);
    font: inherit;
    font-size: 12px;
  }
  kbd {
    padding: 2px 6px;
    border: 1px solid var(--border);
    border-radius: 6px;
  }
  .none {
    padding: 18px;
    color: var(--muted);
    text-align: center;
    font-size: 14px;
  }
</style>
