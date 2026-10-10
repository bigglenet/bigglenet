<script lang="ts">
  // biggle://requests: ask for features and vote for the ones you want most. Admins set a status
  // and can reply.
  import { account } from '../lib/account.svelte';
  import { api, errorText } from '../lib/api';
  import Icon from './Icon.svelte';

  type Status = 'open' | 'planned' | 'done' | 'declined';
  type Request = {
    id: number;
    title: string;
    details: string | null;
    status: Status;
    reply: string | null;
    createdAt: number;
    author: string | null;
    mine: boolean;
    votes: number;
    voted: boolean;
  };

  const STATUS: Record<Status, string> = { open: 'Open', planned: 'Planned', done: 'Done', declined: 'Not planned' };
  const isAdmin = $derived(!!account.user?.admin);

  let requests = $state<Request[]>([]);
  let loaded = $state(false);
  let error = $state('');
  let sort = $state<'top' | 'new'>('top');
  let filter = $state<Status | 'all'>('all');

  let title = $state('');
  let details = $state('');
  let sending = $state(false);
  let formError = $state('');

  // An admin answering a request.
  let answering = $state<{ id: number; status: Status; reply: string } | null>(null);

  async function refresh() {
    try {
      requests = (await api<{ requests: Request[] }>('GET', '/api/requests')).requests;
      error = '';
    } catch (e) {
      error = errorText(e);
    } finally {
      loaded = true;
    }
  }
  $effect(() => {
    if (account.user) refresh();
  });

  const replace = (r: Request) => (requests = requests.map((x) => (x.id === r.id ? r : x)));

  const shown = $derived(
    requests
      .filter((r) => filter === 'all' || r.status === filter)
      .sort((a, b) => (sort === 'new' ? b.createdAt - a.createdAt : b.votes - a.votes || b.createdAt - a.createdAt)),
  );
  const count = (s: Status | 'all') => (s === 'all' ? requests.length : requests.filter((r) => r.status === s).length);
  const date = (s: number) => new Date(s * 1000).toLocaleDateString([], { dateStyle: 'medium' });

  async function send(e: SubmitEvent) {
    e.preventDefault();
    sending = true;
    formError = '';
    try {
      const { request } = await api<{ request: Request }>('POST', '/api/requests', { title, details });
      requests = [request, ...requests];
      title = details = '';
      sort = 'new';
      filter = 'all';
    } catch (err) {
      formError = errorText(err);
    } finally {
      sending = false;
    }
  }

  async function toggleVote(r: Request) {
    // Show it straight away; the server's count follows.
    replace({ ...r, voted: !r.voted, votes: r.votes + (r.voted ? -1 : 1) });
    try {
      replace((await api<{ request: Request }>(r.voted ? 'DELETE' : 'POST', `/api/requests/${r.id}/vote`)).request);
    } catch (e) {
      replace(r);
      error = errorText(e);
    }
  }

  async function answer() {
    if (!answering) return;
    try {
      const { request } = await api<{ request: Request }>('PATCH', `/api/requests/${answering.id}`, {
        status: answering.status,
        reply: answering.reply,
      });
      replace(request);
      answering = null;
    } catch (e) {
      error = errorText(e);
    }
  }

  async function remove(r: Request) {
    if (!confirm(`Delete "${r.title}"?`)) return;
    try {
      await api('DELETE', `/api/requests/${r.id}`);
      requests = requests.filter((x) => x.id !== r.id);
    } catch (e) {
      error = errorText(e);
    }
  }
</script>

