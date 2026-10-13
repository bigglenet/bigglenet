<script lang="ts">
  import { i18n, plural, t } from '../lib/i18n.svelte';
  import { account } from '../lib/account.svelte';
  import { api, errorText } from '../lib/api';
  import { browser, type Tab } from '../lib/browser.svelte';
  import { sites } from '../lib/sites.svelte';
  import { siteHost } from '../lib/url';
  import AdminDashboard from './AdminDashboard.svelte';
  import Icon from './Icon.svelte';

  let { tab }: { tab: Tab } = $props();

  type Name = { name: string; status: string };
  type Review = { name: string; tld: 'biggle' | 'b'; title: string | null; owner: string | null; files: number; size: number; createdAt: number };
  type User = { username: string; admin: boolean; trusted: boolean; created_at: number };

  async function setTrusted(u: User, trusted: boolean) {
    await run(() => api('PATCH', `/api/admin/users/${encodeURIComponent(u.username)}`, { trusted }));
  }

  let names = $state<Name[]>([]);
  let reviews = $state<Review[]>([]);
  let rejecting = $state<string | null>(null);
  let note = $state('');
  let users = $state<User[]>([]);
  let error = $state('');


  const isAdmin = $derived(!!account.user?.admin);

  async function refresh() {
    error = '';
    try {
      const [n, u, r] = await Promise.all([
        api<{ names: Name[] }>('GET', '/api/admin/names'),
        api<{ users: User[] }>('GET', '/api/admin/users'),
        api<{ sites: Review[] }>('GET', '/api/admin/reviews'),
      ]);
      names = n.names;
      users = u.users;
      reviews = r.sites;
      sites.reviews = r.sites.length;
    } catch (e) {
      error = errorText(e);
    }
  }

  $effect(() => {
    void sites.reviewsChanged;
    if (isAdmin) refresh();
  });

  async function approve(name: string) {
    await run(() => api('POST', `/api/admin/sites/${encodeURIComponent(name)}/approve`));
  }

  async function reject(name: string) {
    await run(() => api('POST', `/api/admin/sites/${encodeURIComponent(name)}/reject`, { note }));
    rejecting = null;
    note = '';
  }

  async function run(fn: () => Promise<unknown>) {
    error = '';
    try {
      await fn();
      await refresh();
    } catch (e) {
      error = errorText(e);
    }
  }

  const date = (s: number) => new Date(s * 1000).toLocaleDateString(i18n.locale, { dateStyle: 'medium' });
</script>

