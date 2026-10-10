// Chats: one-to-one and group conversations. The live connection (social.svelte.ts) feeds new
// messages in; the chat app reads and writes through here.
import { account } from './account.svelte';
import { api } from './api';
import { social } from './social.svelte';

export type ChatMessage = {
  id: number;
  chatId: number;
  /** Who sent it. Null for notes from the Bigglenet itself, like "Call ended". */
  from: string | null;
  kind: 'text' | 'event';
  body: string;
  at: number;
  /** Still sending (true) or couldn't be sent ('failed'). */
  pending?: true | 'failed';
};

export type CallMember = { username: string; video: boolean };

export type Chat = {
  id: number;
  kind: 'direct' | 'group';
  name: string | null;
  members: string[];
  lastAt: number | null;
  last: { from: string | null; kind: 'text' | 'event'; body: string; at: number } | null;
  unread: number;
  /** Who's in a call in this chat right now. */
  call: CallMember[];
  callStarted: number | null;
};

type Thread = { messages: ChatMessage[]; more: boolean; loading: boolean };

let nextPending = -1;

class Chats {
  list = $state<Chat[]>([]);
  loaded = $state(false);
  threads = $state<Record<number, Thread>>({});
  /** A request for the chat sidebar to show a chat. */
  focus = $state<{ id: number; n: number } | null>(null);
  /** The chat sidebar's back step, for the phone's back button. False when it's at the start. */
  back: (() => boolean) | null = null;

  get unread(): number {
    return this.list.reduce((n, c) => n + c.unread, 0);
  }

  get(id: number | null): Chat | undefined {
    return id === null ? undefined : this.list.find((c) => c.id === id);
  }

  /** The other person in a one-to-one chat. */
  other(chat: Chat): string {
    return chat.members.find((m) => m !== account.user?.username) ?? chat.members[0] ?? '';
  }

  /** What to call a chat: the friend's name, the group's name, or who's in the group. */
  title(chat: Chat): string {
    if (chat.kind === 'direct') return social.nameOf(this.other(chat));
    if (chat.name) return chat.name;
    const others = chat.members.filter((m) => m !== account.user?.username).map((m) => social.nameOf(m));
    return others.length ? others.join(', ') : 'Just you';
  }

  /** The one-to-one chat with someone, if it exists yet. */
  withFriend(username: string): Chat | undefined {
    return this.list.find((c) => c.kind === 'direct' && c.members.includes(username));
  }

  reset() {
    this.list = [];
    this.loaded = false;
    this.threads = {};
  }

  async refresh() {
    if (!account.token) return;
    try {
      const { chats } = await api<{ chats: Chat[] }>('GET', '/api/chats');
      this.list = chats;
      this.loaded = true;
    } catch {}
  }

  /** After reconnecting: reload the conversations that are loaded, in case we missed messages. */
  reloadOpen() {
    for (const id of Object.keys(this.threads).map(Number)) {
      delete this.threads[id];
      this.load(id);
    }
  }

  /** Load a chat's newest messages, unless they're already here. */
  async load(id: number) {
    if (this.threads[id]) return;
    this.threads[id] = { messages: [], more: false, loading: true };
    try {
      const r = await api<{ messages: ChatMessage[]; more: boolean }>('GET', `/api/chats/${id}/messages`);
      const thread = this.threads[id];
      if (!thread) return;
      // Keep anything that arrived live while this was loading.
      const known = new Set(r.messages.map((m) => m.id));
      thread.messages = [...r.messages, ...thread.messages.filter((m) => !known.has(m.id))];
      thread.more = r.more;
    } catch {
      delete this.threads[id];
      return;
    }
    this.threads[id].loading = false;
  }

  async loadOlder(id: number) {
    const thread = this.threads[id];
    const first = thread?.messages.find((m) => !m.pending);
    if (!thread || !first || thread.loading) return;
    thread.loading = true;
    try {
      const r = await api<{ messages: ChatMessage[]; more: boolean }>('GET', `/api/chats/${id}/messages?before=${first.id}`);
      thread.messages = [...r.messages, ...thread.messages];
      thread.more = r.more;
    } finally {
      thread.loading = false;
    }
  }

