<script lang="ts">
  import { account } from '../lib/account.svelte';
  import { api, errorText } from '../lib/api';
  import Icon from './Icon.svelte';

  type Name = { name: string; url: string; title: string | null };
  type Invite = { code: string; created_at: number; used_at: number | null; used_by: string | null };
  type User = { username: string; admin: boolean; created_at: number };

  let names = $state<Name[]>([]);
  let invites = $state<Invite[]>([]);
  let users = $state<User[]>([]);
  let error = $state('');

  let form = $state({ name: '', url: '', title: '' });
  let saving = $state(false);
  let formError = $state('');
  let copied = $state<string | null>(null);

  const isAdmin = $derived(!!account.user?.admin);

  async function refresh() {
    error = '';
    try {
      const [n, i, u] = await Promise.all([
        api<{ names: Name[] }>('GET', '/api/admin/names'),
        api<{ invites: Invite[] }>('GET', '/api/admin/invites'),
        api<{ users: User[] }>('GET', '/api/admin/users'),
      ]);
      names = n.names;
      invites = i.invites;
      users = u.users;
    } catch (e) {
      error = errorText(e);
    }
  }

  $effect(() => {
    if (isAdmin) refresh();
  });

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

  const pretty = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(pretty(code));
      copied = code;
      setTimeout(() => copied === code && (copied = null), 1500);
    } catch {}
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
        <h2>Sites</h2>
        <p class="muted">Point a .biggle name at the folder where someone's site files live.</p>
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
                <span class="muted small">{n.title ? `${n.title} · ` : ''}{n.url}</span>
              </div>
              <button class="ghost" onclick={() => (form = { name: n.name, url: n.url, title: n.title ?? '' })}>Edit</button>
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
        <div class="section-head">
          <h2>Invite codes</h2>
          <button class="primary" onclick={() => run(() => api('POST', '/api/admin/invites'))}>New invite code</button>
        </div>
        <p class="muted">Each code lets one person create a Biggle account.</p>
        <ul class="list">
          {#each invites as i (i.code)}
            <li>
              <code class:used={i.used_at}>{pretty(i.code)}</code>
              <span class="main muted small">
                {i.used_at ? `Used by ${i.used_by ?? 'a deleted account'} on ${date(i.used_at)}` : `Made ${date(i.created_at)}`}
              </span>
              {#if !i.used_at}
                <button class="ghost" onclick={() => copy(i.code)}>
                  <Icon name={copied === i.code ? 'check' : 'copy'} size={15} />
                  {copied === i.code ? 'Copied' : 'Copy'}
                </button>
                <button
                  class="ghost icon"
                  aria-label="Delete invite {pretty(i.code)}"
                  onclick={() => run(() => api('DELETE', `/api/admin/invites/${i.code}`))}
                >
                  <Icon name="trash" size={16} />
                </button>
              {/if}
            </li>
          {:else}
            <li class="muted">No invite codes yet.</li>
          {/each}
        </ul>
      </section>

      <section>
        <h2>People</h2>
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
  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
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
  code {
    font: 600 14px/1 ui-monospace, Menlo, monospace;
    letter-spacing: 0.06em;
  }
  code.used {
    color: var(--muted);
    text-decoration: line-through;
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
  .icon {
    width: 34px;
    padding: 0;
    justify-content: center;
  }
</style>
