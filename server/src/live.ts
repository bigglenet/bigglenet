// Live updates: one Durable Object per user holds that user's open WebSockets
// (one per browser window or device) and pushes events to them.
import { DurableObject } from 'cloudflare:workers';
import { userForToken } from './auth';
import { fail } from './http';
import { sendPush, type PushMessage } from './push';

export type LiveEvent =
  /** One-to-one messages, for apps from before group chats. */
  | { type: 'message'; message: unknown }
  | { type: 'chat-message'; message: unknown }
  | { type: 'chat-message-update'; message: unknown }
  | { type: 'chat-reactions'; chatId: number; messageId: number; reactions: unknown }
  | { type: 'chat-seen'; chatId: number; username: string; upTo: number }
  | { type: 'typing'; chatId: number; username: string }
  | { type: 'together'; chatId: number; from: string; data: unknown }
  | { type: 'chats' }
  | { type: 'chat-read'; chatId: number }
  | { type: 'call'; chatId: number; members: { username: string; video: boolean }[]; ring?: { from: string; video: boolean } }
  | { type: 'call-declined'; chatId: number; username: string }
  | { type: 'signal'; chatId: number; from: string; data: unknown }
  | { type: 'friends' }
  | { type: 'read'; username: string }
  | { type: 'presence'; username: string; online: boolean }
  | { type: 'review' }
  | { type: 'site'; name: string; status: string }
  | { type: 'notification'; notification: unknown }
  | { type: 'notifications-read'; ids: number[] | null }
  /** A friend's status or what they're up to changed (people.ts). */
  | { type: 'status'; username: string; status: unknown; activity: unknown }
  | { type: 'blocks' }
  | { type: 'profile'; username: string; avatar: number | null }
  /** Synced settings changed on another device (account.ts). */
  | { type: 'sync'; key: string };

type Attachment = { userId: number; username: string };

const liveFor = (env: Env, userId: number) => env.LIVE.get(env.LIVE.idFromName(String(userId)));

export function notify(env: Env, userId: number, event: LiveEvent): Promise<void> {
  return liveFor(env, userId).notify(event, userId);
}

/**
 * What a push notification says for an event, when it's worth one (a message, a call, a
 * notification), or null. Sent while someone has Bigglenet closed (push.ts).
 */
function pushFor(event: LiveEvent): PushMessage | null {
  if (event.type === 'chat-message') {
    const m = event.message as { chatId: number; from: string | null; kind: string; body: string; attachment?: { type?: string; voice?: boolean } | null; unlockAt?: number | null; blocked?: boolean };
    if (m.kind !== 'text' || !m.from) return null;
    const body = m.unlockAt
      ? 'Sent a time capsule'
      : m.attachment
        ? m.attachment.voice
          ? 'Sent a voice message'
          : m.attachment.type?.startsWith('image/')
            ? 'Sent a photo'
            : 'Sent a file'
        : m.body.slice(0, 200);
    return { title: m.from, body, tag: `chat-${m.chatId}`, chatId: m.chatId };
  }
  if (event.type === 'call' && event.ring) {
    return { title: event.ring.from, body: event.ring.video ? 'Video calling you' : 'Calling you', tag: `call-${event.chatId}`, chatId: event.chatId };
  }
  if (event.type === 'notification') {
    const n = event.notification as { kind: string; data: Record<string, unknown> };
    const s = (v: unknown) => (typeof v === 'string' ? v : '');
    const text: Record<string, [string, string]> = {
      'friend-request': [`${s(n.data.username)} wants to be friends`, `biggle://u/${s(n.data.username)}`],
      'friend-accepted': [`${s(n.data.username)} accepted your friend request`, `biggle://u/${s(n.data.username)}`],
      'invite-joined': [`${s(n.data.username)} joined with your invite link`, `biggle://u/${s(n.data.username)}`],
      'event-soon': [`${s(n.data.title)} starts soon`, `biggle://events/${n.data.event}`],
      'event-invite': [`${s(n.data.from)} invited you to ${s(n.data.title)}`, `biggle://events/${n.data.event}`],
      'club-invite': [`${s(n.data.from)} invited you to join ${s(n.data.name)}`, `biggle://clubs/${n.data.club}`],
      'forum-reply': [`${s(n.data.author)} replied to “${s(n.data.title)}”`, `biggle://board.biggle/thread/${n.data.thread}`],
      'site-approved': ['Your site is live! An admin approved it.', `biggle://sites/${s(n.data.site)}`],
      contact: [`${s(n.data.from)} sent you a message from your site`, `biggle://u/${s(n.data.from)}`],
      guestbook: [`${s(n.data.author)} signed your guestbook`, `biggle://sites/${s(n.data.site)}`],
      comment: [`${s(n.data.author)} commented on your site`, `biggle://sites/${s(n.data.site)}`],
      'co-owner': [`${s(n.data.from)} added you as an editor of a site`, `biggle://sites/${s(n.data.site)}`],
    };
    const t = text[n.kind];
    return t ? { title: 'Bigglenet', body: t[0], href: t[1], tag: `n-${n.kind}` } : null;
  }
  return null;
}

