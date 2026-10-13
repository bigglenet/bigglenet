<script lang="ts">
  // biggle://status: whether the Bigglenet is up, which versions are running, and how fast the
  // server is answering (server/src/moderation.ts status).
  import { SERVER } from '../lib/config';
  import { i18n, t } from '../lib/i18n.svelte';
  import { desktop } from '../lib/platform';
  import { social } from '../lib/social.svelte';
  import { updates } from '../lib/updates.svelte';
  import Icon from './Icon.svelte';
  import Page from './community/Page.svelte';

  type Check = { at: number; ok: boolean; ms: number | null; version: string | null; database: number | null };
  let checks = $state<Check[]>([]);
  let checking = $state(false);
  let online = $state(navigator.onLine);

  async function check() {
    checking = true;
    const started = performance.now();
    let result: Check;
    try {
      const res = await fetch(`${SERVER}/api/status`, { cache: 'no-store', credentials: 'omit' });
      const body = (await res.json()) as { ok: boolean; version: string; database: number | null };
      result = { at: Date.now(), ok: res.ok && body.ok, ms: Math.round(performance.now() - started), version: body.version, database: body.database };
    } catch {
      result = { at: Date.now(), ok: false, ms: null, version: null, database: null };
    }
    checks = [...checks, result].slice(-20);
    checking = false;
  }

  $effect(() => {
    check();
    const timer = setInterval(check, 30_000);
    const up = () => (online = navigator.onLine);
    addEventListener('online', up);
    addEventListener('offline', up);
    return () => {
      clearInterval(timer);
      removeEventListener('online', up);
      removeEventListener('offline', up);
    };
  });

  const last = $derived(checks.at(-1) ?? null);
  const slowest = $derived(Math.max(100, ...checks.map((c) => c.ms ?? 0)));
  let engine = $state<{ electron: string; chromium: string } | null>(null);
  $effect(() => {
    desktop?.info().then((i) => (engine = i));
  });
  const health = $derived(!online ? 'offline' : !last ? 'checking' : last.ok ? 'up' : 'down');
</script>

<Page>
  <header class="top"><h1>{t('Status')}</h1></header>

  <div class="card big {health}">
    <Icon name={health === 'up' ? 'check' : health === 'checking' ? 'clock' : 'alert'} size={22} />
    <div class="grow">
      <strong>
        {health === 'up' ? t('The Bigglenet is up') : health === 'down' ? t('The Bigglenet isn’t answering') : health === 'offline' ? t('You’re offline') : t('Checking…')}
      </strong>
      {#if last?.ms != null}<p class="muted small">{t('Answered in {ms} ms', { ms: last.ms })}{last.database != null ? ` · ${t('database {ms} ms', { ms: last.database })}` : ''}</p>{/if}
    </div>
    <button class="ghost" disabled={checking} onclick={check}>{t('Check again')}</button>
  </div>

  {#if checks.length > 1}
    <h2>{t('Response times')}</h2>
    <svg class="chart" viewBox="0 0 200 50" preserveAspectRatio="none" role="img" aria-label={t('How long the last checks took')}>
      {#each checks as c, i (c.at)}
        <rect x={i * 10 + 1} y={c.ms == null ? 0 : 50 - (c.ms / slowest) * 48} width="8" height={c.ms == null ? 50 : Math.max(1, (c.ms / slowest) * 48)} class:bad={!c.ok}>
          <title>{new Date(c.at).toLocaleTimeString(i18n.locale)}: {c.ms == null ? t('no answer') : `${c.ms} ms`}</title>
        </rect>
      {/each}
    </svg>
  {/if}

  <h2>{t('Versions')}</h2>
  <ul class="list">
    <li class="item"><span class="grow">{t('The server')}</span><strong>{last?.version ?? '—'}</strong></li>
    <li class="item"><span class="grow">{t('This browser')}</span><strong>{updates.current}</strong></li>
    {#if engine}<li class="item"><span class="grow">Electron · Chromium</span><strong>{engine.electron} · {engine.chromium}</strong></li>{/if}
    <li class="item"><span class="grow">{t('Live connection (messages, calls)')}</span><strong>{social.connected ? t('Connected') : t('Not connected')}</strong></li>
  </ul>
</Page>

<style>
  .big {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .big.up {
    border-color: color-mix(in srgb, var(--online) 50%, var(--border));
    color: var(--online);
  }
  .big.down,
  .big.offline {
    border-color: var(--danger);
    color: var(--danger);
  }
  .big strong {
    color: var(--text);
    font-size: 17px;
  }
  .chart {
    width: 100%;
    height: 70px;
  }
  .chart rect {
    fill: var(--accent);
  }
  .chart rect.bad {
    fill: var(--danger);
  }
</style>
