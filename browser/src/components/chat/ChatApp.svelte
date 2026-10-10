<script lang="ts">
  // chat.biggle: chats with friends and groups, with voice and video calls. The chat sidebar is
  // the same app, narrower.
  import './chat.css';
  import { untrack } from 'svelte';
  import { errorText } from '../../lib/api';
  import { browser, type Tab } from '../../lib/browser.svelte';
  import { chats } from '../../lib/chats.svelte';
  import { social } from '../../lib/social.svelte';
  import Icon from '../Icon.svelte';
  import ChatConversation from './ChatConversation.svelte';
  import ChatFriends from './ChatFriends.svelte';
  import ChatInfo from './ChatInfo.svelte';
  import ChatList from './ChatList.svelte';
  import ChatPeoplePicker from './ChatPeoplePicker.svelte';

  let { sidebar = false, tab, path = '' }: { sidebar?: boolean; tab?: Tab; path?: string } = $props();

  let selected = $state<number | null>(null);
  let panel = $state<'friends' | 'group' | null>(null);
  let info = $state(false);
  let width = $state(1000);
  let error = $state('');

  const narrow = $derived(sidebar || width < 720);
  const chat = $derived(chats.get(selected));
  // A tab only counts as looking at a chat while it's the tab you're on.
  const active = $derived(sidebar ? social.open : browser.activeId === tab?.id);

  // In a tab, the address picks the chat (biggle://chat.biggle/12), and follows it.
  $effect(() => {
    const id = Number(path) || null;
    untrack(() => pick(id));
  });
  $effect(() => {
    if (!tab) return;
    const url = `biggle://chat.biggle/${selected ?? ''}`;
    untrack(() => {
      if (tab.url === url) return;
      tab.url = url;
      tab.history[tab.index] = url;
    });
  });
  $effect(() => {
    if (tab) tab.title = chats.unread ? `Chat (${chats.unread})` : 'Chat';
  });

  // Something asked the sidebar to show a chat (an incoming call, say).
  $effect(() => {
    const focus = chats.focus;
    if (sidebar && focus) untrack(() => pick(focus.id));
  });

  // The sidebar's way back, for the phone's back button.
  $effect(() => {
    if (!sidebar) return;
    chats.back = back;
    return () => {
      if (chats.back === back) chats.back = null;
    };
  });

  function pick(id: number | null) {
    selected = id;
    panel = null;
    info = false;
    error = '';
  }

  /** Go back a step. Returns false when there's nowhere to go. */
  function back(): boolean {
    if (info && narrow) info = false;
    else if (panel) panel = null;
    else if (selected !== null && narrow) selected = null;
    else return false;
    return true;
  }

  async function openFriend(username: string) {
    error = '';
    try {
      pick(await chats.openWith(username));
    } catch (e) {
      error = errorText(e);
    }
  }

  function openInTab() {
    const url = `biggle://chat.biggle/${selected ?? ''}`;
    const existing = browser.tabs.find((t) => t.view.type === 'internal' && t.view.page === 'chat');
    if (existing) {
      browser.activeId = existing.id;
      browser.go(existing, url);
    } else {
      browser.newTab(url);
    }
    social.open = false;
  }

  // New group.
  let groupName = $state('');
  let picked = $state<string[]>([]);
  let creating = $state(false);
  async function createGroup() {
    creating = true;
    error = '';
    try {
      const id = await chats.createGroup(picked, groupName);
      groupName = '';
      picked = [];
      pick(id);
    } catch (e) {
      error = errorText(e);
    } finally {
      creating = false;
    }
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    if (back()) e.preventDefault();
    else if (sidebar) social.open = false;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="chat-app" class:narrow class:sidebar bind:clientWidth={width} {onkeydown}>
  {#if !narrow || (!chat && !panel)}
    <aside class="side">
      <header class="bar">
        <h2>Chats</h2>
        <button class="icon" aria-label="New group" title="New group" onclick={() => (panel = 'group')}><Icon name="plus" /></button>
        <button class="icon" aria-label="Friends" title="Friends" onclick={() => (panel = 'friends')}>
          <Icon name="userPlus" />
          {#if social.incoming.length}<span class="dot-count">{social.incoming.length}</span>{/if}
        </button>
        {#if sidebar}
          <button class="icon" aria-label="Open in a tab" title="Open chat.biggle in a tab" onclick={openInTab}><Icon name="external" size={17} /></button>
          <button class="icon" aria-label="Close chats" title="Close" onclick={() => (social.open = false)}><Icon name="close" size={17} /></button>
        {/if}
      </header>
      {#if !social.connected}<p class="status muted">Connecting…</p>{/if}
      {#if error && !panel}<p class="error pad" role="alert">{error}</p>{/if}
      <ChatList {selected} onselect={pick} onfriend={openFriend} onfriends={() => (panel = 'friends')} />
    </aside>
  {/if}

  {#if !narrow || chat || panel}
    <section class="main">
      {#if panel === 'friends'}
        <div class="pane"><ChatFriends onback={() => (panel = null)} onmessage={openFriend} /></div>
      {:else if panel === 'group'}
        <div class="pane">
          <header class="bar">
            <button class="icon" aria-label="Back" onclick={() => (panel = null)}><Icon name="back" /></button>
            <h2>New group</h2>
          </header>
          <div class="scroll group">
            <p class="label">Name</p>
            <input class="field" bind:value={groupName} maxlength="60" placeholder="Optional" aria-label="Group name" />
            <p class="label">People{picked.length ? ` · ${picked.length}` : ''}</p>
            <ChatPeoplePicker bind:picked />
          </div>
          <footer class="foot">
            {#if error}<p class="error" role="alert">{error}</p>{/if}
            <button class="btn primary" disabled={!picked.length || creating} onclick={createGroup}>
              {creating ? 'Making the group…' : 'Make group'}
            </button>
          </footer>
        </div>
      {:else if chat}
        {#if !(narrow && info)}
          <div class="pane convo">
            <ChatConversation {chat} {active} infoOpen={info} onback={narrow ? () => (selected = null) : undefined} oninfo={() => (info = !info)} />
          </div>
        {/if}
        {#if info}
          <div class="pane info" class:float={!narrow && width < 1000}>
            <ChatInfo {chat} onclose={() => (info = false)} onleft={() => pick(null)} />
          </div>
        {/if}
      {:else}
        <div class="pick">
          <Icon name="chat" size={40} />
          <p><strong>Chat with your friends</strong></p>
          <p class="muted">Pick a chat, or start a group. Call anyone with the phone and camera buttons.</p>
        </div>
      {/if}
    </section>
  {/if}
</div>

<style>
  .chat-app {
    display: flex;
    height: 100%;
    min-height: 0;
    background: var(--surface);
    color: var(--text);
  }
  .side {
    display: flex;
    flex-direction: column;
    width: 320px;
    min-height: 0;
    border-right: 1px solid var(--border);
  }
  .narrow .side {
    flex: 1;
    width: auto;
    border: 0;
  }
  .main {
    position: relative;
    flex: 1;
    min-width: 0;
    display: flex;
  }
  .pane {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }
  .convo {
    flex: 1;
  }
  .narrow .pane {
    flex: 1;
  }
  .info {
    width: 300px;
    border-left: 1px solid var(--border);
    background: var(--surface);
  }
  .narrow .info {
    width: auto;
    border: 0;
  }
  .info.float {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 2;
    box-shadow: -12px 0 30px rgb(0 0 0 / 0.12);
  }
  .main > .pane:only-child {
    flex: 1;
  }
  .status {
    margin: 8px 14px 0;
    font-size: 13px;
  }
  .pad {
    margin: 8px 14px 0;
  }
  .dot-count {
    position: absolute;
    top: 2px;
    right: 1px;
    min-width: 15px;
    height: 15px;
    padding: 0 4px;
    border-radius: 8px;
    background: var(--danger);
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    line-height: 15px;
  }
  .bar .icon {
    position: relative;
  }
  .group {
    padding: 4px 12px 12px;
  }
  .foot {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    padding: 12px;
    border-top: 1px solid var(--border);
  }
  .foot .error {
    margin: 0;
  }
  .pick {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 30px;
    color: var(--muted);
    text-align: center;
  }
  .pick p {
    max-width: 320px;
    margin: 0;
    font-size: 14px;
  }
  .pick strong {
    color: var(--text);
    font-size: 16px;
  }
  .pick :global(svg) {
    margin-bottom: 8px;
    opacity: 0.6;
  }
</style>
