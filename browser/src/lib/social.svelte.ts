// Friends, and the live connection that keeps friends, chats and calls up to date.
import { account } from './account.svelte';
import { api } from './api';
import { calls } from './calls.svelte';
import { chats, fileLabel, type ChatMessage, type Reaction } from './chats.svelte';
import { t } from './i18n.svelte';
import { SERVER } from './config';
import { follows } from './follows.svelte';
import { stamps } from './stamps.svelte';
import { notices } from './notify.svelte';
import { notifications, type Notification } from './notifications.svelte';
import { people, type Activity, type Status } from './people.svelte';
import { sites } from './sites.svelte';
import { sync } from './sync.svelte';
import { together } from './together.svelte';

export type Friend = {
  username: string;
  nickname: string | null;
  unread: number;
  lastAt: number | null;
  online: boolean;
  avatar?: number | null;
  status?: Status | null;
  activity?: Activity | null;
};

type LiveEvent =
  | { type: 'chat-message'; message: ChatMessage }
  | { type: 'chat-message-update'; message: ChatMessage }
  | { type: 'chat-reactions'; chatId: number; messageId: number; reactions: Reaction[] }
  | { type: 'chat-seen'; chatId: number; username: string; upTo: number }
  | { type: 'typing'; chatId: number; username: string }
  | { type: 'together'; chatId: number; from: string; data: Record<string, unknown> }
  | { type: 'chats' }
  | { type: 'chat-read'; chatId: number }
  | { type: 'call'; chatId: number; members: { username: string; video: boolean }[]; ring?: { from: string; video: boolean } }
  | { type: 'call-declined'; chatId: number; username: string }
  | { type: 'signal'; chatId: number; from: string; data: Record<string, unknown> }
  | { type: 'friends' }
  | { type: 'presence'; username: string; online: boolean }
  | { type: 'review' }
  | { type: 'site'; name: string; status: string }
  | { type: 'notification'; notification: Notification }
  | { type: 'notifications-read'; ids: number[] | null }
  | { type: 'status'; username: string; status: Status | null; activity: Activity | null }
  | { type: 'blocks' }
  | { type: 'profile'; username: string; avatar: number | null }
  | { type: 'sync'; key: string }
  // Sent for apps from before group chats; chat-message covers it here.
  | { type: 'message' }
  | { type: 'read' };

const PING_MS = 30_000;

class Social {
  /** The chat sidebar is showing. */
  open = $state(false);
  friends = $state<Friend[]>([]);
  incoming = $state<string[]>([]);
  outgoing = $state<string[]>([]);
  friendsLoaded = $state(false);
  connected = $state(false);

  /** Unread messages in every chat, plus friend requests. */
  get unread(): number {
    return chats.unread + this.incoming.length;
  }

  /** What to call someone: the nickname you gave them, or their username. */
  nameOf(username: string | null): string {
    if (!username) return t('Someone');
    return this.friends.find((f) => f.username === username)?.nickname || username;
  }

  isOnline(username: string): boolean | undefined {
    return this.friends.find((f) => f.username === username)?.online;
  }

  /** Open the chat sidebar, at a chat. */
  showChat(chatId: number) {
    this.open = true;
    chats.focus = { id: chatId, n: (chats.focus?.n ?? 0) + 1 };
  }

  private ws: WebSocket | null = null;
  private retries = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private pingTimer: ReturnType<typeof setInterval> | undefined;

  start() {
    this.refreshFriends();
    chats.refresh();
    people.start();
    notifications.refresh();
    follows.refresh();
    stamps.refresh();
    sync.pull();
    this.connect();
  }

  stop() {
    clearTimeout(this.reconnectTimer);
    clearInterval(this.pingTimer);
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    this.connected = false;
    this.friends = [];
    this.incoming = [];
    this.outgoing = [];
    this.friendsLoaded = false;
    calls.leave();
    chats.reset();
    people.reset();
    notifications.reset();
    follows.reset();
    stamps.reset();
  }

