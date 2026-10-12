<script lang="ts">
  // A site that loads straight from its own host (a "direct" link), like any website: its own
  // origin, storage and full speed, which games and WebAssembly ports need. The Bigglenet only
  // looked up where the name points.
  import { browser, type Tab } from '../lib/browser.svelte';
  import { provideFinder } from '../lib/find.svelte';
  import { frameZoom, zoom } from '../lib/zoom.svelte';

  // A new `view` object means a new load (reload).
  let { tab, view }: { tab: Tab; view: { url: string } } = $props();

  // Another website's page can't be searched from here (the desktop app can, see SiteView).
  $effect(() => provideFinder(tab.id, { find: async () => null, clear: () => {} }));

  // The sandbox below is only safe for other origins: never give the shell's own origin scripts.
  const allowed = $derived.by(() => {
    try {
      const u = new URL(view.url);
      return /^https?:$/.test(u.protocol) && u.origin !== location.origin;
    } catch {
      return false;
    }
  });
</script>

{#key view}
  {#if allowed}
    <!--
      It can't take over the browser (no top navigation) and can't use the camera, microphone or
      location. Everything a game needs is allowed: fullscreen, pointer lock, controllers, sound.
    -->
    <iframe
      src={view.url}
      title={tab.title}
      sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-pointer-lock allow-downloads allow-orientation-lock allow-presentation allow-storage-access-by-user-activation"
      allow="fullscreen; autoplay; gamepad; clipboard-read; clipboard-write; screen-wake-lock; encrypted-media; picture-in-picture; accelerometer; gyroscope; xr-spatial-tracking"
      style={frameZoom(zoom.of(tab.url))}
      onload={() => browser.frameLoaded(tab)}
    ></iframe>
  {:else}
    <p class="blocked">This site can't be shown.</p>
  {/if}
{/key}

<style>
  iframe {
    display: block;
    width: 100%;
    height: 100%;
    border: 0;
    background: #fff;
  }
  .blocked {
    margin: 40px;
    color: var(--muted);
  }
</style>
