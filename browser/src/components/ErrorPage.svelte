<script lang="ts">
  import { t } from '../lib/i18n.svelte';
  import { browser, type Tab } from '../lib/browser.svelte';
  import type { PageError } from '../lib/loader';
  import { parse, siteHost } from '../lib/url';
  import Icon from './Icon.svelte';

  let { tab, error }: { tab: Tab; error: PageError } = $props();

  const u = $derived(parse(tab.url));
  const host = $derived(u?.kind === 'site' ? siteHost(u.name, u.tld) : tab.url);
  const path = $derived(u?.kind === 'site' ? u.path : '');

  const text = $derived.by((): { title: string; body: string } => {
    switch (error.code) {
      case 'bad_address':
        return {
          title: t("That's not a Biggle address"),
          body: t('Biggle addresses look like hello.biggle or biggle://hello.biggle/about.bhtml.'),
        };
      case 'server_unreachable':
        return {
          title: t("Can't reach the Bigglenet"),
          body: t("The Biggle server isn't responding. Check your connection and try again."),
        };
      case 'no_such_name':
        return {
          title: t("{host} doesn't exist", { host }),
          body: t('Nobody has this name yet. Names are handed out by the Bigglenet admin.'),
        };
      case 'host_unreachable':
        return {
          title: t("{host} isn't responding", { host }),
          body: t("The site's host couldn't be reached. It might be down for a moment."),
        };
      case 'bad_redirect':
        return {
          title: t('{host} tried to send you off the Bigglenet', { host }),
          body: t('The site redirected to an address outside itself, so Biggle stopped.'),
        };
      case 'not_found':
        return { title: t('Page not found'), body: t("{host} doesn't have {path}.", { host, path }) };
      case 'not_bhtml':
        return {
          title: t("This isn't a BHTML page"),
          body:
            error.detail === 'html'
              ? t('This is a normal web page. Biggle only opens pages that start with <!bhtml 1>.')
              : t('Biggle only opens pages that start with <!bhtml 1>.'),
        };
      case 'bhtml_version':
        return {
          title: t('This page needs a newer Biggle'),
          body: t("It's written in BHTML {detail}, and this browser understands BHTML 1.", { detail: error.detail }),
        };
      case 'unsupported':
        return { title: t("Biggle can't show this file"), body: t("It's a {kind} file.", { kind: error.detail }) };
      default:
        return {
          title: t('Something went wrong'),
          body: t('{host} answered with an error (HTTP {status}).', { host, status: error.status ?? '?' }),
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
      <button onclick={() => browser.reload(tab)}>{t('Try again')}</button>
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
