<script lang="ts">
  // A live preview of a site in the editor, loaded through its signed preview link.
  import { account } from '../lib/account.svelte';
  import { answerCall } from '../lib/frame';
  import { saveLocal } from '../lib/storage';
  import { load } from '../lib/loader';
  import { parse, type SiteUrl } from '../lib/url';

  let {
    site,
    path,
    base,
    version,
    onnavigate,
  }: { site: string; path: string; base: string; version: number; onnavigate: (path: string) => void } = $props();

  let srcdoc = $state('');
  let error = $state('');
  let iframe = $state<HTMLIFrameElement>();

  $effect(() => {
    void version;
    const u = parse(`biggle://${site}.biggle/${path}`) as SiteUrl | null;
    if (!u) return;
    const controller = new AbortController();
    const user = account.user && { username: account.user.username };
    load(u, { signal: controller.signal, fresh: true, user, preview: base }).then((r) => {
      if (r.type === 'page') {
        srcdoc = r.srcdoc;
        error = '';
      } else if (r.type === 'error') {
        error = r.error.code === 'not_bhtml' ? 'This page needs <!bhtml 1> on its first line.' : `Can't show ${path}.`;
      }
    });
    return () => controller.abort();
  });

  $effect(() => {
    const onmessage = (e: MessageEvent) => {
      if (!iframe || e.source !== iframe.contentWindow) return;
      const msg = e.data;
      if (!msg || typeof msg !== 'object' || msg.biggle !== 1) return;
      const reply = (m: Record<string, unknown>) => iframe?.contentWindow?.postMessage({ biggle: 1, ...m }, '*');
      if (msg.type === 'call') answerCall(site, msg, reply);
      if (msg.type === 'local') saveLocal(site, msg.entries);
      if (msg.type === 'navigate' && typeof msg.url === 'string') {
        const u = parse(msg.url);
        if (u?.kind === 'site' && u.name === site) onnavigate(u.path.slice(1) || 'index.bhtml');
      }
    };
    window.addEventListener('message', onmessage);
    return () => window.removeEventListener('message', onmessage);
  });
</script>

<div class="preview">
  {#if error}
    <p class="error">{error}</p>
  {:else if srcdoc}
    {#key srcdoc}
      <iframe
        bind:this={iframe}
        {srcdoc}
        title="Preview of {site}.biggle"
        sandbox="allow-scripts allow-forms allow-modals"
        referrerpolicy="no-referrer"
      ></iframe>
    {/key}
  {/if}
</div>

<style>
  .preview {
    position: relative;
    height: 100%;
    background: #fff;
  }
  iframe {
    display: block;
    width: 100%;
    height: 100%;
    border: 0;
  }
  .error {
    margin: 0;
    padding: 24px;
    color: #6e6b65;
    font-size: 14px;
  }
</style>
