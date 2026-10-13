// Chats: one-to-one and group conversations. The live connection (social.svelte.ts) feeds new
// messages in; the chat app reads and writes through here.
import { account } from './account.svelte';
import { api, ApiError } from './api';
import { SERVER } from './config';
import { t } from './i18n.svelte';
import { sites } from './sites.svelte';
import { social } from './social.svelte';

export type Attachment = {
  url: string;
  name: string;
  type: string;
  size: number;
  /** Pictures, sound and video show in the chat; anything else is a file to download. */
  inline: boolean;
  width?: number;
  height?: number;
  /** Seconds. */
  duration?: number;
  voice?: boolean;
};

export type Reaction = { emoji: string; users: string[] };

export type ChatMessage = {
  id: number;
  chatId: number;
  /** Who sent it. Null for notes from the Bigglenet itself, like "Call ended". */
  from: string | null;
  kind: 'text' | 'event';
  body: string;
  at: number;
  editedAt?: number;
  deleted?: boolean;
  /** A time capsule: when it opens. */
  unlockAt?: number;
  /** A time capsule that hasn't opened yet (for everyone but its sender). */
  locked?: boolean;
  /** From someone you've blocked. */
  blocked?: boolean;
  attachment?: Attachment | null;
  reply?: { id: number; from: string | null; body: string; deleted: boolean; locked: boolean; file: { name: string; type: string; voice: boolean } | null } | null;
  reactions?: Reaction[];
  /** Still sending (true) or couldn't be sent ('failed'). */
  pending?: true | 'failed';
};

/** What to send with a message, besides its text. */
export type SendExtras = {
  replyTo?: number | null;
  attachment?: { key: string; width?: number; height?: number; duration?: number; voice?: boolean } | null;
  unlockAt?: number | null;
};

export type CallMember = { username: string; video: boolean };

