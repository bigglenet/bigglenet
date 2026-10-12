<script lang="ts">
  // The bell in the toolbar: everything that's happened, newest first.
  import { browser } from '../lib/browser.svelte';
  import { i18n, t } from '../lib/i18n.svelte';
  import { describe, notifications, type Notification } from '../lib/notifications.svelte';
  import { overlays } from '../lib/overlays.svelte';
  import Icon from './Icon.svelte';

  let open = $state(false);
  let root = $state<HTMLElement>();
  let loadingMore = $state(false);

  $effect(() => {
    if (!open) return;
    const release = overlays.hold();
    const onpointerdown = (e: PointerEvent) => {
      if (!root?.contains(e.target as Node)) open = false;
    };
    const onkeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') open = false;
    };
    document.addEventListener('pointerdown', onpointerdown);
    document.addEventListener('keydown', onkeydown);
    return () => {
      release();
      document.removeEventListener('pointerdown', onpointerdown);
      document.removeEventListener('keydown', onkeydown);
    };
  });

  function choose(n: Notification) {
    const { href } = describe(n);
    if (!n.read) notifications.markRead([n.id]);
    open = false;
    if (href) {
      const tab = browser.active;
      if (tab) browser.go(tab, href);
      else browser.newTab(href);
    }
  }

  async function more() {
    loadingMore = true;
    await notifications.loadMore().catch(() => {});
    loadingMore = false;
  }

  function ago(at: number): string {
    const s = Math.max(0, (Date.now() - at) / 1000);
    if (s < 60) return t('just now');
    if (s < 3600) return t('{n} min ago', { n: Math.floor(s / 60) });
    if (s < 86400) return t('{n} h ago', { n: Math.floor(s / 3600) });
    return new Date(at).toLocaleDateString(i18n.locale, { day: 'numeric', month: 'short' });
  }
</script>

<div class="bell" bind:this={root}>
  <button
    class="toggle"
    class:on={open}
    aria-label={notifications.unread ? t('Notifications, {n} new', { n: notifications.unread }) : t('Notifications')}
    title={t('Notifications')}
    aria-expanded={open}
    onclick={() => (open = !open)}
  >
    <Icon name="bell" />
    {#if notifications.unread}
      <span class="count">{notifications.unread > 9 ? '9+' : notifications.unread}</span>
    {/if}
  </button>
  {#if open}
    <div class="panel" role="dialog" aria-label={t('Notifications')}>
      <header>
        <strong>{t('Notifications')}</strong>
        {#if notifications.unread}
          <button class="link" onclick={() => notifications.markRead()}>{t('Mark all as read')}</button>
        {/if}
      </header>
      {#if notifications.list.length === 0}
        <p class="empty">{notifications.loaded ? t('Nothing yet. When someone signs your guestbook or accepts your friend request, it shows up here.') : t('Loading…')}</p>
      {:else}
        <ul>
          {#each notifications.list as n (n.id)}
            {@const d = describe(n)}
            <li>
              <button class="item" class:unread={!n.read} onclick={() => choose(n)}>
                <span class="icon"><Icon name={d.icon} size={15} /></span>
                <span class="text">
                  <span class="what">{d.text}</span>
                  <span class="when">{ago(n.at)}</span>
                </span>
                {#if !n.read}<span class="dot" aria-label={t('New')}></span>{/if}
              </button>
            </li>
          {/each}
        </ul>
        {#if notifications.more}
          <button class="more" disabled={loadingMore} onclick={more}>{loadingMore ? t('Loading…') : t('Show older')}</button>
        {/if}
      {/if}
    </div>
  {/if}
</div>

<style>
  .bell {
    position: relative;
  }
  .toggle {
    position: relative;
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border: 0;
    border-radius: 8px;
    background: none;
    color: var(--text);
  }
  .toggle:hover,
  .toggle.on {
    background: var(--hover);
  }
  .count {
    position: absolute;
    top: 2px;
    right: 1px;
    min-width: 17px;
    height: 17px;
    padding: 0 4px;
    border-radius: 9px;
    background: var(--danger);
    color: #fff;
    font-size: 10.5px;
    font-weight: 700;
    line-height: 17px;
    box-shadow: 0 0 0 2px var(--toolbar);
  }
  .panel {
    position: absolute;
    top: calc(100% + 8px);
    right: -40px;
    z-index: 40;
    width: min(380px, calc(100vw - 16px));
    max-height: min(520px, calc(100vh - 90px));
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--card);
    box-shadow: 0 18px 44px -18px rgb(0 0 0 / 0.45);
    overflow: hidden;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    border-bottom: 1px solid var(--border);
  }
  .link {
    border: 0;
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 13px;
  }
  .link:hover {
    color: var(--text);
    text-decoration: underline;
  }
  ul {
    margin: 0;
    padding: 4px;
    list-style: none;
    overflow: auto;
  }
  .item {
    width: 100%;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px;
    border: 0;
    border-radius: 10px;
    background: none;
    color: var(--text);
    font: inherit;
    text-align: left;
  }
  .item:hover {
    background: var(--hover);
  }
  .icon {
    flex: none;
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: var(--accent-soft);
  }
  .text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .what {
    font-size: 13.5px;
    line-height: 1.35;
    overflow-wrap: anywhere;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .unread .what {
    font-weight: 600;
  }
  .when {
    color: var(--muted);
    font-size: 12px;
  }
  .dot {
    flex: none;
    width: 8px;
    height: 8px;
    margin-top: 6px;
    border-radius: 50%;
    background: var(--danger);
  }
  .empty {
    margin: 0;
    padding: 24px 18px;
    color: var(--muted);
    font-size: 13.5px;
    text-align: center;
  }
  .more {
    margin: 4px 10px 10px;
    padding: 8px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: none;
    color: var(--text);
    font: inherit;
    font-size: 13px;
  }
</style>
