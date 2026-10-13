<script lang="ts">
  // biggle://nox/following: the sites you follow. A dot means it changed since you last visited.
  import { browser, type Tab } from '../../lib/browser.svelte';
  import { ago } from '../../lib/community';
  import { follows } from '../../lib/follows.svelte';
  import { t } from '../../lib/i18n.svelte';
  import { siteHome, siteHost } from '../../lib/url';
  import Icon from '../Icon.svelte';
  import Page from '../community/Page.svelte';

  let { tab }: { tab: Tab } = $props();

  $effect(() => {
    follows.refresh();
  });
</script>

<Page>
  <button class="back" onclick={() => browser.go(tab, 'biggle://nox')}><Icon name="back" size={16} /> Nox</button>
  <header class="top"><h1>{t('Following')}</h1></header>
  <p class="muted intro">{t('Sites you follow. A dot means it changed since you last looked, and changes show in your feed.')}</p>
  {#if !follows.loaded}
    <p class="muted">{t('Loading…')}</p>
  {:else if !follows.list.length}
    <div class="card empty">{t('You don’t follow any sites yet. Use “Follow this site” in a site’s ⋯ menu.')}</div>
  {:else}
    <ul class="list">
      {#each follows.list as f (f.site)}
        <li class="row nowrap">
          <button class="item grow" onclick={() => browser.go(tab, siteHome(f.site, f.tld))}>
            <span class="emoji-tile">{f.site[0].toUpperCase()}</span>
            <span class="text">
              <span class="name">{siteHost(f.site, f.tld)}</span>
              <span class="sub">{f.title ? `${f.title} · ` : ''}{t('changed {when}', { when: ago(f.updated * 1000) })}</span>
            </span>
            {#if f.changed}<span class="dot" title={t('Changed since you looked')}></span>{/if}
          </button>
          <button class="ghost unfollow" onclick={() => follows.toggle(f.site, (s) => browser.say(s))}>{t('Unfollow')}</button>
        </li>
      {/each}
    </ul>
  {/if}
</Page>

<style>
  .intro {
    margin-bottom: 16px;
  }
  .nowrap {
    flex-wrap: nowrap;
    padding-right: 10px;
  }
  .dot {
    flex: none;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--danger);
  }
  .unfollow {
    height: 30px;
    padding: 0 12px;
    font-size: 13px;
  }
</style>
