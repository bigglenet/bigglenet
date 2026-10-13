// Rooms (server/src/rooms.ts): live connections between everyone on a site. Pages use them
// through biggle.room() (page-runtime.js asks, frame.ts answers); the site editor uses one to
// edit together. The browser holds the connection, so pages never see the session token.
import { t } from './i18n.svelte';
import { account } from './account.svelte';
import { SERVER } from './config';

export type RoomEvent =
  | { type: 'welcome'; you: string; members: string[] }
  | { type: 'join' | 'leave'; user: string }
  | { type: 'message'; from: string; data: unknown };

export class RoomLink {
  private ws: WebSocket | null = null;
  private closed = false;
  private retries = 0;
  private ping: ReturnType<typeof setInterval> | undefined;
  members: string[] = [];

  constructor(
    private site: string,
    private name: string,
    private onEvent: (e: RoomEvent) => void,
  ) {}

  /** Connect. Resolves once the room says hello, with who's in it. */
  open(): Promise<{ you: string; members: string[] }> {
    return new Promise((resolve, reject) => {
      let first = true;
      const connect = () => {
        if (this.closed || !account.token) return reject(new Error(t('Signed out.')));
        const ws = new WebSocket(`${SERVER.replace(/^http/, 'ws')}/api/rooms/${encodeURIComponent(this.site)}/${encodeURIComponent(this.name)}`, ['biggle', account.token]);
        this.ws = ws;
        ws.onmessage = (e) => {
          if (e.data === 'pong') return;
          let ev: RoomEvent;
          try {
            ev = JSON.parse(e.data);
          } catch {
            return;
          }
          if (ev.type === 'welcome') {
            this.members = ev.members;
            this.retries = 0;
            if (first) {
              first = false;
              resolve({ you: ev.you, members: ev.members });
            }
          } else if (ev.type === 'join') {
            if (!this.members.includes(ev.user)) this.members = [...this.members, ev.user];
          } else if (ev.type === 'leave') {
            this.members = this.members.filter((m) => m !== ev.user);
          }
          this.onEvent(ev);
        };
        ws.onopen = () => {
          clearInterval(this.ping);
          this.ping = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('ping'), 30_000);
        };
        ws.onclose = () => {
          clearInterval(this.ping);
          if (this.closed) return;
          if (first) return reject(new Error(t('Couldn’t join that room.')));
          // Lost the connection: try again, a little later each time.
          setTimeout(connect, Math.min(15_000, 1000 * 2 ** this.retries++));
        };
      };
      connect();
    });
  }

  send(data: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(data));
  }

  close() {
    this.closed = true;
    clearInterval(this.ping);
    this.ws?.close();
  }
}
