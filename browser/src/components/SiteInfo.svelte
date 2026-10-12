<script lang="ts">
  // The shield in the address bar: about this site, and its settings. Zoom, dark mode, a copy for
  // offline, what it may use (camera, location…, for sites straight from the internet), and
  // clearing what it keeps in this browser.
  import { browser, type Tab } from '../lib/browser.svelte';
  import { t } from '../lib/i18n.svelte';
  import { offline } from '../lib/offline.svelte';
  import { overlays } from '../lib/overlays.svelte';
  import { desktop } from '../lib/platform';
  import { siteSettings } from '../lib/sitesettings.svelte';
  import { clearSiteData, siteDataSize } from '../lib/storage';
  import { parse, siteHost, siteKey } from '../lib/url';
  import { zoom } from '../lib/zoom.svelte';
  import { saveForOffline } from '../lib/actions.svelte';
  import Icon from './Icon.svelte';

  let { tab, onclose }: { tab: Tab; onclose: () => void } = $props();

  let root = $state<HTMLElement>();
  let cleared = $state(false);
  let permissions = $state<Record<string, boolean>>({});

  const u = $derived(parse(tab.url));
  const key = $derived(u?.kind === 'site' ? siteKey(u) : null);
  const direct = $derived(tab.view.type === 'web' ? tab.view.url : null);
  const origin = $derived.by(() => {
    try {
      return direct ? new URL(direct).origin : null;
    } catch {
      return null;
    }
  });
  const z = $derived(zoom.of(tab.url));

  $effect(() => {
    const release = overlays.hold();
    const onpointerdown = (e: PointerEvent) => {
      if (!root?.contains(e.target as Node) && !(e.target as Element).closest('.badge')) onclose();
    };
    const onkeydown = (e: KeyboardEvent) => e.key === 'Escape' && onclose();
    document.addEventListener('pointerdown', onpointerdown);
    document.addEventListener('keydown', onkeydown);
    return () => {
      release();
      document.removeEventListener('pointerdown', onpointerdown);
      document.removeEventListener('keydown', onkeydown);
    };
  });

  $effect(() => {
    const o = origin;
    if (o && desktop) desktop.sites.permissions().then((all) => (permissions = all[o] ?? {}));
  });

  const NAMES: Record<string, string> = {
    media: 'Camera and microphone',
    geolocation: 'Location',
    notifications: 'Notifications',
    midi: 'MIDI devices',
    midiSysex: 'MIDI devices',
  };

  async function clear() {
    if (key) clearSiteData(key);
    if (direct && desktop) await desktop.sites.clearData(direct);
    cleared = true;
  }

  async function forget() {
    if (origin && desktop) await desktop.sites.forgetPermissions(origin);
    permissions = {};
  }
</script>

<div class="info" bind:this={root} role="dialog" aria-label={t('About this site')}>
  <header>
    <strong>{u?.kind === 'site' ? siteHost(u.name, u.tld) : t('A Bigglenet page')}</strong>
    {#if direct}<span class="muted">{t('Straight from {host}', { host: new URL(direct).host })}</span>{/if}
  </header>
  <p class="line"><Icon name="shield" size={14} /> {direct ? t('Ads and trackers are blocked.') : t('No ads or trackers: Bigglenet sites can’t load them.')}</p>
  {#if tab.private}
    <p class="line private"><Icon name="incognito" size={14} /> {t('Private tab: no history, and what sites keep goes when you close Bigglenet.')}</p>
  {/if}

  <div class="row">
    <span>{t('Zoom')}</span>
    <span class="zoom">
      <button aria-label={t('Zoom out')} onclick={() => zoom.step(tab.url, -1)}>−</button>
      <button class="value" onclick={() => zoom.reset(tab.url)} title={t('Back to 100%')}>{Math.round(z * 100)}%</button>
      <button aria-label={t('Zoom in')} onclick={() => zoom.step(tab.url, 1)}>+</button>
    </span>
  </div>

  {#if key}
    <label class="row">
      <span>{t('Dark mode')}</span>
      <input type="checkbox" checked={siteSettings.dark(key)} onchange={(e) => siteSettings.setDark(key!, e.currentTarget.checked)} />
    </label>
    {#if !direct}
      <div class="row">
        <span>{offline.has(key) ? t('Saved for offline') : t('Offline copy')}</span>
        {#if offline.has(key)}
          <button class="link" onclick={() => offline.remove(key!)}>{t('Remove')}</button>
        {:else}
          <button class="link" onclick={() => (onclose(), saveForOffline(tab))}>{t('Save')}</button>
        {/if}
      </div>
    {/if}
  {/if}

  {#if direct && Object.keys(permissions).length}
    <div class="perms">
      <span class="muted small">{t('This site may')}</span>
      {#each Object.entries(permissions) as [what, allowed] (what)}
        <div class="row">
          <span>{t(NAMES[what] ?? what)}</span>
          <span class={allowed ? 'yes' : 'no'}>{allowed ? t('Allowed') : t('Blocked')}</span>
        </div>
      {/each}
      <button class="link" onclick={forget}>{t('Ask again next time')}</button>
    </div>
  {/if}

  <footer>
    {#if key || direct}
      <button class="ghost" onclick={clear} disabled={cleared || (!direct && !!key && siteDataSize(key) === 0)}>
        {cleared ? t('Cleared') : t('Clear this site’s data')}
      </button>
    {/if}
    <button class="link" onclick={() => (onclose(), browser.newTab('biggle://settings/sites', { after: tab.id }))}>{t('All site settings')}</button>
  </footer>
</div>

<style>
  .info {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    z-index: 46;
    width: 320px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--card);
    box-shadow: 0 16px 40px -16px rgb(0 0 0 / 0.45);
    font-size: 13.5px;
  }
  header {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  header strong {
    font-size: 15px;
    overflow-wrap: anywhere;
  }
  .muted {
    color: var(--muted);
    font-size: 12.5px;
  }
  .small {
    font-size: 12px;
  }
  .line {
    display: flex;
    align-items: flex-start;
    gap: 7px;
    margin: 0;
    color: var(--muted);
    line-height: 1.4;
  }
  .line.private {
    color: var(--private);
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .zoom {
    display: flex;
    gap: 2px;
  }
  .zoom button {
    min-width: 30px;
    height: 28px;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-weight: 600;
  }
  .zoom .value {
    min-width: 56px;
  }
  .perms {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 8px;
    border-top: 1px solid var(--border);
  }
  .yes {
    color: var(--online);
    font-weight: 600;
  }
  .no {
    color: var(--danger);
    font-weight: 600;
  }
  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
  }
  .ghost {
    height: 30px;
    padding: 0 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
  }
  .link {
    align-self: flex-start;
    padding: 0;
    border: 0;
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 12.5px;
    text-decoration: underline;
  }
</style>
