<script lang="ts">
  // Settings → Sites: every site you've set something for: zoom, dark mode, a copy for offline,
  // and (desktop app) what sites straight from the internet may use.
  import { i18n, t } from '../lib/i18n.svelte';
  import { offline } from '../lib/offline.svelte';
  import { desktop } from '../lib/platform';
  import { siteSettings } from '../lib/sitesettings.svelte';
  import { siteHost } from '../lib/url';
  import { zoom } from '../lib/zoom.svelte';

  let { focus = '' }: { focus?: string } = $props();

  let permissions = $state<Record<string, Record<string, boolean>>>({});
  $effect(() => {
    desktop?.sites.permissions().then((p) => (permissions = p));
  });

  const NAMES: Record<string, string> = {
    media: 'Camera and microphone',
    geolocation: 'Location',
    notifications: 'Notifications',
    midi: 'MIDI devices',
    midiSysex: 'MIDI devices',
  };

  /** Every .biggle site with a setting: zoom (by key), dark mode, or an offline copy. */
  const sites = $derived.by(() => {
    const keys = new Set<string>();
    for (const k of Object.keys(zoom.levels)) if (!k.startsWith('biggle://')) keys.add(k);
    for (const k of Object.keys(siteSettings.sites)) keys.add(k);
    for (const k of Object.keys(offline.saved)) keys.add(k);
    return [...keys].sort();
  });

  function resetZoom(site: string) {
    delete zoom.levels[site];
    try {
      localStorage.setItem('biggle:zoom', JSON.stringify(zoom.levels));
    } catch {}
  }

  async function forget(origin: string) {
    await desktop?.sites.forgetPermissions(origin);
    const { [origin]: _, ...rest } = permissions;
    permissions = rest;
  }
</script>

<label class="choice">
  <input type="checkbox" checked={siteSettings.darkAll} onchange={(e) => siteSettings.setDarkAll(e.currentTarget.checked)} />
  <span>
    <strong>{t('Dark mode for every site')}</strong><br />
    <span class="muted">{t('Turns pages dark, even ones that don’t have a dark look. You can still change each site.')}</span>
  </span>
</label>

{#if sites.length}
  <ul class="list">
    {#each sites as site (site)}
      <li class:focus={focus === site}>
        <strong>{siteHost(site)}</strong>
        <span class="settings">
          {#if zoom.levels[site]}
            <span class="pill">{t('Zoom {n}%', { n: Math.round(zoom.levels[site] * 100) })} <button onclick={() => resetZoom(site)} aria-label={t('Reset')}>×</button></span>
          {/if}
          {#if siteSettings.sites[site]?.dark !== undefined}
            <span class="pill">{siteSettings.sites[site].dark ? t('Dark') : t('Not dark')} <button onclick={() => siteSettings.forget(site)} aria-label={t('Reset')}>×</button></span>
          {/if}
          {#if offline.saved[site]}
            <span class="pill">
              {t('Offline copy from {date}', { date: new Date(offline.saved[site].at).toLocaleDateString(i18n.locale) })}
              <button onclick={() => offline.remove(site)} aria-label={t('Remove')}>×</button>
            </span>
          {/if}
        </span>
      </li>
    {/each}
  </ul>
{/if}

{#if desktop && Object.keys(permissions).length}
  <h3>{t('What sites straight from the internet may use')}</h3>
  <ul class="list">
    {#each Object.entries(permissions) as [origin, perms] (origin)}
      <li>
        <strong>{new URL(origin).host}</strong>
        <span class="settings">
          {#each Object.entries(perms) as [what, allowed] (what)}
            <span class="pill" class:no={!allowed}>{t(NAMES[what] ?? what)}: {allowed ? t('allowed') : t('blocked')}</span>
          {/each}
          <button class="link" onclick={() => forget(origin)}>{t('Forget')}</button>
        </span>
      </li>
    {/each}
  </ul>
{/if}

{#if !sites.length && !Object.keys(permissions).length}
  <p class="muted small">{t('Nothing set for any site yet. The shield in the address bar has each site’s settings.')}</p>
{/if}

<style>
  .choice {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 6px 0 12px;
    font-size: 14.5px;
    line-height: 1.4;
    cursor: pointer;
  }
  .choice input {
    margin-top: 3px;
  }
  .muted {
    color: var(--muted);
    font-size: 13px;
  }
  .small {
    margin: 4px 0 0;
  }
  h3 {
    margin: 14px 0 8px;
    font-size: 14px;
  }
  .list {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .list li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 0;
    border-top: 1px solid var(--border);
    font-size: 14px;
  }
  .list li.focus {
    background: var(--accent-soft);
  }
  .settings {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 4px 2px 9px;
    border-radius: 999px;
    background: var(--hover);
    font-size: 12.5px;
  }
  .pill.no {
    color: var(--danger);
  }
  .pill button {
    width: 18px;
    height: 18px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: none;
    color: var(--muted);
    font: inherit;
    cursor: pointer;
  }
  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 12.5px;
    text-decoration: underline;
    cursor: pointer;
  }
</style>