export type Chat = {
  id: number;
  kind: 'direct' | 'group';
  name: string | null;
  /** A club's own chat (its members are the club's). */
  club?: number | null;
  members: string[];
  lastAt: number | null;
  last: {
    from: string | null;
    kind: 'text' | 'event';
    body: string;
    at: number;
    deleted?: boolean;
    capsule?: boolean;
    file?: { name: string; type: string; voice: boolean };
  } | null;
  /** How far each member has read (message id), for "Seen". */
  reads?: Record<string, number>;
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
  /** Who's typing in each chat, and until when. */
  typing = $state<Record<number, Record<string, number>>>({});

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
    return others.length ? others.join(', ') : t('Just you');
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
      const pending = mine ? thread.messages.findIndex((x) => x.pending === true && x.body === m.body && !x.attachment === !m.attachment) : -1;
      if (pending !== -1) thread.messages[pending] = m;
      else thread.messages.push(m);
    }
    if (m.from && this.typing[m.chatId]?.[m.from]) delete this.typing[m.chatId][m.from];
    const chat = this.get(m.chatId);
    if (!chat) return void this.refresh();
    // "joined the club", "named the group…": who's in it or what it's called changed. In a
    // club, its site may have too (clubs.ts sends just this one message).
    if (m.kind === 'event') {
      this.refresh();
      if (chat.club) sites.refreshMine();
    }
    chat.last = lastOf(m);
    chat.lastAt = m.at;
    if (!mine) chat.unread++;
    else if (chat.reads && account.user) chat.reads[account.user.username] = m.id;
    // Newest conversation first.
    this.list = [chat, ...this.list.filter((c) => c.id !== chat.id)];
  }

  /** A message was edited, deleted or opened. */
  onUpdate(m: ChatMessage) {
    const thread = this.threads[m.chatId];
    const i = thread?.messages.findIndex((x) => x.id === m.id) ?? -1;
    if (thread && i !== -1) thread.messages[i] = { ...m, blocked: thread.messages[i].blocked };
    // Replies show the new version too.
    for (const x of thread?.messages ?? []) {
      if (x.reply?.id === m.id) x.reply = { ...x.reply, body: m.deleted ? '' : m.body.slice(0, 140), deleted: !!m.deleted };
    }
    const chat = this.get(m.chatId);
    const last = thread?.messages.at(-1);
    if (chat && last?.id === m.id) chat.last = lastOf(m);
  }

  onReactions(chatId: number, messageId: number, reactions: Reaction[]) {
    const m = this.threads[chatId]?.messages.find((x) => x.id === messageId);
    if (m) m.reactions = reactions;
  }

  /** Someone read up to a message. */
  onSeen(chatId: number, username: string, upTo: number) {
    const chat = this.get(chatId);
    if (chat) chat.reads = { ...chat.reads, [username]: Math.max(upTo, chat.reads?.[username] ?? 0) };
  }

  onTyping(chatId: number, username: string) {
    this.typing[chatId] = { ...this.typing[chatId], [username]: Date.now() + 6000 };
    setTimeout(() => {
      const until = this.typing[chatId]?.[username];
      if (until && until <= Date.now()) delete this.typing[chatId][username];
    }, 6100);
  }

  /** Say we're typing, now and then while we are. */
  private typedAt = new Map<number, number>();
  sendTyping(chatId: number) {
    const last = this.typedAt.get(chatId) ?? 0;
    if (Date.now() - last < 3000) return;
    this.typedAt.set(chatId, Date.now());
    api('POST', `/api/chats/${chatId}/typing`).catch(() => {});
  }

  /** Fetch one message again (a time capsule that has just opened). */
  async reloadMessage(chatId: number, id: number) {
    try {
      const { message } = await api<{ message: ChatMessage }>('GET', `/api/chats/${chatId}/messages/${id}`);
      this.onUpdate(message);
    } catch {}
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

  async send(id: number, body: string, extras: SendExtras = {}, preview?: Partial<ChatMessage>) {
    const text = body.trim();
    if (!text && !extras.attachment) return;
    const thread = this.threads[id];
    const temp: ChatMessage = {
      id: nextPending--,
      chatId: id,
      from: account.user?.username ?? null,
      kind: 'text',
      body: text,
      at: Date.now(),
      pending: true,
      ...preview,
      ...(extras.unlockAt ? { unlockAt: extras.unlockAt } : {}),
    };
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
      const { message } = await api<{ message: ChatMessage }>('POST', `/api/chats/${id}/messages`, { body: text, ...extras });
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
    await this.send(m.chatId, m.body, { replyTo: m.reply?.id ?? null, unlockAt: m.unlockAt ?? null });
  }

  async edit(m: ChatMessage, body: string) {
    const { message } = await api<{ message: ChatMessage }>('PATCH', `/api/chats/${m.chatId}/messages/${m.id}`, { body });
    this.onUpdate(message);
  }

  async remove(m: ChatMessage) {
    const { message } = await api<{ message: ChatMessage }>('DELETE', `/api/chats/${m.chatId}/messages/${m.id}`);
    this.onUpdate(message);
  }

  /** Add a reaction, or take it back. */
  async react(m: ChatMessage, emoji: string) {
    const me = account.user?.username;
    if (!me) return;
    // Show it straight away.
    const before = m.reactions ?? [];
    const has = before.some((r) => r.emoji === emoji && r.users.includes(me));
    const after = has
      ? before.map((r) => (r.emoji === emoji ? { ...r, users: r.users.filter((u) => u !== me) } : r)).filter((r) => r.users.length)
      : before.some((r) => r.emoji === emoji)
        ? before.map((r) => (r.emoji === emoji ? { ...r, users: [...r.users, me] } : r))
        : [...before, { emoji, users: [me] }];
    m.reactions = after;
    try {
      const { reactions } = await api<{ reactions: Reaction[] }>('POST', `/api/chats/${m.chatId}/messages/${m.id}/reactions`, { emoji });
      m.reactions = reactions;
    } catch (e) {
      m.reactions = before;
      throw e;
    }
  }

  /** Upload a file to a chat, ready to send. `progress` gets 0–1 as it goes. */
  upload(chatId: number, file: Blob, name: string, progress?: (done: number) => void): Promise<{ key: string; name: string; type: string; size: number }> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${SERVER}/api/chats/${chatId}/files`);
      if (account.token) xhr.setRequestHeader('Authorization', `Bearer ${account.token}`);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.setRequestHeader('X-File-Name', encodeURIComponent(name));
      xhr.upload.onprogress = (e) => e.lengthComputable && progress?.(e.loaded / e.total);
      xhr.onload = () => {
        let data: Record<string, unknown> = {};
        try {
          data = JSON.parse(xhr.responseText);
        } catch {}
        if (xhr.status >= 200 && xhr.status < 300) resolve(data as { key: string; name: string; type: string; size: number });
        else reject(new ApiError(xhr.status, String(data.error ?? 'http'), String(data.message ?? t('Couldn’t send that file.'))));
      };
      xhr.onerror = () => reject(new ApiError(0, 'offline', t('Can’t reach the Bigglenet. Check your connection.')));
      xhr.send(file);
    });
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

/** What the chat list shows for a chat's newest message. */
function lastOf(m: ChatMessage): Chat['last'] {
  return {
    from: m.from,
    kind: m.kind,
    body: m.body.slice(0, 140),
    at: m.at,
    ...(m.deleted ? { deleted: true } : {}),
    ...(m.unlockAt ? { capsule: true } : {}),
    ...(m.attachment ? { file: { name: m.attachment.name, type: m.attachment.type, voice: !!m.attachment.voice } } : {}),
  };
}

/** A short line for a message that isn't just text: "📷 Photo", "🎤 Voice message"… */
export function fileLabel(file: { name: string; type: string; voice?: boolean }): string {
  if (file.voice) return t('🎤 Voice message');
  if (file.type.startsWith('image/')) return t('📷 Photo');
  if (file.type.startsWith('video/')) return t('🎬 Video');
  if (file.type.startsWith('audio/')) return `🎵 ${file.name}`;
  return `📎 ${file.name}`;
}
