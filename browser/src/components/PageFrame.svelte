<script lang="ts">
  import { account } from '../lib/account.svelte';
  import { browser, type Tab } from '../lib/browser.svelte';

  // A new `view` object means a new load, even if the srcdoc is identical (reload).
  let { tab, view }: { tab: Tab; view: { srcdoc: string } } = $props();

  let iframe = $state<HTMLIFrameElement>();

  $effect(() => {
    const onmessage = (e: MessageEvent) => {
      if (!iframe || e.source !== iframe.contentWindow) return;
      const msg = e.data;
      if (!msg || typeof msg !== 'object' || msg.biggle !== 1) return;
      browser.onPageMessage(tab, msg, (reply) => iframe?.contentWindow?.postMessage({ biggle: 1, ...reply }, '*'));
    };
    window.addEventListener('message', onmessage);
    return () => window.removeEventListener('message', onmessage);
  });

  // Tell the page when the visitor signs in or out. It got the current user when it loaded.
  let lastUser: string | null | undefined;
  $effect(() => {
    const username = account.user?.username ?? null;
    if (lastUser !== undefined && username !== lastUser) {
      iframe?.contentWindow?.postMessage({ biggle: 1, type: 'user', user: username && { username } }, '*');
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