<div class="requests">
  <div class="inner">
    <h1>Feature requests</h1>
    <p class="muted">Ask for something you'd like the Bigglenet to do, and vote for the ideas you want most.</p>

    <form class="ask" onsubmit={send}>
      <input bind:value={title} placeholder="What would you like?" maxlength="120" required aria-label="Your idea" />
      <textarea bind:value={details} placeholder="More details (optional)" maxlength="2000" rows="3" aria-label="More details"></textarea>
      {#if formError}<p class="error" role="alert">{formError}</p>{/if}
      <div class="ask-actions">
        <button class="primary" disabled={sending || title.trim().length < 3}>{sending ? 'Sending…' : 'Send request'}</button>
      </div>
    </form>

    <div class="bar">
      <div class="filters" role="radiogroup" aria-label="Show">
        {#each [['all', 'All'], ['open', 'Open'], ['planned', 'Planned'], ['done', 'Done'], ['declined', 'Not planned']] as [id, label] (id)}
          <button role="radio" aria-checked={filter === id} class:on={filter === id} onclick={() => (filter = id as Status | 'all')}>
            {label} <span class="count">{count(id as Status | 'all')}</span>
          </button>
        {/each}
      </div>
      <div class="sort" role="radiogroup" aria-label="Order">
        <button role="radio" aria-checked={sort === 'top'} class:on={sort === 'top'} onclick={() => (sort = 'top')}>Top</button>
        <button role="radio" aria-checked={sort === 'new'} class:on={sort === 'new'} onclick={() => (sort = 'new')}>New</button>
      </div>
    </div>

    {#if error}<p class="error" role="alert">{error}</p>{/if}

    <ul class="list">
      {#each shown as r (r.id)}
        <li>
          <button
            class="vote"
            class:voted={r.voted}
            aria-pressed={r.voted}
            aria-label={r.voted ? `Take back your vote for "${r.title}"` : `Vote for "${r.title}"`}
            onclick={() => toggleVote(r)}
          >
            <Icon name="up" size={18} />
            <span>{r.votes}</span>
          </button>
          <div class="body">
            <div class="head">
              <strong>{r.title}</strong>
              {#if r.status !== 'open'}<span class="pill {r.status}">{STATUS[r.status]}</span>{/if}
            </div>
            {#if r.details}<p class="details">{r.details}</p>{/if}
            {#if r.reply}<p class="reply"><span>Reply:</span> {r.reply}</p>{/if}
            <div class="meta">
              <span>by {r.author ?? 'a deleted account'} · {date(r.createdAt)}</span>
              {#if isAdmin}
                <button class="link" onclick={() => (answering = { id: r.id, status: r.status, reply: r.reply ?? '' })}>Answer</button>
              {/if}
              {#if r.mine || isAdmin}
                <button class="link" onclick={() => remove(r)}>Delete</button>
              {/if}
            </div>
            {#if answering?.id === r.id}
              <form
                class="answer"
                onsubmit={(e) => {
                  e.preventDefault();
                  answer();
                }}
              >
                <select bind:value={answering.status} aria-label="Status">
                  {#each Object.entries(STATUS) as [id, label] (id)}
                    <option value={id}>{label}</option>
                  {/each}
                </select>
                <input bind:value={answering.reply} placeholder="Reply (optional, everyone sees it)" maxlength="1000" aria-label="Reply" />
                <button class="primary">Save</button>
                <button type="button" class="ghost" onclick={() => (answering = null)}>Cancel</button>
              </form>
            {/if}
          </div>
        </li>
      {:else}
        <li class="empty muted">{loaded ? (requests.length ? 'Nothing here.' : 'No requests yet. Be the first!') : 'Loading…'}</li>
      {/each}
    </ul>
  </div>
</div>

<style>
  .requests {
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
    margin: 0 0 6px;
    font-size: 28px;
    letter-spacing: -0.02em;
  }
  p {
    margin: 0;
  }
  .muted {
    color: var(--muted);
  }
  .error {
    margin-top: 10px;
    color: var(--danger);
    font-size: 14px;
  }
  button {
    font: inherit;
    cursor: pointer;
  }
  input,
  textarea,
  select {
    padding: 9px 11px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--card);
    color: var(--text);
    font: inherit;
    font-size: 14.5px;
  }
  input:focus,
  textarea:focus,
  select:focus {
    outline: 0;
    border-color: var(--accent);
  }
  textarea {
    resize: vertical;
  }
  .primary,
  .ghost {
    height: 36px;
    padding: 0 14px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
  }
  .primary {
    border: 0;
    background: var(--accent);
    color: var(--on-accent);
  }
  .primary:disabled {
    opacity: 0.5;
  }
  .ghost {
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--text);
  }

  .ask {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 20px;
    padding: 14px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--card);
  }
  .ask input,
  .ask textarea {
    background: var(--surface);
  }
  .ask-actions {
    display: flex;
    justify-content: flex-end;
  }

  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin: 26px 0 6px;
  }
  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .filters button {
    padding: 6px 12px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: none;
    color: var(--muted);
    font-size: 13px;
    font-weight: 600;
  }
  .filters button.on {
    border-color: var(--accent);
    color: var(--text);
  }
  .count {
    opacity: 0.6;
  }
  .sort {
    display: flex;
    gap: 2px;
    padding: 3px;
    border-radius: 10px;
    background: var(--hover);
  }
  .sort button {
    padding: 4px 12px;
    border: 0;
    border-radius: 7px;
    background: none;
    color: var(--muted);
    font-size: 13px;
    font-weight: 600;
  }
  .sort button.on {
    background: var(--card);
    color: var(--text);
  }

  .list {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .list li {
    display: flex;
    gap: 14px;
    padding: 16px 0;
    border-bottom: 1px solid var(--border);
  }
  .list li.empty {
    display: block;
  }
  .vote {
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 48px;
    padding: 6px 0;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--card);
    color: var(--muted);
    font-size: 14px;
    font-weight: 700;
  }
  .vote:hover {
    border-color: var(--accent);
    color: var(--text);
  }
  .vote.voted {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--on-accent);
  }
  .body {
    flex: 1;
    min-width: 0;
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .head strong {
    font-size: 16px;
  }
  .details {
    margin-top: 4px;
    color: var(--text);
    opacity: 0.85;
    font-size: 14.5px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .reply {
    margin-top: 8px;
    padding: 8px 12px;
    border-left: 3px solid var(--accent);
    border-radius: 0 8px 8px 0;
    background: var(--hover);
    font-size: 14px;
  }
  .reply span {
    font-weight: 700;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 6px;
    color: var(--muted);
    font-size: 13px;
  }
  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--muted);
    font-size: 13px;
    text-decoration: underline;
  }
  .link:hover {
    color: var(--text);
  }
  .pill {
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11.5px;
    font-weight: 700;
  }
  .pill.planned {
    background: color-mix(in srgb, #3b82f6 18%, transparent);
    color: #3b82f6;
  }
  .pill.done {
    background: color-mix(in srgb, var(--online) 18%, transparent);
    color: var(--online);
  }
  .pill.declined {
    background: var(--hover);
    color: var(--muted);
  }
  .answer {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
  }
  .answer input {
    flex: 1;
    min-width: 180px;
  }
</style>
