// Live updates: one Durable Object per user holds that user's open WebSockets
// (one per browser window or device) and pushes events to them.
import { DurableObject } from 'cloudflare:workers';
import { userForToken } from './auth';
import { fail } from './http';

export type LiveEvent =
  | { type: 'message'; message: unknown }
  | { type: 'friends' }
  | { type: 'read'; username: string }
  | { type: 'presence'; username: string; online: boolean }
  | { type: 'review' }
  | { type: 'site'; name: string; status: string };

type Attachment = { userId: number; username: string };

const liveFor = (env: Env, userId: number) => env.LIVE.get(env.LIVE.idFromName(String(userId)));

export function notify(env: Env, userId: number, event: LiveEvent): Promise<void> {
  return liveFor(env, userId).notify(event);
}

export function isOnline(env: Env, userId: number): Promise<boolean> {
  return liveFor(env, userId).online();
}

async function announcePresence(env: Env, a: Attachment, online: boolean) {
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

  async notify(event: LiveEvent): Promise<void> {
    const data = JSON.stringify(event);
    for (const ws of this.openSockets()) {
      try {
        ws.send(data);
      } catch {}
    }
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
