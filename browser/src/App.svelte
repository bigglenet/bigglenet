<script lang="ts">
  import { account } from './lib/account.svelte';
  import { browser } from './lib/browser.svelte';
  import { initPlatform } from './lib/platform';
  import { social } from './lib/social.svelte';
  import { updates } from './lib/updates.svelte';
  import { START } from './lib/url';
  import AdminPage from './components/AdminPage.svelte';
  import AuthDialog from './components/AuthDialog.svelte';
  import ErrorPage from './components/ErrorPage.svelte';
  import ExternalPrompt from './components/ExternalPrompt.svelte';
  import FriendsPanel from './components/FriendsPanel.svelte';
  import NoxPage from './components/NoxPage.svelte';
  import PageFrame from './components/PageFrame.svelte';
  import StartPage from './components/StartPage.svelte';
  import TabBar from './components/TabBar.svelte';
  import TabSwitcher from './components/TabSwitcher.svelte';
  import Toolbar from './components/Toolbar.svelte';
  import UpdateBanner from './components/UpdateBanner.svelte';

  // ?open=biggle://… opens that address in the first tab.
  browser.newTab(new URLSearchParams(location.search).get('open') ?? START);
  initPlatform((href) => browser.openFromOutside(href));
  updates.start();

  // Friends and live updates follow the signed-in account.
  $effect(() => {
    if (!account.token) return;
    social.start();
    return () => social.stop();
  });

  function onkeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && !e.altKey && browser.shortcut(e.key)) e.preventDefault();
  }
</script>

<svelte:window {onkeydown} />
<svelte:head>
  <title>{browser.active?.title ?? 'Bigglenet'}</title>
</svelte:head>

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
{#if account.dialog}
  <AuthDialog />
{/if}
{#if browser.external}
  <ExternalPrompt url={browser.external} />
{/if}
{#if updates.ready && !updates.dismissed}
  <UpdateBanner />
{/if}

<style>
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
