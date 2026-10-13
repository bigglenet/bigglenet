// Rooms: live connections between everyone on a site, for multiplayer games and chat rooms
// (biggle.room('lobby') in pages), the drawing wall, and editing a site together. One Durable
// Object per site and room name. Pages never connect themselves: the browser does, with the
// visitor's session, and passes messages to and from the page.
//
//   GET /api/rooms/:site/:room   a WebSocket (the session token as its second subprotocol)
import { DurableObject } from 'cloudflare:workers';
import { userForToken } from './auth';
import { fail, SITE_KEY_RE } from './http';
import { isEditor } from './sites';

const ROOM_RE = /^[a-z0-9_:-]{1,60}$/i;
const MAX_MEMBERS = 50;
const MAX_MESSAGE = 16_000;
/** Messages each connection may send per second. */
const RATE = 30;

type Attachment = { userId: number; username: string };

export const roomFor = (env: Env, site: string, room: string) => env.ROOM.get(env.ROOM.idFromName(`${site}/${room.toLowerCase()}`));

export async function connectRoom(req: Request, env: Env, site: string, room: string): Promise<Response> {
  if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return fail(426, 'websocket_only', 'Connect with a WebSocket.');
  if (!SITE_KEY_RE.test(site) || !ROOM_RE.test(room)) return fail(400, 'bad_room', "That isn't a room.");
  const [protocol, token] = (req.headers.get('Sec-WebSocket-Protocol') ?? '').split(',').map((s) => s.trim());
  const user = protocol === 'biggle' && token ? await userForToken(env, token) : null;
  if (!user) return fail(401, 'signed_out', 'Sign in first.');
  const row = await env.DB.prepare('SELECT owner_id, status FROM names WHERE name = ?').bind(site).first<{ owner_id: number | null; status: string }>();
  if (!row) return fail(404, 'no_such_site', "That site doesn't exist.");
  const runs = row.owner_id === user.id || !!user.is_admin || (await isEditor(env, site, user.id));
  // Sites waiting for approval, and the editor's own room, are only for the people who run them.
  if ((row.status !== 'live' || room.toLowerCase().startsWith('editor')) && !runs) return fail(403, 'not_yours', "You can't join that room.");
  const headers = new Headers(req.headers);
  headers.set('X-Biggle-User-Id', String(user.id));
  headers.set('X-Biggle-Username', user.username);
  return roomFor(env, site, room).fetch(new Request(req, { headers }));
}

export class Room extends DurableObject<Env> {
  /** Recent messages per connection, to keep anyone from flooding the room. */
  private sent = new Map<WebSocket, { at: number; n: number }>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  private sockets(except?: WebSocket) {
    return this.ctx.getWebSockets().filter((s) => s !== except && s.readyState === WebSocket.OPEN);
  }

  private members(): string[] {
    return [...new Set(this.sockets().map((s) => (s.deserializeAttachment() as Attachment).username))];
  }

  async fetch(req: Request): Promise<Response> {
    const a: Attachment = { userId: Number(req.headers.get('X-Biggle-User-Id')), username: req.headers.get('X-Biggle-Username') ?? '' };
    if (this.sockets().length >= MAX_MEMBERS) return fail(409, 'room_full', 'That room is full.');
    const wasHere = this.members().includes(a.username);
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(a);
    server.send(JSON.stringify({ type: 'welcome', you: a.username, members: this.members() }));
    if (!wasHere) this.send({ type: 'join', user: a.username }, server);
    return new Response(null, { status: 101, webSocket: client, headers: { 'Sec-WebSocket-Protocol': 'biggle' } });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== 'string' || raw.length > MAX_MESSAGE) return;
    const now = Date.now();
    const s = this.sent.get(ws) ?? { at: now, n: 0 };
    if (now - s.at > 1000) {
      s.at = now;
      s.n = 0;
    }
    if (++s.n > RATE) return;
    this.sent.set(ws, s);
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    const a = ws.deserializeAttachment() as Attachment;
    this.send({ type: 'message', from: a.username, data }, ws);
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code === 1005 ? 1000 : code, 'bye');
    } catch {}
    this.gone(ws);
  }

  async webSocketError(ws: WebSocket) {
    this.gone(ws);
  }

  private gone(ws: WebSocket) {
    this.sent.delete(ws);
    const a = ws.deserializeAttachment() as Attachment | null;
    if (a && !this.sockets(ws).some((s) => (s.deserializeAttachment() as Attachment).username === a.username)) this.send({ type: 'leave', user: a.username }, ws);
  }

  /** Something for everyone in the room (from the server: a new stroke on the wall…). */
  async broadcast(event: Record<string, unknown>) {
    this.send(event);
  }

  private send(event: Record<string, unknown>, except?: WebSocket) {
    const data = JSON.stringify(event);
    for (const s of this.sockets(except)) {
      try {
        s.send(data);
      } catch {}
    }
  }
}
