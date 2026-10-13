<script lang="ts">
  import { account } from './lib/account.svelte';
  import { bookmarks } from './lib/bookmarks.svelte';
  import { browser } from './lib/browser.svelte';
  import { find } from './lib/find.svelte';
  import { shortcutName } from './lib/keys';
  import { notices } from './lib/notify.svelte';
  import { people } from './lib/people.svelte';
  import { desktop, initPlatform, isApp, ownWindowButtons } from './lib/platform';
  import { calls } from './lib/calls.svelte';
  import { chats } from './lib/chats.svelte';
  import { signing } from './lib/signing.svelte';
  import { sites } from './lib/sites.svelte';
  import { social } from './lib/social.svelte';
  import { updates } from './lib/updates.svelte';
  import { startSettings } from './lib/startpage.svelte';
  import { parse, siteHost } from './lib/url';
  import { zoom } from './lib/zoom.svelte';
  import { printPage, setGameMode, toggleReader } from './lib/actions.svelte';
  import { controlFor } from './lib/pagecontrol';
  import { couch } from './lib/couch.svelte';
  import { downloads } from './lib/downloads.svelte';
  import { perf } from './lib/perf.svelte';
  import { i18n, t } from './lib/i18n.svelte';
  import './lib/theme.svelte';
  import AdminPage from './components/AdminPage.svelte';
  import CommandPalette, { palette } from './components/CommandPalette.svelte';
  import ContextMenu from './components/ContextMenu.svelte';
  import { menu } from './lib/contextmenu.svelte';
  import DownloadsPage from './components/DownloadsPage.svelte';
  import PerfOverlay from './components/PerfOverlay.svelte';
  import ReaderView from './components/ReaderView.svelte';
  import ScreenshotTool, { canScreenshot, shot } from './components/ScreenshotTool.svelte';
  import AdminPages from './components/AdminPages.svelte';
  import BookmarksBar from './components/BookmarksBar.svelte';
  import BookmarksPage from './components/BookmarksPage.svelte';
  import FindBar from './components/FindBar.svelte';
  import GuestbookDialog from './components/GuestbookDialog.svelte';
  import HistoryPage from './components/HistoryPage.svelte';
  import ProfilePage from './components/ProfilePage.svelte';
  import ScreenPicker from './components/ScreenPicker.svelte';
  import RequestsPage from './components/RequestsPage.svelte';
  import SettingsPage from './components/SettingsPage.svelte';
  import AuthScreen from './components/AuthScreen.svelte';
  import ErrorPage from './components/ErrorPage.svelte';
  import ExternalPrompt from './components/ExternalPrompt.svelte';
  import CallToasts from './components/CallToasts.svelte';
  import CallWindow from './components/CallWindow.svelte';
  import ChatApp from './components/chat/ChatApp.svelte';
  import NoxPage from './components/NoxPage.svelte';
  import PageFrame from './components/PageFrame.svelte';
  import SiteView from './components/SiteView.svelte';
  import SiteWindow from './components/SiteWindow.svelte';
  import WebFrame from './components/WebFrame.svelte';
  import SiteEditor from './components/SiteEditor.svelte';
  import BoardPage from './components/community/BoardPage.svelte';
  import ClubsPage from './components/community/ClubsPage.svelte';
  import CollectionPicker from './components/community/CollectionPicker.svelte';
  import CollectionsPage from './components/community/CollectionsPage.svelte';
  import EventsPage from './components/community/EventsPage.svelte';
  import FeedPage from './components/community/FeedPage.svelte';
  import InvitePage from './components/community/InvitePage.svelte';
  import { collect } from './lib/collect.svelte';
  import { announcements } from './lib/announcement.svelte';
  import AnnouncementBanner from './components/AnnouncementBanner.svelte';
  import StatusPage from './components/StatusPage.svelte';
  import ReportDialog from './components/ReportDialog.svelte';
  import { report } from './lib/report.svelte';
  import { invite, inviteCodeIn } from './lib/invite.svelte';
  import SitesPage from './components/SitesPage.svelte';
  import StartPage from './components/StartPage.svelte';
  import TabBar from './components/TabBar.svelte';
  import TabSwitcher from './components/TabSwitcher.svelte';
  import Toolbar from './components/Toolbar.svelte';
  import UpdateBanner from './components/UpdateBanner.svelte';
  import WindowControls from './components/WindowControls.svelte';
  import Icon from './components/Icon.svelte';

  // ?open=biggle://… opens that address in the first tab; ?private=1 makes the window private.
  const params = new URLSearchParams(location.search);
  const opening = params.get('open');
  browser.privateWindow = params.get('private') === '1';
  // Handled now: a reload shouldn't open it again.
  if (opening) params.delete('open');
  // An invite link (bigglenet…/invite/CODE comes here as ?invite=CODE): kept for signing up.
  const inviteCode = params.get('invite');
  if (inviteCode) {
    invite.remember(inviteCode);
    params.delete('invite');
  }
  history.replaceState(null, '', location.pathname + (params.size ? `?${params}` : ''));
  if (browser.tabs.length) {
    // Already open (the app's code was swapped while running, in development): keep them.
  } else if (browser.restoreTabs()) {
    // A reload: the same tabs as before.
    if (opening) browser.newTab(opening);
  } else if (opening || browser.privateWindow) {
    // A tab dragged out into a window of its own, or a new window.
    browser.newTab(opening ?? startSettings.newTabAddress);
  } else if (!browser.restoreOnStartup() || !browser.tabs.length) {
    // Starting up: the tabs from last time (if that's the setting), or pinned tabs and a new one.
    browser.newTab(startSettings.newTabAddress);
  }
  // Signed in already: show who the invite is from.
  if (inviteCode && account.user) browser.newTab(`biggle://invite/${inviteCode}`);
  $effect(() => browser.saveTabs());

  // Shortcuts and commands handled here and in the components they belong to.
  Object.assign(browser.commands, {
    k: () => (palette.open = palette.open ? null : 'all'),
    'shift+a': () => (palette.open = palette.open ? null : 'tabs'),
    p: () => browser.active && printPage(browser.active),
    'shift+s': () => canScreenshot && shot.start(),
    'shift+r': () => browser.active && toggleReader(browser.active),
    'shift+f': () => setGameMode(!browser.gameMode),
  });
  couch.init();
  // For poking at the browser from the dev tools while developing.
  if (import.meta.env.DEV) Object.assign(window, { __biggle: { browser, menu, palette } });
  $effect(() => {
    if (couch.palette) palette.open = 'all';
  });
  downloads.start();

  // Leaving full screen (Esc, or the window's button) ends game mode too.
  desktop?.window.onFullscreenChange((on) => !on && setGameMode(false));
  if (!desktop) document.addEventListener('fullscreenchange', () => !document.fullscreenElement && setGameMode(false));

  // Tabs in the background for a while go to sleep, to save memory (Settings → Tabs).
  $effect(() => {
    const timer = setInterval(() => browser.sleepIdle(), 60_000);
    return () => clearInterval(timer);
  });

  // Small pictures of tabs, for the previews you get by hovering over them (desktop app).
  $effect(() => {
    if (!desktop || !ready) return;
    const timer = setInterval(async () => {
      const tab = browser.active;
      if (!tab || document.visibilityState !== 'visible') return;
      const section = document.querySelector<HTMLElement>(`[data-tab="${tab.id}"]`);
      const control = controlFor(tab.id);
      let picture: string | null = null;
      if (tab.view.type === 'web' && control?.capture) picture = await control.capture(280);
      else if (section) {
        const r = section.getBoundingClientRect();
        picture = await desktop!.window.capture({ x: r.x, y: r.y, width: r.width, height: r.height }, 280).catch(() => null);
      }
      if (picture) tab.thumbnail = picture;
    }, 15_000);
    return () => clearInterval(timer);
  });

  // Side by side: drag the line between them.
  let mainEl = $state<HTMLElement>();
  function dragDivider(e: PointerEvent) {
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      if (!browser.split || !mainEl) return;
      const r = mainEl.getBoundingClientRect();
      browser.split.ratio = Math.min(0.8, Math.max(0.2, (ev.clientX - r.left) / r.width));
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  }
  // Clicking into one side makes it the active tab.
  function onfocusin(e: FocusEvent) {
    if (!browser.split) return;
    const section = (e.target as Element).closest?.('[data-tab]');
    const id = Number(section?.getAttribute('data-tab'));
    if (id && id !== browser.activeId && browser.inSplit(id)) browser.activate(id);
  }
  // A click into a page (an iframe) moves focus there without telling the page around it.
  addEventListener('blur', () =>
    setTimeout(() => {
      const el = document.activeElement;
      if (el instanceof HTMLIFrameElement && browser.split) {
        const id = Number(el.closest('[data-tab]')?.getAttribute('data-tab'));
        if (id && id !== browser.activeId && browser.inSplit(id)) browser.activate(id);
      }
    }),
  );

  // Phones: swipe in from the left edge for back, from the right for forward (pages handle it
  // themselves, see page-runtime.js).
  let touch: { x: number; y: number } | null = null;
  function ontouchstart(e: TouchEvent) {
    const t0 = e.touches[0];
    touch = e.touches.length === 1 && (t0.clientX < 24 || t0.clientX > innerWidth - 24) ? { x: t0.clientX, y: t0.clientY } : null;
  }
  function ontouchend(e: TouchEvent) {
    const t0 = e.changedTouches[0];
    const tab = browser.active;
    if (!touch || !t0 || !tab) return;
    const dx = t0.clientX - touch.x;
    if (Math.abs(dx) > 90 && Math.abs(t0.clientY - touch.y) < 60) dx > 0 ? browser.back(tab) : browser.forward(tab);
    touch = null;
  }
  initPlatform(
    (href) => {
      // biggle://invite/CODE from outside: remembered for signing up, too.
      const code = inviteCodeIn(href);
      if (code && !account.user) invite.remember(code);
      browser.openFromOutside(href);
    },
    (key) => browser.shortcut(key),
  );
  // "Check for Updates…" in the Mac menu: show Settings → Updates, and check.
  // The app's own menus (menu bar, tray) follow the browser's language.
  $effect(() => {
    desktop?.language?.(i18n.lang);
  });

  desktop?.updates.onCheckRequested(() => {
    if (ready) browser.openFromOutside('biggle://settings/updates');
    updates.check(true);
  });
  updates.start();

  // You need a Biggle ID with a confirmed email (or Google) to use Bigglenet.
  const ready = $derived(!!account.user && !account.needsEmail);

  // The admins' banner, checked every few minutes once signed in.
  $effect(() => {
    if (ready) announcements.start();
  });

  // Unread messages and friend requests on the app's icon.
  $effect(() => notices.badge(ready ? social.unread : 0));
  // A notification clicked on a phone (public/sw.js): show that chat.
  navigator.serviceWorker?.addEventListener('message', (e) => {
    if (e.data?.type === 'open-chat' && typeof e.data.chatId === 'number') social.showChat(e.data.chatId);
    if (e.data?.type === 'open' && typeof e.data.href === 'string' && e.data.href.startsWith('biggle://')) browser.openFromOutside(e.data.href);
  });
  // Opened from a tapped notification while Bigglenet was closed: show that chat.
  const chatParam = Number(new URLSearchParams(location.search).get('chat'));
  if (chatParam) {
    history.replaceState(null, '', location.pathname);
    social.showChat(chatParam);
  }

  // What I'm up to, for friends, if I share it: the site in the tab I'm looking at. Said again
  // every few minutes so it doesn't go stale.
  $effect(() => {
    if (!ready || !people.shareActivity) return;
    const tab = browser.active;
    const u = tab && parse(tab.url);
    const host = u?.kind === 'site' ? siteHost(u.name, u.tld) : null;
    const showing = tab && !tab.preview && !tab.private && (tab.view.type === 'page' || tab.view.type === 'web');
    const place = host && showing ? (tab.title && tab.title !== host ? `${tab.title} (${host})` : host) : null;
    const timer = setTimeout(() => people.reportActivity(place), 3000);
    return () => clearTimeout(timer);
  });
  $effect(() => {
    if (!ready || !people.shareActivity) return;
    const timer = setInterval(() => people.keepActivity(), 5 * 60_000);
    return () => clearInterval(timer);
  });

  // Friends, live updates and the review queue follow the signed-in account.
  $effect(() => {
    if (!account.token) return;
    social.start();
    sites.refreshReviews();
    return () => {
      social.stop();
      sites.reset();
    };
  });

  const editing = (el: EventTarget | null) =>
    el instanceof Element && !!el.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])');

  function onkeydown(e: KeyboardEvent) {
    if (!ready) return;
    const tab = browser.active;
    // F5 reloads the page in the tab, not the whole browser.
    if (e.key === 'F5') {
      e.preventDefault();
      if (tab) browser.reload(tab);
      return;
    }
    // Back and forward: Alt+←/→ (Windows, Linux) and ⌘←/→ (Mac), outside text fields.
    if ((e.altKey || e.metaKey) && !e.ctrlKey && !e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      if (editing(e.target) || !tab) return;
      e.preventDefault();
      if (e.key === 'ArrowLeft') browser.back(tab);
      else browser.forward(tab);
      return;
    }
    if ((e.metaKey || e.ctrlKey) && !e.altKey && browser.shortcut(shortcutName(e))) e.preventDefault();
  }

  // The mouse's back and forward buttons.
  function onmouseup(e: MouseEvent) {
    const tab = browser.active;
    if (!ready || !tab || (e.button !== 3 && e.button !== 4)) return;
    e.preventDefault();
    if (e.button === 3) browser.back(tab);
    else browser.forward(tab);
  }
  // The desktop app has no right-click menu of the webview's own (its Refresh would reload the
  // whole browser), except in text fields, where cut, copy and paste are handy.
  function oncontextmenu(e: MouseEvent) {
    if (isApp && !editing(e.target)) e.preventDefault();
  }
  function onmousedown(e: MouseEvent) {
    if (e.button === 3 || e.button === 4) e.preventDefault();
  }

  // The system back button (Android, browser back): keep one extra history entry around so
  // "back" lands here first. Close whatever's open, or go back in the tab; at the very start,
  // let it leave the app.
  history.replaceState({ biggle: 'base' }, '');
  history.pushState({ biggle: 'top' }, '');
  function onpopstate() {
    const tab = browser.active;
    let handled = true;
    if (browser.switcher) browser.switcher = false;
    else if (browser.external) browser.external = null;
    else if (calls.expanded) calls.expanded = false;
    else if (social.open && chats.back?.()) {}
    else if (social.open) social.open = false;
    else if (tab && tab.index > 0) browser.back(tab);
    else handled = false;
    if (handled) history.pushState({ biggle: 'top' }, '');
    else history.back();
  }
