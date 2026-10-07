<script lang="ts">
  import { account } from '../lib/account.svelte';
  import { api, errorText } from '../lib/api';
  import { browser } from '../lib/browser.svelte';
  import { sites } from '../lib/sites.svelte';
  import Icon from './Icon.svelte';

  type Name = { name: string; url: string | null; title: string | null; status: string; owner: string | null };
  type Review = { name: string; title: string | null; owner: string | null; files: number; size: number; createdAt: number };
  type User = { username: string; admin: boolean; created_at: number };

  let names = $state<Name[]>([]);
  let reviews = $state<Review[]>([]);
  let rejecting = $state<string | null>(null);
  let note = $state('');
  let users = $state<User[]>([]);
  let error = $state('');

  let form = $state({ name: '', url: '', title: '' });
  let saving = $state(false);
  let formError = $state('');

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

  async function saveName(e: SubmitEvent) {
    e.preventDefault();
    saving = true;
    formError = '';
    try {
      const name = form.name.trim().toLowerCase().replace(/\.biggle$/, '');
      await api('PUT', `/api/admin/names/${encodeURIComponent(name)}`, { url: form.url, title: form.title });
      form = { name: '', url: '', title: '' };
      await refresh();
    } catch (err) {
      formError = errorText(err);
    } finally {
      saving = false;
    }
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

  const date = (s: number) => new Date(s * 1000).toLocaleDateString([], { dateStyle: 'medium' });
</script>

<div class="admin">
  <div class="inner">
    <h1>Admin</h1>

    {#if !isAdmin}
      <p class="muted">This page is only for Bigglenet admins.</p>
    {:else}
      {#if error}
        <p class="error" role="alert">{error}</p>
      {/if}

      <section>
        <h2>Waiting for approval</h2>
        <p class="muted">New sites made in the site editor. Nobody else can see them until you approve.</p>
        <ul class="list">
          {#each reviews as r (r.name)}
            <li class="review">
              <div class="main">
                <strong>{r.name}.biggle</strong>
                <span class="muted small">
                  {r.title ? `${r.title} · ` : ''}by {r.owner ?? 'a deleted account'} · {r.files} files · {Math.ceil(r.size / 1024)} KB
                </span>
              </div>
              {#if rejecting === r.name}
                <input class="note" bind:value={note} placeholder="Why? (they'll see this)" maxlength="300" />
                <button class="danger" onclick={() => reject(r.name)}>Reject</button>
                <button class="ghost" onclick={() => (rejecting = null)}>Cancel</button>
              {:else}
                <button class="ghost" onclick={() => browser.openPreview(r.name)}>Preview</button>
                <button class="ghost" onclick={() => ((rejecting = r.name), (note = ''))}>Reject</button>
                <button class="primary" onclick={() => approve(r.name)}>Approve</button>
              {/if}
            </li>
          {:else}
            <li class="muted">Nothing waiting. Nice.</li>
          {/each}
        </ul>
      </section>

      <section>
        <h2>Sites</h2>
        <p class="muted">Every .biggle name. You can also point one at a site hosted somewhere else.</p>
        <form class="name-form" onsubmit={saveName}>
          <label class="field">
            <span>Name</span>
            <span class="suffixed">
              <input bind:value={form.name} placeholder="ethem" required autocapitalize="off" spellcheck="false" />
              <span class="suffix">.biggle</span>
            </span>
          </label>
          <label class="field grow">
            <span>Host URL</span>
            <input bind:value={form.url} placeholder="https://ethem.pages.dev/" required type="url" />
          </label>
          <label class="field">
            <span>Title</span>
            <input bind:value={form.title} placeholder="Optional" />
          </label>
          <button class="primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </form>
        {#if formError}
          <p class="error" role="alert">{formError}</p>
        {/if}
        <ul class="list">
          {#each names as n (n.name)}
            <li>
              <div class="main">
                <strong>{n.name}.biggle</strong>
                <span class="muted small">
                  {n.title ? `${n.title} · ` : ''}{n.url ?? `made in the editor by ${n.owner ?? 'a deleted account'}`}{n.status !== 'live' ? ` · ${n.status === 'pending' ? 'waiting for approval' : 'not approved'}` : ''}
                </span>
              </div>
              {#if n.url}
                <button class="ghost" onclick={() => (form = { name: n.name, url: n.url ?? '', title: n.title ?? '' })}>Edit</button>
              {/if}
              <button
                class="ghost icon"
                aria-label="Delete {n.name}.biggle"
                onclick={() => run(() => api('DELETE', `/api/admin/names/${n.name}`))}
              >
                <Icon name="trash" size={16} />
              </button>
            </li>
          {:else}
            <li class="muted">No sites yet.</li>
          {/each}
        </ul>
      </section>

      <section>
        <h2>People</h2>
        <p class="muted">{users.length} {users.length === 1 ? 'person has' : 'people have'} a Biggle ID.</p>
        <ul class="list">
          {#each users as u (u.username)}
            <li>
              <strong class="main">{u.username}</strong>
              {#if u.admin}<span class="tag">Admin</span>{/if}
              <span class="muted small">Joined {date(u.created_at)}</span>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  </div>
</div>

<style>
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

  .name-form {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 10px;
    padding: 14px;
    margin-bottom: 12px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--card);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 12.5px;
    font-weight: 600;
    min-width: 140px;
  }
  .field.grow {
    flex: 1;
    min-width: 200px;
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
  .suffixed {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .suffix {
    color: var(--muted);
    font-weight: 400;
    font-size: 14px;
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
  .icon {
    width: 34px;
    padding: 0;
    justify-content: center;
  }
</style>
