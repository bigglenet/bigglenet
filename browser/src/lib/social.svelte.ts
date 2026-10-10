// Friends, and the live connection that keeps friends, chats and calls up to date.
import { account } from './account.svelte';
import { api } from './api';
import { calls } from './calls.svelte';
import { chats, type ChatMessage } from './chats.svelte';
import { SERVER } from './config';
import { sites } from './sites.svelte';

export type Friend = { username: string; nickname: string | null; unread: number; lastAt: number | null; online: boolean };

type LiveEvent =
  | { type: 'chat-message'; message: ChatMessage }
  | { type: 'chats' }
  | { type: 'chat-read'; chatId: number }
  | { type: 'call'; chatId: number; members: { username: string; video: boolean }[]; ring?: { from: string; video: boolean } }
  | { type: 'call-declined'; chatId: number; username: string }
  | { type: 'signal'; chatId: number; from: string; data: Record<string, unknown> }
  | { type: 'friends' }
  | { type: 'presence'; username: string; online: boolean }
  | { type: 'review' }
  | { type: 'site'; name: string; status: string }
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
    if (!username) return 'Someone';
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
        return chats.onMessage(ev.message);
      case 'chats':
        return chats.refresh();
      case 'chat-read':
        return chats.onRead(ev.chatId);
      case 'call':
        return calls.onCall(ev.chatId, ev.members, ev.ring);
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
    }
  }

  async refreshFriends() {
    if (!account.token) return;
    try {
      const r = await api<{ friends: Friend[]; incoming: string[]; outgoing: string[] }>('GET', '/api/friends');
      this.friends = r.friends;
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
