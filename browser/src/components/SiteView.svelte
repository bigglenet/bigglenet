<script lang="ts">
  // A site straight from the internet, in the desktop app: a real Chromium page of its own, laid
  // exactly over this tab's page area, so it's in the tab like any page but runs like it would
  // in any browser (full speed, cross-origin isolation for games that need it). See
  // desktop/main/sites.js. Sites that have to be a page of their own (`window`) get a bar above
  // them that can pop them out into a window, or open them in the computer's web browser.
  //
  // The page is drawn above everything in the Biggle window, so it hides when this tab isn't
  // showing and while a Bigglenet menu or dialog is open (see overlays.svelte.ts).
  import { untrack } from 'svelte';
  import { browser, type Tab } from '../lib/browser.svelte';
  import { overlays } from '../lib/overlays.svelte';
  import {
    closeSiteWindow,
    onSiteViewTitle,
    onSiteWindowClosed,
    openExternal,
    openSiteWindow,
    siteViewClose,
    siteViewHide,
    siteViewShow,
  } from '../lib/platform';
  import Icon from './Icon.svelte';

  let { tab, view }: { tab: Tab; view: { site: string; url: string; window: boolean } } = $props();

  /** In the tab, or popped out into a window of its own. */
  let mode = $state<'tab' | 'window'>('tab');
  let windowOpen = $state(false);
  let error = $state('');
  let slot = $state<HTMLElement>();
  /** The web view exists (it's made the first time it's shown). */
  let made = false;

  const showing = $derived(mode === 'tab' && browser.activeId === tab.id && overlays.count === 0);

  const host = $derived.by(() => {
    try {
      return new URL(view.url).host;
    } catch {
      return view.url;
    }
  });

  const message = (e: unknown) => (typeof e === 'string' ? e : e instanceof Error ? e.message : 'Something went wrong.');

  // A new load (a new `view`): start in the tab. Leaving the page closes its web view and window.
  $effect(() => {
    const site = view.site;
    let stops: (() => void)[] = [];
    let gone = false;
    const keep = (p: Promise<() => void>) => p.then((stop) => (gone ? stop() : stops.push(stop)));
    untrack(() => {
      mode = 'tab';
      error = '';
      made = false;
      browser.frameLoaded(tab);
      keep(onSiteViewTitle((s, title) => s === site && title.trim() && (tab.title = title.trim().slice(0, 200))));
      keep(onSiteWindowClosed((s) => s === site && (windowOpen = false)));
    });
    return () => {
      gone = true;
      stops.forEach((stop) => stop());
      siteViewClose(site).catch(() => {});
      closeSiteWindow(site).catch(() => {});
    };
  });

  // Keep the web view over the page area: shown and placed while this tab is showing, hidden
  // otherwise.
  let frame = 0;
  function place() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(async () => {
      if (!slot || !untrack(() => showing)) return;
      try {
        await siteViewShow(view.site, view.url, slot.getBoundingClientRect());
        made = true;
      } catch (e) {
        // Couldn't make one here: a window of its own still works.
        error = message(e);
        popOut();
      }
    });
  }
  $effect(() => {
    void view;
    if (showing && slot) place();
    else if (made) siteViewHide(untrack(() => view.site)).catch(() => {});
  });
  $effect(() => {
    if (!slot) return;
    const observer = new ResizeObserver(() => place());
    observer.observe(slot);
    addEventListener('resize', place);
    return () => {
      observer.disconnect();
      removeEventListener('resize', place);
    };
  });

  async function popOut() {
    mode = 'window';
    made = false;
    await siteViewClose(view.site).catch(() => {});
    try {
      await openSiteWindow(view.site, view.url, tab.title);
      windowOpen = true;
    } catch (e) {
      error = message(e);
    }
  }

  async function putBack() {
    await closeSiteWindow(view.site).catch(() => {});
    windowOpen = false;
    error = '';
    mode = 'tab';
  }
</script>

<div class="site">
  {#if view.window || mode === 'window'}
  <div class="bar">
    <Icon name="globe" size={14} />
    <span class="host">{host}</span>
    <span class="note">runs as its own page</span>
    {#if mode === 'tab'}
      <button onclick={popOut} title="Open it in a window of its own"><Icon name="external" size={14} /> Own window</button>
    {:else}
      <button onclick={putBack} title="Show it in this tab again"><Icon name="tabs" size={14} /> Back in the tab</button>
    {/if}
    <button onclick={() => openExternal(view.url)} title="Open it in your computer's web browser">Open in your browser</button>
  </div>
  {/if}

  {#if mode === 'tab'}
    <div class="slot" bind:this={slot}></div>
  {:else}
    <div class="card">
      <h1>{tab.title}</h1>
      <p class="muted">
        {windowOpen ? 'Running in its own window,' : 'It was in its own window,'} straight from {host}. Closing this tab closes it.
      </p>
      <div class="actions">
        {#if windowOpen}
          <button class="primary" onclick={() => openSiteWindow(view.site, view.url, tab.title)}>Show its window</button>
        {:else}
          <button class="primary" onclick={popOut}>Open it again</button>
        {/if}
        <button class="ghost" onclick={putBack}>Back in the tab</button>
      </div>
    </div>
  {/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</div>

<style>
  .site {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--surface);
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 32px;
    padding: 0 8px 0 12px;
    border-bottom: 1px solid var(--border);
    color: var(--muted);
    font-size: 12.5px;
  }
  .host {
    color: var(--text);
    font-weight: 600;
  }
  .note {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bar button {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 24px;
    padding: 0 9px;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--card);
    color: var(--text);
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }
  .slot {
    flex: 1;
    min-height: 0;
    /* Shows only for a moment, before the web view is laid over it. */
    background: #000;
  }
  .card {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 24px;
    text-align: center;
  }
  h1 {
    margin: 0;
    font-size: 22px;
    overflow-wrap: anywhere;
  }
  p {
    margin: 0;
  }
  .muted {
    max-width: 440px;
    color: var(--muted);
    line-height: 1.45;
  }
  .actions {
    display: flex;
    gap: 8px;
    margin-top: 6px;
  }
  .primary,
  .ghost {
    height: 38px;
    padding: 0 16px;
    border-radius: 10px;
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
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
  .error {
    padding: 8px 12px;
    color: var(--danger);
    font-size: 13px;
  }
</style>
