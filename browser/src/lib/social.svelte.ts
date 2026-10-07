// Friends, direct messages and the live connection that keeps them up to date.
import { account } from './account.svelte';
import { api } from './api';
import { SERVER } from './config';

export type Friend = { username: string; unread: number; lastAt: number | null; online: boolean };
export type Message = { id: number; from: string; to: string; body: string; at: number; pending?: boolean };

type LiveEvent =
  | { type: 'message'; message: Message }
  | { type: 'friends' }
  | { type: 'read'; username: string }
  | { type: 'presence'; username: string; online: boolean };

const PING_MS = 30_000;

class Social {
  /** The friends panel is showing. */
  open = $state(false);
  friends = $state<Friend[]>([]);
  incoming = $state<string[]>([]);
  outgoing = $state<string[]>([]);
  connected = $state(false);

  chatWith = $state<string | null>(null);
  messages = $state<Message[]>([]);
  more = $state(false);
  loadingMessages = $state(false);

  get unread(): number {
    return this.friends.reduce((n, f) => n + f.unread, 0) + this.incoming.length;
  }

  private ws: WebSocket | null = null;
  private retries = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private pingTimer: ReturnType<typeof setInterval> | undefined;
  private nextPendingId = -1;

  start() {
    this.refreshFriends();
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
    this.chatWith = null;
    this.messages = [];
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
      if (this.chatWith) this.loadMessages(this.chatWith);
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
    const me = account.user?.username;
    if (ev.type === 'message') {
      const m = ev.message;
      const other = m.from === me ? m.to : m.from;
      const friend = this.friends.find((f) => f.username === other);
      if (friend) friend.lastAt = m.at;
      if (this.chatWith === other && !this.messages.some((x) => x.id === m.id)) this.messages.push(m);
      if (m.from !== me && friend) {
        const reading = this.chatWith === other && this.open && document.visibilityState === 'visible';
        if (reading) this.markRead(other);
        else friend.unread++;
      }
      this.sortFriends();
    } else if (ev.type === 'friends') {
      this.refreshFriends();
    } else if (ev.type === 'read') {
      const friend = this.friends.find((f) => f.username === ev.username);
      if (friend) friend.unread = 0;
    } else if (ev.type === 'presence') {
      const friend = this.friends.find((f) => f.username === ev.username);
      if (friend) friend.online = ev.online;
    }
  }

  private sortFriends() {
    this.friends.sort((a, b) => (b.lastAt ?? 0) - (a.lastAt ?? 0) || a.username.localeCompare(b.username));
  }

  async refreshFriends() {
    if (!account.token) return;
    try {
      const r = await api<{ friends: Friend[]; incoming: string[]; outgoing: string[] }>('GET', '/api/friends');
      this.friends = r.friends;
      this.incoming = r.incoming;
      this.outgoing = r.outgoing;
      if (this.chatWith && !r.friends.some((f) => f.username === this.chatWith)) this.closeChat();
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

  openChat(username: string) {
    this.open = true;
    this.chatWith = username;
    this.messages = [];
    this.more = false;
    this.loadMessages(username);
    this.markRead(username);
  }

  closeChat() {
    this.chatWith = null;
    this.messages = [];
  }

  private async loadMessages(username: string, before?: number) {
    this.loadingMessages = true;
    try {
      const q = before ? `?before=${before}` : '';
      const r = await api<{ messages: Message[]; more: boolean }>('GET', `/api/messages/${encodeURIComponent(username)}${q}`);
      if (this.chatWith !== username) return;
      if (before) {
        this.messages.unshift(...r.messages);
      } else {
        // Keep anything still sending.
        this.messages = [...r.messages, ...this.messages.filter((m) => m.pending)];
      }
      this.more = r.more;
    } finally {
      this.loadingMessages = false;
    }
  }

  loadOlder() {
    const oldest = this.messages.find((m) => !m.pending);
    if (this.chatWith && oldest) return this.loadMessages(this.chatWith, oldest.id);
  }

  async send(body: string) {
    const to = this.chatWith;
    const from = account.user?.username;
    if (!to || !from) return;
    const pending: Message = { id: this.nextPendingId--, from, to, body, at: Date.now(), pending: true };
    this.messages.push(pending);
    try {
      const { message } = await api<{ message: Message }>('POST', `/api/messages/${encodeURIComponent(to)}`, { body });
      const i = this.messages.findIndex((m) => m.id === pending.id);
      if (i !== -1) this.messages.splice(i, 1);
      if (this.chatWith === to && !this.messages.some((m) => m.id === message.id)) this.messages.push(message);
    } catch (e) {
      const i = this.messages.findIndex((m) => m.id === pending.id);
      if (i !== -1) this.messages.splice(i, 1);
      throw e;
    }
  }

  async markRead(username: string) {
    const friend = this.friends.find((f) => f.username === username);
    if (friend) friend.unread = 0;
    try {
      await api('POST', `/api/messages/${encodeURIComponent(username)}/read`);
    } catch {}
  }
}

export const social = new Social();