export function isOnline(env: Env, userId: number): Promise<boolean> {
  return liveFor(env, userId).online();
}

async function announcePresence(env: Env, a: Attachment, online: boolean) {
  await env.DB.prepare('UPDATE users SET online = ? WHERE id = ?').bind(online ? 1 : 0, a.userId).run();
  const { results } = await env.DB.prepare("SELECT friend_id FROM friendships WHERE user_id = ? AND status = 'friends'")
    .bind(a.userId)
    .all<{ friend_id: number }>();
  await Promise.all(results.map((r) => notify(env, r.friend_id, { type: 'presence', username: a.username, online })));
}

/**
 * GET /api/live, as a WebSocket. Browsers can't set headers on WebSockets, so the
 * session token travels as the second subprotocol: new WebSocket(url, ['biggle', token]).
 */
export async function connect(req: Request, env: Env): Promise<Response> {
  if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    return fail(426, 'websocket_only', 'Connect with a WebSocket.');
  }
  const [protocol, token] = (req.headers.get('Sec-WebSocket-Protocol') ?? '').split(',').map((s) => s.trim());
  const user = protocol === 'biggle' && token ? await userForToken(env, token) : null;
  if (!user) return fail(401, 'signed_out', 'Sign in first.');

  const headers = new Headers(req.headers);
  headers.set('X-Biggle-User-Id', String(user.id));
  headers.set('X-Biggle-Username', user.username);
  return liveFor(env, user.id).fetch(new Request(req, { headers }));
}

export class Live extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Answer keep-alive pings without waking the object up.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(req: Request): Promise<Response> {
    const attachment: Attachment = {
      userId: Number(req.headers.get('X-Biggle-User-Id')),
      username: req.headers.get('X-Biggle-Username') ?? '',
    };
    const wasOffline = this.openSockets().length === 0;
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(attachment);
    if (wasOffline) this.ctx.waitUntil(announcePresence(this.env, attachment, true));
    return new Response(null, { status: 101, webSocket: client, headers: { 'Sec-WebSocket-Protocol': 'biggle' } });
  }

  async notify(event: LiveEvent, userId?: number): Promise<void> {
    const data = JSON.stringify(event);
    const open = this.openSockets();
    for (const ws of open) {
      try {
        ws.send(data);
      } catch {}
    }
    // Nobody's here: a push to their phone (or browser) instead, if it's worth one.
    if (!open.length && userId) await this.push(event, userId);
  }

  private async push(event: LiveEvent, userId: number) {
    const message = pushFor(event);
    if (!message) return;
    const { results } = await this.env.DB.prepare(
      'SELECT p.endpoint, p.p256dh, p.auth, u.username FROM push_subscriptions p JOIN users u ON u.id = p.user_id WHERE p.user_id = ?',
    )
      .bind(userId)
      .all<{ endpoint: string; p256dh: string; auth: string; username: string }>();
    // Not your own messages, sent from another device.
    if (!results.length || (event.type === 'chat-message' && message.title === results[0].username)) return;
    await sendPush(this.env, userId, message, results);
  }

  async online(): Promise<boolean> {
    return this.openSockets().length > 0;
  }

  async webSocketMessage() {}

  async webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code === 1005 ? 1000 : code, 'bye');
    } catch {}
    await this.gone(ws);
  }

  async webSocketError(ws: WebSocket) {
    await this.gone(ws);
  }

  private openSockets(except?: WebSocket) {
    return this.ctx.getWebSockets().filter((s) => s !== except && s.readyState === WebSocket.OPEN);
  }

  private async gone(ws: WebSocket) {
    if (this.openSockets(ws).length > 0) return;
    const attachment = ws.deserializeAttachment() as Attachment | null;
    if (attachment) await announcePresence(this.env, attachment, false);
  }
}