  private connect() {
    const token = account.token;
    if (!token) return;
    const ws = new WebSocket(SERVER.replace(/^http/, 'ws') + '/api/live', ['biggle', token]);
    this.ws = ws;
    ws.onopen = () => {
      this.connected = true;
      this.retries = 0;
      // Catch up on anything that happened while we were disconnected.
      this.refreshFriends();
      chats.refresh();
      chats.reloadOpen();
      notifications.refresh();
      follows.refresh();
      sync.pull();
      this.pingTimer = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('ping'), PING_MS);
    };
    ws.onmessage = (e) => {
      if (e.data === 'pong') return;
      try {
        this.onEvent(JSON.parse(e.data));
      } catch {}
    };
    ws.onclose = () => {
      clearInterval(this.pingTimer);
      if (this.ws !== ws) return;
      this.connected = false;
      const delay = Math.min(30_000, 1000 * 2 ** this.retries++);
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    };
  }

  private onEvent(ev: LiveEvent) {
    switch (ev.type) {
      case 'chat-message':
        if (ev.message.from && people.isBlocked(ev.message.from)) ev.message = { ...ev.message, body: '', attachment: null, blocked: true };
        chats.onMessage(ev.message);
        return this.notifyMessage(ev.message);
      case 'chat-message-update':
        return chats.onUpdate(ev.message);
      case 'chat-reactions':
        return chats.onReactions(ev.chatId, ev.messageId, ev.reactions);
      case 'chat-seen':
        return chats.onSeen(ev.chatId, ev.username, ev.upTo);
      case 'typing':
        if (!people.isBlocked(ev.username)) chats.onTyping(ev.chatId, ev.username);
        return;
      case 'together':
        return together.onRemote(ev.chatId, ev.from, ev.data);
      case 'chats':
        return chats.refresh();
      case 'chat-read':
        return chats.onRead(ev.chatId);
      case 'call':
        calls.onCall(ev.chatId, ev.members, ev.ring);
        if (ev.ring) notices.call(this.nameOf(ev.ring.from), ev.ring.video, ev.chatId, () => {});
        return;
      case 'call-declined':
        return calls.onDeclined(ev.chatId, ev.username);
      case 'signal':
        return calls.onSignal(ev.chatId, ev.from, ev.data);
      case 'friends':
        return this.refreshFriends();
      case 'presence': {
        const friend = this.friends.find((f) => f.username === ev.username);
        if (friend) friend.online = ev.online;
        return;
      }
      case 'review':
      case 'site':
        return sites.onEvent(ev.type);
      case 'notification':
        return notifications.onNew(ev.notification);
      case 'notifications-read':
        return notifications.onRead(ev.ids);
      case 'status':
        return people.learn(ev.username, { status: ev.status, activity: ev.activity });
      case 'blocks':
        return people.refreshBlocks();
      case 'profile':
        return people.learn(ev.username, { avatar: ev.avatar });
      case 'sync':
        // Changed on another device.
        return sync.pull();
    }
  }

  /** A notification for a message from someone else, when you're not looking at Bigglenet. */
  private notifyMessage(m: ChatMessage) {
    if (m.kind !== 'text' || !m.from || m.from === account.user?.username || people.isBlocked(m.from)) return;
    const chat = chats.get(m.chatId);
    const from = this.nameOf(m.from);
    const title = chat?.kind === 'group' ? `${from} in ${chats.title(chat)}` : from;
    const body = m.locked ? t('⏳ Sent you a time capsule') : m.body || (m.attachment ? fileLabel(m.attachment) : '');
    notices.message(title, body, m.chatId, () => this.showChat(m.chatId));
  }

  async refreshFriends() {
    if (!account.token) return;
    try {
      const r = await api<{ friends: Friend[]; incoming: string[]; outgoing: string[] }>('GET', '/api/friends');
      this.friends = r.friends;
      for (const f of r.friends) people.learn(f.username, f);
      this.incoming = r.incoming;
      this.outgoing = r.outgoing;
      this.friendsLoaded = true;
    } catch {}
  }

  async addFriend(username: string) {
    await api('POST', '/api/friends', { username });
    await this.refreshFriends();
  }

  async accept(username: string) {
    await api('POST', `/api/friends/${encodeURIComponent(username)}/accept`);
    await this.refreshFriends();
  }

  /** Unfriend, decline a request or cancel one you sent. */
  async remove(username: string) {
    await api('DELETE', `/api/friends/${encodeURIComponent(username)}`);
    await this.refreshFriends();
  }

  async setNickname(username: string, nickname: string) {
    const r = await api<{ nickname: string | null }>('PUT', `/api/friends/${encodeURIComponent(username)}/nickname`, { nickname });
    const friend = this.friends.find((f) => f.username === username);
    if (friend) friend.nickname = r.nickname;
  }
}

export const social = new Social();
