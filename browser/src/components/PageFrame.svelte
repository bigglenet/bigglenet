<script lang="ts">
  import { account } from '../lib/account.svelte';
  import { browser, type Tab } from '../lib/browser.svelte';
  import { provideFinder, type FindResult } from '../lib/find.svelte';
  import { frameZoom, zoom } from '../lib/zoom.svelte';

  // A new `view` object means a new load, even if the srcdoc is identical (reload).
  let { tab, view }: { tab: Tab; view: { srcdoc: string } } = $props();

  let iframe = $state<HTMLIFrameElement>();
  const send = (msg: Record<string, unknown>) => iframe?.contentWindow?.postMessage({ biggle: 1, ...msg }, '*');

  // Find in page: the page searches itself (page-runtime.js) and says what it found.
  let nextFind = 0;
  const finding = new Map<number, (result: FindResult | null) => void>();

  $effect(() => {
    const onmessage = (e: MessageEvent) => {
      if (!iframe || e.source !== iframe.contentWindow) return;
      const msg = e.data;
      if (!msg || typeof msg !== 'object' || msg.biggle !== 1) return;
      if (msg.type === 'found') {
        const count = Number(msg.count);
        const index = Number(msg.index);
        finding.get(msg.id)?.(Number.isFinite(count) && Number.isFinite(index) ? { count, index } : null);
        finding.delete(msg.id);
        return;
      }
      browser.onPageMessage(tab, msg, (reply) => send(reply));
    };
    window.addEventListener('message', onmessage);
    return () => window.removeEventListener('message', onmessage);
  });

  $effect(() =>
    provideFinder(tab.id, {
      find: (text, dir) =>
        new Promise((resolve) => {
          const id = ++nextFind;
          finding.set(id, resolve);
          send({ type: 'find', id, text, dir });
          // A page busy running a game might not answer.
          setTimeout(() => finding.delete(id) && resolve(null), 2000);
        }),
      clear: () => send({ type: 'find-clear' }),
    }),
  );

  // Tell the page when the visitor signs in or out. It got the current user when it loaded.
  let lastUser: string | null | undefined;
  $effect(() => {
    const username = account.user?.username ?? null;
    if (lastUser !== undefined && username !== lastUser) {
      send({ type: 'user', user: username && { username } });
    }
    lastUser = username;
  });
</script>

<!--
  The page gets its own opaque origin: no cookies, no storage, no access to the browser.
  It talks to us only through postMessage (see page-runtime.js).
-->
{#key view}
  <iframe
    bind:this={iframe}
    srcdoc={view.srcdoc}
    title={tab.title}
    sandbox="allow-scripts allow-forms allow-modals allow-downloads"
    allow="fullscreen; autoplay; clipboard-write"
    referrerpolicy="no-referrer"
    style={frameZoom(zoom.of(tab.url))}
    onload={() => browser.frameLoaded(tab)}
  ></iframe>
{/key}

<style>
  iframe {
    display: block;
    width: 100%;
    height: 100%;
    border: 0;
    background: #fff;
  }
</style>