</script>

<svelte:window {onkeydown} {onmouseup} {onmousedown} {oncontextmenu} {onpopstate} onmouseleave={() => (browser.hoverUrl = '')} />
<svelte:head>
  <title>{ready ? (browser.active?.title ?? 'Bigglenet') : 'Bigglenet'}</title>
</svelte:head>

{#if !ready}
  {#if isApp}
    <div class="titlebar">
      {#if ownWindowButtons}<WindowControls />{/if}
    </div>
  {/if}
  <AuthScreen />
{:else}
  <div class="app" class:game={browser.gameMode}>
    {#if !browser.gameMode}
      <TabBar />
      <Toolbar />
      {#if bookmarks.bar && bookmarks.list.length}
        <div class="bookmarks"><BookmarksBar /></div>
      {/if}
      <AnnouncementBanner />
    {/if}
    <div class="progress" class:on={browser.active?.loading}></div>
    {#if find.open}<FindBar />{/if}
    <div class="body">
      <main
        bind:this={mainEl}
        class:split={!!browser.split && browser.inSplit(browser.activeId)}
        style:--ratio={browser.split?.ratio ?? 0.5}
        {onfocusin}
        {ontouchstart}
        {ontouchend}
      >
        {#each browser.tabs as tab (tab.id)}
          <!-- The browser's own pages zoom here; sites zoom themselves (PageFrame, SiteView…). -->
          <section
            class="view"
            class:active={browser.isVisible(tab.id)}
            class:left={browser.split?.left === tab.id}
            class:right={browser.split?.right === tab.id}
            class:current={tab.id === browser.activeId}
            data-tab={tab.id}
            style:zoom={tab.view.type === 'internal' || tab.view.type === 'error' ? zoom.of(tab.url) : null}
          >
            {#if tab.view.type === 'internal'}
              {#if tab.view.page === 'admin' && tab.view.path === 'pages'}
                <AdminPages {tab} />
              {:else if tab.view.page === 'admin'}
                <AdminPage {tab} />
              {:else if tab.view.page === 'nox'}
                <NoxPage {tab} path={tab.view.path} />
              {:else if tab.view.page === 'requests'}
                <RequestsPage />
              {:else if tab.view.page === 'settings'}
                <SettingsPage {tab} path={tab.view.path} />
              {:else if tab.view.page === 'bookmarks'}
                <BookmarksPage {tab} />
              {:else if tab.view.page === 'history'}
                <HistoryPage {tab} />
              {:else if tab.view.page === 'downloads'}
                <DownloadsPage />
              {:else if tab.view.page === 'profile'}
                <ProfilePage {tab} path={tab.view.path} />
              {:else if tab.view.page === 'chat'}
                <ChatApp {tab} path={tab.view.path} />
              {:else if tab.view.page === 'feed'}
                <FeedPage {tab} />
              {:else if tab.view.page === 'clubs'}
                <ClubsPage {tab} path={tab.view.path} />
              {:else if tab.view.page === 'board'}
                <BoardPage {tab} path={tab.view.path} />
              {:else if tab.view.page === 'events'}
                <EventsPage {tab} path={tab.view.path} />
              {:else if tab.view.page === 'collections'}
                <CollectionsPage {tab} path={tab.view.path} />
              {:else if tab.view.page === 'invite'}
                <InvitePage {tab} path={tab.view.path} />
              {:else if tab.view.page === 'status'}
                <StatusPage />
              {:else if tab.view.page === 'sites' && tab.view.path}
                <SiteEditor {tab} name={tab.view.path} />
              {:else if tab.view.page === 'sites'}
                <SitesPage {tab} />
              {:else}
                <StartPage {tab} />
              {/if}
            {:else if tab.view.type === 'page'}
              <PageFrame {tab} view={tab.view} />
            {:else if tab.view.type === 'web' && isApp}
              <SiteView {tab} view={tab.view} />
            {:else if tab.view.type === 'web' && tab.view.window}
              <SiteWindow {tab} view={tab.view} />
            {:else if tab.view.type === 'web'}
              <WebFrame {tab} view={tab.view} />
            {:else if tab.view.type === 'error'}
              <ErrorPage {tab} error={tab.view.error} />
            {:else}
              <div class="asleep"><p>{t('This tab was asleep to save memory.')}</p></div>
            {/if}
            {#if tab.reader}<ReaderView {tab} />{/if}
          </section>
        {/each}
        {#if browser.split && browser.inSplit(browser.activeId)}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="divider" onpointerdown={dragDivider} title={t('Drag to resize')}></div>
        {/if}
        {#if browser.hoverUrl}<div class="status">{browser.hoverUrl.replace(/^biggle:\/\//, '')}</div>{/if}
      </main>
      {#if social.open && !browser.gameMode}
        <div class="chat-sidebar"><ChatApp sidebar /></div>
      {/if}
    </div>
    {#if browser.gameMode}
      <!-- Game mode: move to the very top to see how to leave. -->
      <div class="game-edge">
        <button onclick={() => setGameMode(false)}><Icon name="close" size={13} /> {t('Leave game mode')}</button>
      </div>
    {/if}
  </div>
  {#if browser.toast}<div class="toast" role="status">{browser.toast}</div>{/if}
  {#if perf.on}<PerfOverlay />{/if}
  <ContextMenu />
  <CommandPalette />
  {#if collect.site}<CollectionPicker />{/if}
  {#if report.request}<ReportDialog />{/if}
  <ScreenshotTool />

  {#if browser.switcher}
    <TabSwitcher />
  {/if}
  {#if browser.external}
    <ExternalPrompt url={browser.external} />
  {/if}
  {#if calls.chatId !== null}
    <CallWindow />
  {/if}
  <CallToasts />
  {#if signing.request}
    <GuestbookDialog />
  {/if}
  {#if isApp}<ScreenPicker />{/if}
{/if}
{#if (updates.ready && !updates.dismissed) || (ready && updates.justUpdated)}
  <UpdateBanner />
{/if}

<style>
  /* Before signing in there's no tab bar, so this keeps the window draggable and closable. */
  .titlebar {
    -webkit-app-region: drag;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 10;
    display: flex;
    height: 40px;
  }

  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    height: 100dvh;
    padding-top: env(safe-area-inset-top);
    background: var(--toolbar);
  }

  .body {
    flex: 1;
    display: flex;
    min-height: 0;
  }
  main {
    position: relative;
    flex: 1;
    min-width: 0;
    padding-bottom: env(safe-area-inset-bottom);
    background: var(--surface);
  }
  .view {
    position: absolute;
    inset: 0;
    display: none;
  }
  .view.active {
    display: block;
  }
  /* Side by side: two tabs, with a line between them you can drag. */
  main.split .view.left {
    right: calc((1 - var(--ratio)) * 100% + 2px);
  }
  main.split .view.right {
    left: calc(var(--ratio) * 100% + 2px);
  }
  main.split .view.active:not(.current) {
    opacity: 0.97;
  }
  .divider {
    position: absolute;
    top: 0;
    bottom: 0;
    left: calc(var(--ratio) * 100% - 3px);
    z-index: 3;
    width: 6px;
    background: var(--border);
    cursor: col-resize;
  }
  .divider:hover {
    background: var(--accent);
  }
  .asleep {
    display: grid;
    place-items: center;
    height: 100%;
    color: var(--muted);
  }
  /* Where the link under the mouse goes. */
  .status {
    position: absolute;
    left: 6px;
    bottom: 6px;
    z-index: 6;
    max-width: 60%;
    padding: 4px 9px;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--card);
    color: var(--muted);
    font-size: 12px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    pointer-events: none;
  }
  .toast {
    position: fixed;
    left: 50%;
    bottom: 24px;
    z-index: 95;
    transform: translateX(-50%);
    max-width: calc(100vw - 32px);
    padding: 10px 16px;
    border-radius: 12px;
    background: #222;
    color: #f6f4f0;
    font-size: 13.5px;
    box-shadow: 0 10px 30px -10px rgb(0 0 0 / 0.5);
  }
  /* Game mode: just the page. The top few pixels show how to leave. */
  .app.game main {
    padding-top: 3px;
    background: #000;
  }
  .game-edge {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 50;
    height: 3px;
    display: flex;
    justify-content: center;
  }
  .game-edge button {
    transform: translateY(-110%);
    height: 30px;
    margin-top: 3px;
    padding: 0 12px;
    border: 0;
    border-radius: 0 0 10px 10px;
    background: rgb(0 0 0 / 0.8);
    color: #fff;
    font: inherit;
    font-size: 12.5px;
    transition: transform 0.15s;
  }
  .game-edge:hover {
    height: 40px;
  }
  .game-edge:hover button {
    transform: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  /* Phones have no room for the bookmarks bar: biggle://bookmarks has them all. */
  @media (max-width: 699px) {
    .bookmarks {
      display: none;
    }
  }

  .chat-sidebar {
    flex: none;
    width: 340px;
    min-height: 0;
    border-left: 1px solid var(--border);
  }
  @media (max-width: 699px) {
    .chat-sidebar {
      position: fixed;
      inset: 0;
      z-index: 30;
      width: auto;
      border: 0;
      padding-top: env(safe-area-inset-top);
      padding-bottom: env(safe-area-inset-bottom);
      background: var(--surface);
    }
  }

  .progress {
    position: relative;
    z-index: 1;
    height: 2px;
    margin-bottom: -2px;
    overflow: hidden;
  }
  .progress.on::after {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: 40%;
    background: var(--accent);
    border-radius: 2px;
    animation: slide 1s ease-in-out infinite;
  }
  @keyframes slide {
    from {
      transform: translateX(-100%);
    }
    to {
      transform: translateX(250%);
    }
  }
</style>