<div class="admin">
  <div class="inner">
    <h1>{t('Admin')}</h1>

    {#if !isAdmin}
      <p class="muted">{t('This page is only for Bigglenet admins.')}</p>
    {:else}
      {#if error}
        <p class="error" role="alert">{error}</p>
      {/if}

      <AdminDashboard {tab} />

      <section>
        <h2>{t('Waiting for approval')}</h2>
        <p class="muted">{t('New sites made in the site editor. Nobody else can see them until you approve.')}</p>
        <ul class="list">
          {#each reviews as r (r.name)}
            <li class="review">
              <div class="main">
                <strong>{siteHost(r.name, r.tld)}</strong>
                <span class="muted small">
                  {r.title ? `${r.title} · ` : ''}{t('by {account}', { account: r.owner ?? t('a deleted account') })} · {plural(r.files, '{n} file', '{n} files')} · {Math.ceil(r.size / 1024)} KB
                </span>
              </div>
              {#if rejecting === r.name}
                <input class="note" bind:value={note} placeholder={t("Why? (they'll see this)")} aria-label={t("Why? (they'll see this)")} maxlength="300" />
                <button class="danger" onclick={() => reject(r.name)}>{t('Reject')}</button>
                <button class="ghost" onclick={() => (rejecting = null)}>{t('Cancel')}</button>
              {:else}
                <button class="ghost" onclick={() => browser.openPreview(r.name, '/', r.tld)}>{t('Preview')}</button>
                <button class="ghost" onclick={() => ((rejecting = r.name), (note = ''))}>{t('Reject')}</button>
                <button class="primary" onclick={() => approve(r.name)}>{t('Approve')}</button>
              {/if}
            </li>
          {:else}
            <li class="muted">{t('Nothing waiting. Nice.')}</li>
          {/each}
        </ul>
      </section>

      <button class="all-sites" onclick={() => browser.go(tab, 'biggle://admin/pages')}>
        <span>
          <strong>{t('All sites')}</strong>
          <span class="muted small">
            {plural(names.length, '{n} site', '{n} sites')}{reviews.length ? `, ${t('{n} waiting', { n: reviews.length })}` : ''}. {t('Open, approve, take down, rename, delete, link sites hosted elsewhere, and see or edit their source.')}
          </span>
        </span>
        <Icon name="forward" />
      </button>

      <section>
        <h2>{t('People')}</h2>
        <p class="muted">
          {plural(users.length, '{n} person has a Biggle ID.', '{n} people have a Biggle ID.')} {t('Admins and people you trust can give their sites a short .b address.')}
        </p>
        <ul class="list">
          {#each users as u (u.username)}
            <li>
              <strong class="main">{u.username}</strong>
              {#if u.admin}<span class="tag">{t('Admin')}</span>{:else if u.trusted}<span class="tag">{t('Trusted')}</span>{/if}
              <span class="muted small">{t('Joined {created_at}', { created_at: date(u.created_at) })}</span>
              {#if !u.admin}
                <button class="trust" onclick={() => setTrusted(u, !u.trusted)}>{u.trusted ? t('Stop trusting') : 'Trust'}</button>
              {/if}
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  </div>
</div>

<style>
  .trust {
    margin-left: auto;
    padding: 4px 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--card);
    color: var(--text);
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
  }
  .admin {
    height: 100%;
    overflow: auto;
    background: var(--surface);
  }
  .inner {
    max-width: 760px;
    margin: 0 auto;
    padding: 40px 20px 64px;
  }
  h1 {
    margin: 0 0 24px;
    font-size: 28px;
    letter-spacing: -0.02em;
  }
  section {
    margin-bottom: 36px;
  }
  h2 {
    margin: 0 0 4px;
    font-size: 17px;
  }
  .muted {
    color: var(--muted);
  }
  .small {
    font-size: 13px;
  }
  .error {
    color: var(--danger);
  }
  p {
    margin: 0 0 14px;
  }

  .all-sites {
    width: 100%;
    height: auto;
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 36px;
    padding: 16px 18px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--card);
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .all-sites:hover {
    border-color: var(--accent);
  }
  .all-sites > span {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  input {
    height: 36px;
    width: 100%;
    padding: 0 10px;
    border: 1px solid var(--border);
    border-radius: 9px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 14px;
    font-weight: 400;
  }
  input:focus {
    outline: 0;
    border-color: var(--accent);
  }
  .list {
    margin: 0;
    padding: 0;
    list-style: none;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--card);
    overflow: hidden;
  }
  .list li {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 52px;
    padding: 8px 10px 8px 16px;
    border-top: 1px solid var(--border);
  }
  .list li:first-child {
    border-top: 0;
  }
  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow-wrap: anywhere;
  }
  .tag {
    padding: 2px 8px;
    border-radius: 10px;
    background: var(--accent-soft);
    font-size: 12px;
    font-weight: 600;
  }

  button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 34px;
    padding: 0 14px;
    border: 1px solid var(--border);
    border-radius: 9px;
    background: var(--card);
    color: var(--text);
    font: inherit;
    font-size: 13.5px;
    font-weight: 600;
    white-space: nowrap;
  }
  .primary {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--on-accent);
  }
  .ghost {
    border-color: transparent;
    background: none;
  }
  .ghost:hover {
    background: var(--hover);
  }
  .danger {
    border-color: var(--danger);
    background: var(--danger);
    color: #fff;
  }
  .review {
    flex-wrap: wrap;
  }
  .note {
    flex: 1 1 200px;
    width: auto;
  }
</style>
