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
  import { provideFinder } from '../lib/find.svelte';
  import { t } from '../lib/i18n.svelte';
  import { overlays } from '../lib/overlays.svelte';
  import { provideControl } from '../lib/pagecontrol';
  import { perf } from '../lib/perf.svelte';
  import { closeSiteWindow, desktop, onSiteViewTitle, onSiteWindowClosed, openExternal, openSiteWindow, siteViewClose, siteViewHide, siteViewShow } from '../lib/platform';
  import { cleanReader } from '../lib/reader';
  import { siteSettings } from '../lib/sitesettings.svelte';
  import { zoom } from '../lib/zoom.svelte';
  import Icon from './Icon.svelte';

  let { tab, view }: { tab: Tab; view: { site: string; url: string; window: boolean } } = $props();

  // The desktop app knows this page by its tab's id.
  const id = $derived(String(tab.id));

  /** In the tab, or popped out into a window of its own. */
  let mode = $state<'tab' | 'window'>('tab');
  let windowOpen = $state(false);
  let error = $state('');
  let slot = $state<HTMLElement>();
  /** The web view exists (it's made the first time it's shown). */
  let made = false;
  let ready = $state(false);
  /** A site asking to use the camera, location…: { requestId, origin, what }. */
  let asking = $state<{ requestId: number; origin: string; what: string } | null>(null);
  let remember = $state(true);

  const showing = $derived(mode === 'tab' && browser.isVisible(tab.id) && overlays.count === 0 && !tab.reader);

  const host = $derived.by(() => {
    try {
      return new URL(view.url).host;
    } catch {
      return view.url;
    }
  });

  const message = (e: unknown) => (typeof e === 'string' ? e : e instanceof Error ? e.message : t('Something went wrong.'));

  // A new load (a new `view`): start in the tab. Leaving the page closes its web view and window.
  $effect(() => {
    void view;
    const viewId = id;
    let stops: (() => void)[] = [];
    let gone = false;
    const keep = (p: Promise<() => void> | (() => void) | undefined) =>
      Promise.resolve(p).then((stop) => stop && (gone ? stop() : stops.push(stop)));
    untrack(() => {
      mode = 'tab';
      error = '';
      made = false;
      ready = false;
      asking = null;
      browser.frameLoaded(tab);
      keep(onSiteViewTitle((v, title) => v === viewId && title.trim() && browser.titled(tab, title.trim().slice(0, 200))));
      keep(onSiteWindowClosed((v) => v === viewId && (windowOpen = false)));
      keep(desktop?.sites.onAudio((v, audible) => v === viewId && (tab.audible = audible)));
      keep(desktop?.sites.onHover((v, url) => v === viewId && browser.activeId === tab.id && (browser.hoverUrl = url)));
      keep(desktop?.sites.onZoomRequest((v, by) => v === viewId && zoom.step(tab.url, by)));
      keep(desktop?.sites.onPermission((v, requestId, origin, what) => v === viewId && (asking = { requestId, origin, what })));
      keep(desktop?.sites.onFocus((v) => v === viewId && browser.activeId !== tab.id && browser.activate(tab.id)));
    });
    return () => {
      gone = true;
      stops.forEach((stop) => stop());
      siteViewClose(viewId).catch(() => {});
      closeSiteWindow(viewId).catch(() => {});
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
        await siteViewShow(id, view.url, slot.getBoundingClientRect(), { private: tab.private });
        made = true;
        ready = true;
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
    else if (made) siteViewHide(untrack(() => id)).catch(() => {});
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

  // Zoom, sound and dark mode, once the web view is there.
  $effect(() => {
    const z = zoom.of(tab.url);
    if (ready) desktop?.sites.zoom(untrack(() => id), z).catch(() => {});
  });
  $effect(() => {
    const muted = tab.muted;
    if (ready) desktop?.sites.mute(untrack(() => id), muted).catch(() => {});
  });
  $effect(() => {
    const dark = siteSettings.dark(view.site);
    if (ready) desktop?.sites.dark(untrack(() => id), dark).catch(() => {});
  });

  // The performance overlay: frames per second from the page, memory and processor from the app.
  $effect(() => {
    if (!perf.on || !ready || !browser.isVisible(tab.id)) return;
    const viewId = id;
    desktop?.sites.run(viewId, 'fps');
    const timer = setInterval(async () => {
      const [frames, use] = await Promise.all([desktop?.sites.run(viewId, 'fps'), desktop?.sites.metrics(viewId)]);
      const f = frames as { fps: number; memory: number | null } | null;
      if (f) perf.fps = f.fps;
      if (use) {
        perf.cpu = use.cpu;
        perf.memory = use.memory;
      }
    }, 1000);
    return () => clearInterval(timer);
  });

  // Find in page: Chromium's own. Not while it's in a window of its own.
  $effect(() => {
    const viewId = id;
    return provideFinder(tab.id, {
      find: async (text, dir) => {
        if (mode !== 'tab' || !desktop) return null;
        return desktop.sites.find(viewId, text, { forward: dir !== 'prev', first: dir === 'first' });
      },
      clear: () => void desktop?.sites.stopFind(viewId).catch(() => {}),
    });
  });

  $effect(() => {
    const viewId = id;
    return provideControl(tab.id, {
      print: () => void desktop?.sites.run(viewId, 'print'),
      reader: async () => cleanReader(await desktop?.sites.run(viewId, 'reader')),
      pip: async () => (await desktop?.sites.run(viewId, 'pip')) === true,
      capture: async (width) => (ready ? (desktop?.sites.capture(viewId, width) ?? null) : null),
      metrics: async () => (desktop ? desktop.sites.metrics(viewId) : null),
    });
  });

  function answer(allow: boolean) {
    const a = asking;
    asking = null;
    if (a) desktop?.sites.answerPermission(a.requestId, allow, remember);
  }

  const askingWhat = (what: string) =>
    ({ camera: t('use your camera'), microphone: t('use your microphone'), geolocation: t('know your location'), notifications: t('show notifications'), midi: t('use MIDI devices'), midiSysex: t('use MIDI devices') })[what] ?? what;

  async function popOut() {
    mode = 'window';
    made = false;
    ready = false;
    await siteViewClose(id).catch(() => {});
    try {
      await openSiteWindow(id, view.url, tab.title, { private: tab.private });
      windowOpen = true;
    } catch (e) {
      error = message(e);
    }
  }

  async function putBack() {
    await closeSiteWindow(id).catch(() => {});
    windowOpen = false;
    error = '';
    mode = 'tab';
  }
</script>

<div class="site">
  {#if asking}
    <div class="ask" role="alertdialog" aria-label={t('Permission')}>
      <Icon name="lock" size={15} />
      <span class="what">{t('{site} wants to {what}.', { site: new URL(asking.origin).host, what: askingWhat(asking.what) })}</span>
      <label class="remember"><input type="checkbox" bind:checked={remember} /> {t('Remember')}</label>
      <button class="primary" onclick={() => answer(true)}>{t('Allow')}</button>
      <button onclick={() => answer(false)}>{t('Block')}</button>
    </div>
  {/if}
  {#if view.window || mode === 'window'}
    <div class="bar">
      <Icon name="globe" size={14} />
      <span class="host">{host}</span>
      <span class="note">{t('runs as its own page')}</span>
      {#if mode === 'tab'}
        <button onclick={popOut} title={t('Open it in a window of its own')}><Icon name="external" size={14} /> {t('Own window')}</button>
      {:else}
        <button onclick={putBack} title={t('Show it in this tab again')}><Icon name="tabs" size={14} /> {t('Back in the tab')}</button>
      {/if}
      <button onclick={() => openExternal(view.url)} title={t('Open it in your computer’s web browser')}>{t('Open in your browser')}</button>
    </div>
  {/if}

  {#if mode === 'tab'}
    <div class="slot" bind:this={slot}></div>
  {:else}
    <div class="card">
      <h1>{tab.title}</h1>
      <p class="muted">
        {windowOpen ? t('Running in its own window, straight from {host}.', { host }) : t('It was in its own window, straight from {host}.', { host })}
        {t('Closing this tab closes it.')}
      </p>
      <div class="actions">
        {#if windowOpen}
          <button class="primary" onclick={() => openSiteWindow(id, view.url, tab.title, { private: tab.private })}>{t('Show its window')}</button>
        {:else}
          <button class="primary" onclick={popOut}>{t('Open it again')}</button>
        {/if}
        <button class="ghost" onclick={putBack}>{t('Back in the tab')}</button>
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
  .bar,
  .ask {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 32px;
    padding: 0 8px 0 12px;
    border-bottom: 1px solid var(--border);
    color: var(--muted);
    font-size: 12.5px;
  }
  .ask {
    flex-wrap: wrap;
    padding: 6px 8px 6px 12px;
    background: var(--card);
    color: var(--text);
    font-size: 13.5px;
  }
  .ask .what {
    flex: 1;
    min-width: 0;
  }
  .remember {
    display: flex;
    align-items: center;
    gap: 5px;
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
  .bar button,
  .ask button {
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
  .ask button {
    height: 28px;
    padding: 0 12px;
    font-size: 13px;
  }
  .ask button.primary {
    border: 0;
    background: var(--accent);
    color: var(--on-accent);
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
