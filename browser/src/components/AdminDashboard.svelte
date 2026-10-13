<script lang="ts">
  // The top of biggle://admin: how the Bigglenet is doing, reports to look at, the announcement
  // banner, and backups (server/src/moderation.ts, backups.ts).
  import { api, errorText } from '../lib/api';
  import { browser, type Tab } from '../lib/browser.svelte';
  import { SERVER } from '../lib/config';
  import { account } from '../lib/account.svelte';
  import { announcements } from '../lib/announcement.svelte';
  import { i18n, plural, t } from '../lib/i18n.svelte';
  import { siteHome, siteHost } from '../lib/url';

  let { tab }: { tab: Tab } = $props();

  type Dashboard = {
    today: number;
    signups: { day: number; n: number }[];
    totals: { users: number; online: number; today: number; week: number; sites: number; pending: number; messages: number; threads: number; clubs: number; reports: number };
    busiest: { name: string; tld: 'biggle' | 'b'; title: string | null; visits: number }[];
  };
  type Report = { id: number; kind: string; target: string; summary: string; reason: string | null; reporter: string | null; created_at: number };
  type Backup = { id: number; size: number | null; status: string; error: string | null; restorable: number; created_at: number };

  let dash = $state<Dashboard | null>(null);
  let reports = $state<Report[]>([]);
  let announcement = $state<{ id: number; text: string; level: string } | null>(null);
  let text = $state('');
  let level = $state<'info' | 'warning'>('info');
  let hours = $state(0);
  let backups = $state<{ configured: boolean; backups: Backup[] } | null>(null);
  let restoring = $state<number | null>(null);
  let undo = $state<string | null>(null);
  let error = $state('');
  let busy = $state(false);

  async function load() {
    try {
      const [d, r, a, b] = await Promise.all([
        api<Dashboard>('GET', '/api/admin/dashboard'),
        api<{ reports: Report[] }>('GET', '/api/admin/reports'),
        api<{ announcement: typeof announcement }>('GET', '/api/announcement'),
        api<{ configured: boolean; backups: Backup[] }>('GET', '/api/admin/backups'),
      ]);
      dash = d;
      reports = r.reports;
      announcement = a.announcement;
      backups = b;
    } catch (e) {
      error = errorText(e);
    }
  }

  $effect(() => {
    load();
  });

  async function act(fn: () => Promise<unknown>) {
    if (busy) return;
    busy = true;
    error = '';
    try {
      await fn();
      await load();
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  }

  const handle = (r: Report, action: 'dismiss' | 'remove') => act(() => api('POST', `/api/admin/reports/${r.id}`, { action }));
  const announce = (e: SubmitEvent) => {
    e.preventDefault();
    act(async () => {
      await api('POST', '/api/admin/announcements', { text, level, hours });
      text = '';
      announcements.check();
    });
  };
  const endAnnouncement = () => act(async () => (await api('DELETE', '/api/admin/announcements'), announcements.check()));
  const backupNow = () => act(async () => (await api('POST', '/api/admin/backups'), browser.say(t('Backing up. It takes a minute or two.'))));
  const restore = (b: Backup) =>
    act(async () => {
      const r = await api<{ undo: string | null }>('POST', `/api/admin/backups/${b.id}/restore`);
      restoring = null;
      undo = r.undo;
      browser.say(t('The database is back to {when}.', { when: when(b.created_at) }));
    });
  const undoRestore = () => act(async () => (await api('POST', '/api/admin/restore', { bookmark: undo }), (undo = null)));

  async function download(b: Backup) {
    const res = await fetch(`${SERVER}/api/admin/backups/${b.id}/download`, { headers: { Authorization: `Bearer ${account.token}` } });
    if (!res.ok) return void (error = t('Couldn’t download that backup.'));
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = `bigglenet-backup-${b.id}.sql`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  const when = (s: number) => new Date(s * 1000).toLocaleString(i18n.locale, { dateStyle: 'medium', timeStyle: 'short' });
  const mb = (n: number | null) => (n == null ? '' : n < 1024 * 1024 ? `${Math.ceil(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
  const days = $derived.by(() => {
    if (!dash) return [];
    const byDay = new Map(dash.signups.map((s) => [s.day, s.n]));
    return Array.from({ length: 30 }, (_, i) => ({ day: dash!.today - 29 + i, n: byDay.get(dash!.today - 29 + i) ?? 0 }));
  });
  const peak = $derived(Math.max(1, ...days.map((d) => d.n)));
</script>

{#if error}<p class="error" role="alert">{error}</p>{/if}

{#if dash}
  {@const n = dash.totals}
  <section>
    <h2>{t('How it’s going')}</h2>
    <div class="numbers">
      <div><strong>{n.users}</strong><span>{t('people')}</span></div>
      <div><strong>{n.online}</strong><span>{t('online now')}</span></div>
      <div><strong>{n.today}</strong><span>{t('active today')}</span></div>
      <div><strong>{n.week}</strong><span>{t('active this week')}</span></div>
      <div><strong>{n.sites}</strong><span>{t('live sites')}</span></div>
      <div><strong>{n.messages}</strong><span>{t('messages today')}</span></div>
    </div>
    <h3>{t('Sign-ups, last 30 days')}</h3>
    <svg class="chart" viewBox="0 0 300 60" preserveAspectRatio="none" role="img" aria-label={t('Sign-ups each day')}>
      {#each days as d, i (d.day)}
        <rect x={i * 10 + 1} y={60 - (d.n / peak) * 56} width="8" height={Math.max(d.n ? 2 : 0.5, (d.n / peak) * 56)} class:empty={!d.n}>
          <title>{new Date(d.day * 86_400_000).toLocaleDateString(i18n.locale)}: {plural(d.n, '{n} sign-up', '{n} sign-ups')}</title>
        </rect>
      {/each}
    </svg>
    {#if dash.busiest.length}
      <h3>{t('Busiest sites this week')}</h3>
      <ol class="busy">
        {#each dash.busiest as s (s.name)}
          <li><button class="link" onclick={() => browser.newTab(siteHome(s.name, s.tld), { after: tab.id })}>{siteHost(s.name, s.tld)}</button> <span class="muted small">{plural(s.visits, '{n} visit', '{n} visits')}</span></li>
        {/each}
      </ol>
    {/if}
  </section>
{/if}

<section id="reports">
  <h2>{t('Reports')} {#if reports.length}<span class="count">{reports.length}</span>{/if}</h2>
  {#if !reports.length}
    <p class="muted">{t('Nothing reported. All quiet.')}</p>
  {:else}
    <ul class="reports">
      {#each reports as r (r.id)}
        <li>
          <p><strong>{r.summary}</strong></p>
          <p class="muted small">
            {t('{kind}, reported by {who}', { kind: r.kind, who: r.reporter ?? t('someone') })} · {when(r.created_at)}{r.reason ? ` · “${r.reason}”` : ''}
          </p>
          <div class="buttons">
            {#if r.kind === 'site'}<button class="ghost" onclick={() => browser.newTab(siteHome(r.target), { after: tab.id })}>{t('Look')}</button>{/if}
            {#if r.kind === 'user'}<button class="ghost" onclick={() => browser.newTab(`biggle://u/${r.target}`, { after: tab.id })}>{t('Look')}</button>{/if}
            {#if r.kind !== 'user'}<button class="danger" disabled={busy} onclick={() => handle(r, 'remove')}>{r.kind === 'site' ? t('Take the site down') : t('Remove it')}</button>{/if}
            <button class="ghost" disabled={busy} onclick={() => handle(r, 'dismiss')}>{t('It’s fine')}</button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<section id="announcement">
  <h2>{t('Announcement')}</h2>
  {#if announcement}
    <div class="current" class:warning={announcement.level === 'warning'}>
      <span>{announcement.text}</span>
      <button class="ghost" disabled={busy} onclick={endAnnouncement}>{t('Take it down')}</button>
    </div>
  {:else}
    <p class="muted">{t('A banner everyone sees under the address bar, like “Maintenance at 8pm”.')}</p>
  {/if}
  <form class="announce" onsubmit={announce}>
    <input bind:value={text} maxlength="300" placeholder={t('What should everyone know?')} aria-label={t('Announcement')} />
    <select bind:value={level} aria-label={t('Kind')}>
      <option value="info">{t('News')}</option>
      <option value="warning">{t('Warning')}</option>
    </select>
    <select bind:value={hours} aria-label={t('For how long')}>
      <option value={0}>{t('Until I take it down')}</option>
      <option value={1}>{t('1 hour')}</option>
      <option value={6}>{t('6 hours')}</option>
      <option value={24}>{t('A day')}</option>
      <option value={168}>{t('A week')}</option>
    </select>
    <button class="primary" disabled={busy || !text.trim()}>{announcement ? t('Replace it') : t('Put it up')}</button>
  </form>
</section>

<section id="backups">
  <h2>{t('Backups')}</h2>
  {#if backups && !backups.configured}
    <p class="muted">{t('Not set up yet. Nightly backups need a Cloudflare API token (CF_API_TOKEN, with D1 edit) and CF_ACCOUNT_ID as secrets, and R2 storage.')}</p>
  {:else if backups}
    <p class="muted">{t('Every night at 03:00 UTC, kept for two weeks. Restoring puts the whole database back to that moment (up to 7 days back).')}</p>
    {#if undo}
      <div class="current warning">
        <span>{t('Restored. Changed your mind?')}</span>
        <button class="ghost" disabled={busy} onclick={undoRestore}>{t('Undo the restore')}</button>
      </div>
    {/if}
    <button class="ghost" disabled={busy} onclick={backupNow}>{t('Back up now')}</button>
    <ul class="backups">
      {#each backups.backups as b (b.id)}
        <li>
          <span class="grow">{when(b.created_at)} <span class="muted small">{b.status === 'done' ? mb(b.size) : b.status === 'running' ? t('running…') : t('failed: {why}', { why: b.error ?? '' })}</span></span>
          {#if b.status === 'done'}
            <button class="link" onclick={() => download(b)}>{t('Download')}</button>
            {#if b.restorable}
              {#if restoring === b.id}
                <button class="danger" disabled={busy} onclick={() => restore(b)}>{t('Restore everything to then')}</button>
                <button class="link" onclick={() => (restoring = null)}>{t('Cancel')}</button>
              {:else}
                <button class="link" onclick={() => (restoring = b.id)}>{t('Restore…')}</button>
              {/if}
            {/if}
          {/if}
        </li>
      {:else}
        <li class="muted">{t('No backups yet.')}</li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  section {
    margin-bottom: 18px;
    padding: 20px;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--card);
  }
  h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 12px;
    font-size: 17px;
  }
  h3 {
    margin: 16px 0 6px;
    font-size: 14px;
  }
  p {
    margin: 0;
  }
  .muted {
    color: var(--muted);
  }
  .small {
    font-size: 12.5px;
  }
  .error {
    margin: 0 0 12px;
    color: var(--danger);
  }
  .count {
    padding: 1px 8px;
    border-radius: 999px;
    background: var(--danger);
    color: #fff;
    font-size: 12px;
  }
  .numbers {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
    gap: 8px;
  }
  .numbers div {
    display: flex;
    flex-direction: column;
    padding: 10px;
    border-radius: 12px;
    background: var(--surface);
  }
  .numbers strong {
    font-size: 20px;
  }
  .numbers span {
    color: var(--muted);
    font-size: 12px;
  }
  .chart {
    width: 100%;
    height: 70px;
  }
  .chart rect {
    fill: var(--accent);
  }
  .chart rect.empty {
    fill: var(--border);
  }
  .busy {
    margin: 0;
    padding-left: 20px;
    font-size: 14px;
  }
  .reports,
  .backups {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 10px 0 0;
    padding: 0;
    list-style: none;
  }
  .reports li {
    padding: 12px;
    border-radius: 12px;
    background: var(--surface);
  }
  .backups li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    font-size: 14px;
  }
  .grow {
    flex: 1;
  }
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 8px;
  }
  .current {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 12px;
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--accent-soft);
    font-size: 14px;
  }
  .current.warning {
    background: color-mix(in srgb, #f08c00 24%, transparent);
  }
  .announce {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .announce input {
    flex: 1 1 240px;
  }
  input,
  select {
    height: 36px;
    padding: 0 10px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 14px;
  }
  button {
    font: inherit;
    cursor: pointer;
  }
  .primary,
  .ghost,
  .danger {
    height: 34px;
    padding: 0 14px;
    border-radius: 10px;
    font-size: 13.5px;
    font-weight: 600;
  }
  .primary {
    border: 0;
    background: var(--accent);
    color: var(--on-accent);
  }
  .ghost {
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--text);
  }
  .danger {
    border: 1px solid var(--danger);
    background: var(--danger);
    color: #fff;
  }
  button:disabled {
    opacity: 0.5;
  }
  .link {
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    text-decoration: underline;
  }
</style>