  /** A message from the live connection. */
  onMessage(m: ChatMessage) {
    const mine = !!m.from && m.from === account.user?.username;
    const thread = this.threads[m.chatId];
    if (thread && !thread.messages.some((x) => x.id === m.id)) {
      // Our own message coming back: it replaces the one we showed while sending.
      const pending = mine ? thread.messages.findIndex((x) => x.pending === true && x.body === m.body) : -1;
      if (pending !== -1) thread.messages[pending] = m;
      else thread.messages.push(m);
    }
    const chat = this.get(m.chatId);
    if (!chat) return void this.refresh();
    chat.last = { from: m.from, kind: m.kind, body: m.body.slice(0, 140), at: m.at };
    chat.lastAt = m.at;
    if (!mine) chat.unread++;
    // Newest conversation first.
    this.list = [chat, ...this.list.filter((c) => c.id !== chat.id)];
  }

  /** Read on another of our devices. */
  onRead(chatId: number) {
    const chat = this.get(chatId);
    if (chat) chat.unread = 0;
  }

  async markRead(id: number) {
    const chat = this.get(id);
    if (!chat?.unread) return;
    chat.unread = 0;
    try {
      await api('POST', `/api/chats/${id}/read`);
    } catch {}
  }

  async send(id: number, body: string) {
    const text = body.trim();
    if (!text) return;
    const thread = this.threads[id];
    const temp: ChatMessage = { id: nextPending--, chatId: id, from: account.user?.username ?? null, kind: 'text', body: text, at: Date.now(), pending: true };
    thread?.messages.push(temp);
    const replacePending = (with_: ChatMessage | null) => {
      const t = this.threads[id];
      const i = t?.messages.findIndex((m) => m.id === temp.id) ?? -1;
      if (!t || i === -1) return;
      if (!with_) t.messages[i] = { ...t.messages[i], pending: 'failed' };
      // The live copy may have got here first.
      else if (t.messages.some((m) => m.id === with_.id)) t.messages.splice(i, 1);
      else t.messages[i] = with_;
    };
    try {
      const { message } = await api<{ message: ChatMessage }>('POST', `/api/chats/${id}/messages`, { body: text });
      replacePending(message);
    } catch (e) {
      replacePending(null);
      throw e;
    }
  }

  /** Send a failed message again. */
  async retry(m: ChatMessage) {
    const thread = this.threads[m.chatId];
    if (thread) thread.messages = thread.messages.filter((x) => x.id !== m.id);
    await this.send(m.chatId, m.body);
  }

  discard(m: ChatMessage) {
    const thread = this.threads[m.chatId];
    if (thread) thread.messages = thread.messages.filter((x) => x.id !== m.id);
  }

  /** Open (or make) the one-to-one chat with a friend. Returns its id. */
  async openWith(username: string): Promise<number> {
    const existing = this.withFriend(username);
    if (existing) return existing.id;
    const { id } = await api<{ id: number }>('POST', '/api/chats', { members: [username] });
    if (!this.get(id)) await this.refresh();
    return id;
  }

  async createGroup(members: string[], name: string): Promise<number> {
    const { id } = await api<{ id: number }>('POST', '/api/chats', { members, name: name.trim() || undefined, group: true });
    await this.refresh();
    return id;
  }

  async rename(id: number, name: string) {
    await api('PATCH', `/api/chats/${id}`, { name });
    const chat = this.get(id);
    if (chat) chat.name = name.trim() || null;
  }

  async addMembers(id: number, usernames: string[]) {
    await api('POST', `/api/chats/${id}/members`, { usernames });
    await this.refresh();
  }

  async leave(id: number) {
    await api('DELETE', `/api/chats/${id}/members/me`);
    this.list = this.list.filter((c) => c.id !== id);
    delete this.threads[id];
  }
}

export const chats = new Chats();
