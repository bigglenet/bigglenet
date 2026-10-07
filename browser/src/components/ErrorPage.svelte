<script lang="ts">
  import { browser, type Tab } from '../lib/browser.svelte';
  import type { PageError } from '../lib/loader';
  import { parse } from '../lib/url';
  import Icon from './Icon.svelte';

  let { tab, error }: { tab: Tab; error: PageError } = $props();

  const u = $derived(parse(tab.url));
  const host = $derived(u?.kind === 'site' ? `${u.name}.biggle` : tab.url);
  const path = $derived(u?.kind === 'site' ? u.path : '');

  const text = $derived.by((): { title: string; body: string } => {
    switch (error.code) {
      case 'bad_address':
        return {
          title: "That's not a Biggle address",
          body: 'Biggle addresses look like hello.biggle or biggle://hello.biggle/about.bhtml.',
        };
      case 'server_unreachable':
        return {
          title: "Can't reach the Bigglenet",
          body: "The Biggle server isn't responding. Check your connection and try again.",
        };
      case 'no_such_name':
        return {
          title: `${host} doesn't exist`,
          body: 'Nobody has this name yet. Names are handed out by the Bigglenet admin.',
        };
      case 'host_unreachable':
        return {
          title: `${host} isn't responding`,
          body: "The site's host couldn't be reached. It might be down for a moment.",
        };
      case 'bad_redirect':
        return {
          title: `${host} tried to send you off the Bigglenet`,
          body: 'The site redirected to an address outside itself, so Biggle stopped.',
        };
      case 'not_found':
        return { title: 'Page not found', body: `${host} doesn't have ${path}.` };
      case 'not_bhtml':
        return {
          title: "This isn't a BHTML page",
          body:
            error.detail === 'html'
              ? 'This is a normal web page. Biggle only opens pages that start with <!bhtml 1>.'
              : 'Biggle only opens pages that start with <!bhtml 1>.',
        };
      case 'bhtml_version':
        return {
          title: 'This page needs a newer Biggle',
          body: `It's written in BHTML ${error.detail}, and this browser understands BHTML 1.`,
        };
      case 'unsupported':
        return { title: "Biggle can't show this file", body: `It's a ${error.detail} file.` };
      default:
        return {
          title: 'Something went wrong',
          body: `${host} answered with an error (HTTP ${error.status ?? '?'}).`,
        };
    }
  });
</script>

<div class="error">
  <div class="inner">
    <div class="icon"><Icon name="alert" size={28} /></div>
    <h1>{text.title}</h1>
    <p>{text.body}</p>
    {#if error.code !== 'bad_address'}
      <button onclick={() => browser.reload(tab)}>Try again</button>
    {/if}
  </div>
</div>

<style>
  .error {
    height: 100%;
    overflow: auto;
    background: var(--surface);
  }
  .inner {
    max-width: 520px;
    margin: 0 auto;
    padding: 16vh 24px 48px;
  }
  .icon {
    display: grid;
    place-items: center;
    width: 56px;
    height: 56px;
    border-radius: 16px;
    background: var(--accent-soft);
    color: var(--accent);
    margin-bottom: 20px;
  }
  h1 {
    margin: 0 0 8px;
    font-size: 24px;
    letter-spacing: -0.02em;
    overflow-wrap: anywhere;
  }
  p {
    margin: 0 0 24px;
    color: var(--muted);
    line-height: 1.55;
  }
  button {
    padding: 9px 18px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-weight: 500;
  }
  button:hover {
    border-color: var(--accent);
  }
</style>
