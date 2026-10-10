<script lang="ts">
  import { account } from './lib/account.svelte';
  import { browser } from './lib/browser.svelte';
  import { initPlatform, isApp, ownWindowButtons } from './lib/platform';
  import { sites } from './lib/sites.svelte';
  import { social } from './lib/social.svelte';
  import { updates } from './lib/updates.svelte';
  import { startSettings } from './lib/startpage.svelte';
  import AdminPage from './components/AdminPage.svelte';
  import AuthScreen from './components/AuthScreen.svelte';
  import ErrorPage from './components/ErrorPage.svelte';
  import ExternalPrompt from './components/ExternalPrompt.svelte';
  import FriendsPanel from './components/FriendsPanel.svelte';
  import NoxPage from './components/NoxPage.svelte';
  import PageFrame from './components/PageFrame.svelte';
  import SiteEditor from './components/SiteEditor.svelte';
  import SitesPage from './components/SitesPage.svelte';
  import StartPage from './components/StartPage.svelte';
  import TabBar from './components/TabBar.svelte';
  import TabSwitcher from './components/TabSwitcher.svelte';
  import Toolbar from './components/Toolbar.svelte';
  import UpdateBanner from './components/UpdateBanner.svelte';
  import WindowControls from './components/WindowControls.svelte';

  // ?open=biggle://… opens that address in the first tab.
  const opening = new URLSearchParams(location.search).get('open');
  if (!browser.restoreTabs()) browser.newTab(opening ?? startSettings.newTabAddress);
  else if (opening) browser.newTab(opening);
  $effect(() => browser.saveTabs());
  initPlatform((href) => browser.openFromOutside(href));
  updates.start();

  // You need a Biggle ID with a confirmed email (or Google) to use Bigglenet.
  const ready = $derived(!!account.user && !account.needsEmail);

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
    if ((e.metaKey || e.ctrlKey) && !e.altKey && browser.shortcut(e.key)) e.preventDefault();
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
    else if (social.open && social.chatWith) social.closeChat();
    else if (social.open) social.open = false;
    else if (tab && tab.index > 0) browser.back(tab);
    else handled = false;
    if (handled) history.pushState({ biggle: 'top' }, '');
    else history.back();
  }
</script>

<svelte:window {onkeydown} {onmouseup} {onmousedown} {oncontextmenu} {onpopstate} />
<svelte:head>
  <title>{ready ? (browser.active?.title ?? 'Bigglenet') : 'Bigglenet'}</title>
</svelte:head>

{#if !ready}
  {#if ownWindowButtons}
    <div class="titlebar" data-tauri-drag-region><WindowControls /></div>
  {/if}
  <AuthScreen />
{:else}
  <div class="app">
    <TabBar />
    <Toolbar />
    <div class="progress" class:on={browser.active?.loading}></div>
    <div class="body">
      <main>
        {#each browser.tabs as tab (tab.id)}
          <section class="view" class:active={tab.id === browser.activeId}>
            {#if tab.view.type === 'internal'}
              {#if tab.view.page === 'admin'}
                <AdminPage />
              {:else if tab.view.page === 'nox'}
                <NoxPage {tab} />
              {:else if tab.view.page === 'sites' && tab.view.path}
                <SiteEditor {tab} name={tab.view.path} />
              {:else if tab.view.page === 'sites'}
                <SitesPage {tab} />
              {:else}
                <StartPage {tab} />
              {/if}
            {:else if tab.view.type === 'page'}
              <PageFrame {tab} view={tab.view} />
            {:else}
              <ErrorPage {tab} error={tab.view.error} />
            {/if}
          </section>
        {/each}
      </main>
      {#if social.open}
        <FriendsPanel />
      {/if}
    </div>
  </div>

  {#if browser.switcher}
    <TabSwitcher />
  {/if}
  {#if browser.external}
    <ExternalPrompt url={browser.external} />
  {/if}
{/if}
{#if updates.ready && !updates.dismissed}
  <UpdateBanner />
{/if}

<style>
  /* Before signing in there's no tab bar, so this keeps the window draggable and closable. */
  .titlebar {
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
