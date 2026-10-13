<script lang="ts">
  // biggle://board.biggle: old-school forums (server/src/board.ts).
  //   /                  the boards
  //   /<board>           its threads, and starting one
  //   /thread/<id>       a thread and its replies
  import { api, errorText } from '../../lib/api';
  import { browser, type Tab } from '../../lib/browser.svelte';
  import { ago } from '../../lib/community';
  import { plural, t } from '../../lib/i18n.svelte';
  import { report } from '../../lib/report.svelte';
  import Avatar from '../Avatar.svelte';
  import Icon from '../Icon.svelte';
  import Linked from './Linked.svelte';
  import Page from './Page.svelte';

  let { tab, path }: { tab: Tab; path: string } = $props();

  type BoardCard = { id: string; name: string; about: string; adminOnly: boolean; threads: number; posts: number; latest: { id: number; title: string; at: number } | null };
  type ThreadRow = { id: number; title: string; author: string | null; replies: number; pinned: boolean; locked: boolean; createdAt: number; lastAt: number; lastBy: string | null };
  type Post = { id: number; author: string | null; avatar: number | null; body: string; deleted: boolean; hidden?: boolean; first: boolean; createdAt: number; editedAt: number | null; mine: boolean; canDelete: boolean };
  type Thread = { id: number; board: string; boardName: string; title: string; author: string | null; replies: number; pinned: boolean; locked: boolean; canReply: boolean; canModerate: boolean; mine: boolean };

  const HOME = 'biggle://board.biggle';
  const view = $derived.by(() => {
    const m = /^thread\/(\d+)$/.exec(path);
    if (m) return { kind: 'thread' as const, id: Number(m[1]) };
    if (path) return { kind: 'board' as const, id: path };
    return { kind: 'home' as const };
  });

  let boards = $state<BoardCard[] | null>(null);
  let list = $state<{ board: { id: string; name: string; about: string; canStart: boolean }; threads: ThreadRow[]; next: number | null } | null>(null);
  let thread = $state<{ thread: Thread; posts: Post[]; more: boolean } | null>(null);
  let error = $state('');
  let busy = $state(false);

  // Writing
  let starting = $state(false);
  let title = $state('');
  let body = $state('');
  let reply = $state('');
  let editingPost = $state<number | null>(null);
  let editText = $state('');

  async function load() {
    error = '';
    try {
      const v = view;
      if (v.kind === 'home') boards = (await api<{ boards: BoardCard[] }>('GET', '/api/board')).boards;
      else if (v.kind === 'board') list = await api('GET', `/api/board/${v.id}`);
      else thread = await api('GET', `/api/board/threads/${v.id}`);
    } catch (e) {
      error = errorText(e);
    }
  }

  $effect(() => {
    void path;
    list = null;
    thread = null;
    starting = false;
    load();
  });

  async function act(fn: () => Promise<unknown>) {
    if (busy) return;
    busy = true;
    error = '';
    try {
      await fn();
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  }

  const start = (e: SubmitEvent) => {
    e.preventDefault();
    if (view.kind !== 'board') return;
    const board = view.id;
    act(async () => {
      const r = await api<{ id: number }>('POST', `/api/board/${board}`, { title, body });
      title = '';
      body = '';
      browser.go(tab, `${HOME}/thread/${r.id}`);
    });
  };

  const send = (e: SubmitEvent) => {
    e.preventDefault();
    if (view.kind !== 'thread' || !reply.trim()) return;
    const id = view.id;
    act(async () => {
      await api('POST', `/api/board/threads/${id}`, { body: reply });
      reply = '';
      await load();
    });
  };

  async function olderThreads() {
    if (!list?.next || view.kind !== 'board') return;
    const r = await api<{ threads: ThreadRow[]; next: number | null }>('GET', `/api/board/${view.id}?before=${list.next}`);
    list = { ...list, threads: [...list.threads, ...r.threads], next: r.next };
  }

  async function laterPosts() {
    if (!thread || view.kind !== 'thread') return;
    const last = thread.posts.at(-1)?.id ?? 0;
    const r = await api<{ posts: Post[]; more: boolean }>('GET', `/api/board/threads/${view.id}?after=${last}`);
    thread = { ...thread, posts: [...thread.posts, ...r.posts], more: r.more };
  }

  const saveEdit = (e: SubmitEvent, p: Post) => {
    e.preventDefault();
    act(async () => {
      await api('PATCH', `/api/board/posts/${p.id}`, { body: editText });
      editingPost = null;
      await load();
    });
  };
  const takeDown = (p: Post) => act(async () => (await api('DELETE', `/api/board/posts/${p.id}`), await load()));
  const moderate = (change: { pinned?: boolean; locked?: boolean }) => act(async () => (await api('PATCH', `/api/board/threads/${thread!.thread.id}`, change), await load()));
  const deleteThread = () =>
    act(async () => {
      const board = thread!.thread.board;
      await api('DELETE', `/api/board/threads/${thread!.thread.id}`);
      browser.go(tab, `${HOME}/${board}`, 'replace');
    });

  const at = (seconds: number) => ago(seconds * 1000);

  // The tab shows what you're reading.
  $effect(() => {
    if (thread) tab.title = thread.thread.title;
    else if (list) tab.title = `${t(list.board.name)} · ${t('The board')}`;
  });
</script>

<Page>
  {#if view.kind === 'home'}
    <header class="top">
      <h1>{t('The board')}</h1>
    </header>
    <p class="muted intro">{t('Old-school forums for everyone on the Bigglenet. Pick a board, start a thread, reply to one.')}</p>
    {#if error}<p class="bad">{error}</p>{/if}
    {#if boards}
      <ul class="list">
        {#each boards as b (b.id)}
          <li>
            <button class="item" onclick={() => browser.go(tab, `${HOME}/${b.id}`)}>
              <Icon name={b.adminOnly ? 'bell' : 'chat'} size={20} />
              <span class="text">
                <span class="name">{t(b.name)}</span>
                <span class="sub">{t(b.about)}</span>
                {#if b.latest}<span class="sub">{t('Latest: {title}', { title: b.latest.title })} · {at(b.latest.at)}</span>{/if}
              </span>
              <span class="count muted small">{plural(b.threads, '{n} thread', '{n} threads')}</span>
            </button>
          </li>
        {/each}
      </ul>
    {:else if !error}
      <p class="muted">{t('Loading…')}</p>
    {/if}
  {:else if view.kind === 'board'}
    <button class="back" onclick={() => browser.go(tab, HOME)}><Icon name="back" size={16} /> {t('The board')}</button>
    {#if list}
      <header class="top">
        <div class="grow">
          <h1>{t(list.board.name)}</h1>
          <p class="muted">{t(list.board.about)}</p>
        </div>
        {#if list.board.canStart}<button class="primary" onclick={() => (starting = !starting)}><Icon name="plus" size={15} /> {t('New thread')}</button>{/if}
      </header>
      {#if starting}
        <form class="card stack new" onsubmit={start}>
          <input bind:value={title} maxlength="100" placeholder={t('Title')} aria-label={t('Title')} required />
          <textarea bind:value={body} rows="6" maxlength="5000" placeholder={t('What do you want to say?')} aria-label={t('Post')} required></textarea>
          <div class="row">
            <button class="primary" disabled={busy || !title.trim() || !body.trim()}>{t('Post thread')}</button>
            <button type="button" class="ghost" onclick={() => (starting = false)}>{t('Cancel')}</button>
          </div>
        </form>
      {/if}
      {#if error}<p class="bad">{error}</p>{/if}
      {#if list.threads.length}
        <ul class="list">
          {#each list.threads as th (th.id)}
            <li>
              <button class="item" onclick={() => browser.go(tab, `${HOME}/thread/${th.id}`)}>
                <span class="text">
                  <span class="name">
                    {#if th.pinned}<span class="pill">{t('Pinned')}</span>{/if}
                    {#if th.locked}<span class="pill">{t('Locked')}</span>{/if}
                    {th.title}
                  </span>
                  <span class="sub">
                    {t('by {who}', { who: th.author ?? t('someone') })} · {plural(th.replies, '{n} reply', '{n} replies')}
                    {th.replies && th.lastBy ? ` · ${t('last from {who}', { who: th.lastBy })}` : ''} · {at(th.lastAt)}
                  </span>
                </span>
              </button>
            </li>
          {/each}
        </ul>
        {#if list.next}<p class="more"><button class="ghost" onclick={olderThreads}>{t('Show older')}</button></p>{/if}
      {:else}
        <div class="card empty">{t('No threads yet. Start the first one!')}</div>
      {/if}
    {:else if error}
      <p class="bad">{error}</p>
    {:else}
      <p class="muted">{t('Loading…')}</p>
    {/if}
  {:else}
    {#if thread}
      {@const th = thread.thread}
      <button class="back" onclick={() => browser.go(tab, `${HOME}/${th.board}`)}><Icon name="back" size={16} /> {t(th.boardName)}</button>
      <header class="top">
        <h1>{th.title}</h1>
      </header>
      <p class="row muted small meta">
        {#if th.pinned}<span class="pill">{t('Pinned')}</span>{/if}
        {#if th.locked}<span class="pill">{t('Locked')}</span>{/if}
        {plural(th.replies, '{n} reply', '{n} replies')}
        {#if th.canModerate}
          · <button class="link" onclick={() => moderate({ pinned: !th.pinned })}>{th.pinned ? t('Unpin') : t('Pin')}</button>
          · <button class="link" onclick={() => moderate({ locked: !th.locked })}>{th.locked ? t('Unlock') : t('Lock')}</button>
        {/if}
        {#if th.canModerate || (th.mine && th.replies === 0)}
          · <button class="link" onclick={deleteThread}>{t('Delete thread')}</button>
        {/if}
      </p>
      {#if error}<p class="bad">{error}</p>{/if}
      <ol class="posts">
        {#each thread.posts as p (p.id)}
          <li class="card post" class:first={p.first}>
            <div class="row head">
              {#if p.author}
                <button class="who" onclick={() => browser.go(tab, `biggle://u/${p.author}`)}>
                  <Avatar name={p.author} user={p.author} size={28} />
                  <span class="name">{p.author}</span>
                </button>
              {:else}
                <span class="muted">{t('Someone who left')}</span>
              {/if}
              <span class="muted small grow">{at(p.createdAt)}{p.editedAt ? ` · ${t('edited')}` : ''}</span>
              {#if p.mine && !p.deleted && editingPost !== p.id}
                <button class="link small" onclick={() => ((editingPost = p.id), (editText = p.body))}>{t('Edit')}</button>
              {/if}
              {#if p.canDelete}<button class="link small" onclick={() => takeDown(p)}>{t('Take down')}</button>{/if}
              {#if !p.mine && !p.deleted && p.author}<button class="link small" onclick={() => report.open('post', p.id, t('a post by {who}', { who: p.author ?? '' }))}>{t('Report')}</button>{/if}
            </div>
            {#if p.deleted}
              <p class="muted">{t('This post was taken down.')}</p>
            {:else if p.hidden}
              <p class="muted">{t('Hidden: you blocked this person.')}</p>
            {:else if editingPost === p.id}
              <form class="stack" onsubmit={(e) => saveEdit(e, p)}>
                <textarea bind:value={editText} rows="5" maxlength="5000" aria-label={t('Post')}></textarea>
                <div class="row">
                  <button class="primary" disabled={busy || !editText.trim()}>{t('Save')}</button>
                  <button type="button" class="ghost" onclick={() => (editingPost = null)}>{t('Cancel')}</button>
                </div>
              </form>
            {:else}
              <p><Linked text={p.body} /></p>
            {/if}
          </li>
        {/each}
      </ol>
      {#if thread.more}<p class="more"><button class="ghost" onclick={laterPosts}>{t('Show more replies')}</button></p>{/if}
      {#if th.canReply}
        <form class="card stack reply" onsubmit={send}>
          <textarea bind:value={reply} rows="4" maxlength="5000" placeholder={t('Write a reply')} aria-label={t('Reply')}></textarea>
          <div class="row"><button class="primary" disabled={busy || !reply.trim()}>{t('Post reply')}</button></div>
        </form>
      {:else}
        <p class="muted small">{t('This thread is locked, so nobody can reply.')}</p>
      {/if}
    {:else if error}
      <button class="back" onclick={() => browser.go(tab, HOME)}><Icon name="back" size={16} /> {t('The board')}</button>
      <p class="bad">{error}</p>
    {:else}
      <p class="muted">{t('Loading…')}</p>
    {/if}
  {/if}
</Page>

<style>
  .intro {
    margin-bottom: 16px;
  }
  .count {
    white-space: nowrap;
  }
  .new,
  .reply {
    margin: 16px 0;
  }
  .more {
    margin-top: 14px;
    text-align: center;
  }
  .meta {
    margin: -8px 0 16px;
  }
  .posts {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .post.first {
    border-color: var(--accent);
  }
  .head {
    margin-bottom: 8px;
  }
  .who {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--text);
    font: inherit;
    cursor: pointer;
  }
  .name {
    font-weight: 600;
  }
</style>
