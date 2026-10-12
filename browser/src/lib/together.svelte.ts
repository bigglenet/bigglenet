// Watching or listening together during a call: someone pastes a YouTube link (or a link to a
// video or song file), and everyone in the call plays it in step. Play, pause and seeking are
// passed around the call (POST /api/chats/:id/together); everyone's player follows.
import { account } from './account.svelte';
import { api } from './api';
import { calls } from './calls.svelte';

export type Shared = {
  /** What's playing: a YouTube video, or a video or sound file. */
  kind: 'youtube' | 'media';
  url: string;
  /** YouTube's video id. */
  id?: string;
  playing: boolean;
  /** Seconds into it, at `at` (our clock). */
  time: number;
  at: number;
  /** Who put it on. */
  by: string;
};

type Message =
  | { action: 'load'; shared: Omit<Shared, 'at'> & { sentAt: number } }
  | { action: 'play' | 'pause' | 'seek'; time: number; playing: boolean; sentAt: number }
  | { action: 'stop' };

/** What the player on screen can do (TogetherPlayer.svelte). */
export type Player = { seek(time: number): void; play(): void; pause(): void; time(): number };

/** A YouTube link's video id, from youtube.com, youtu.be, an Invidious instance or similar. */
export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (/(^|\.)youtu\.be$/.test(u.hostname)) return u.pathname.slice(1).split('/')[0] || null;
    const v = u.searchParams.get('v');
    if (v && /^[\w-]{11}$/.test(v)) return v;
    const m = /\/(?:embed|shorts|live|v)\/([\w-]{11})/.exec(u.pathname);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

class Together {
  shared = $state<Shared | null>(null);
  /** The player, while it's on screen. */
  player: Player | null = null;
  /** Changes we're making to the player because someone else did; not to be passed on. */
  private applyingUntil = 0;

  /** Where it should be now. */
  expected(): number {
    const s = this.shared;
    if (!s) return 0;
    return s.playing ? s.time + (Date.now() - s.at) / 1000 : s.time;
  }

  /** Put something on for everyone. Returns an error to show, if any. */
  start(url: string): string | null {
    const link = url.trim();
    let parsed: URL;
    try {
      parsed = new URL(link);
    } catch {
      return 'Paste a link, like https://youtu.be/…';
    }
    if (!/^https?:$/.test(parsed.protocol)) return 'Paste a link, like https://youtu.be/…';
    const id = youtubeId(link);
    this.shared = { kind: id ? 'youtube' : 'media', url: link, id: id ?? undefined, playing: true, time: 0, at: Date.now(), by: account.user?.username ?? '' };
    this.send({ action: 'load', shared: { ...this.shared, sentAt: Date.now() } });
    return null;
  }

  stop() {
    this.shared = null;
    this.send({ action: 'stop' });
  }

  /** Someone new joined the call: whoever put it on tells them what's playing. */
  greet() {
    const s = this.shared;
    if (s && s.by === account.user?.username) this.send({ action: 'load', shared: { ...s, time: this.expected(), sentAt: Date.now() } });
  }

  // --- The player on screen says what happened ---

  /** Someone pressed play or pause, or moved the slider, on our player. */
  local(action: 'play' | 'pause' | 'seek', time: number, playingNow?: boolean) {
    const s = this.shared;
    if (!s || Date.now() < this.applyingUntil) return;
    const playing = action === 'seek' ? (playingNow ?? s.playing) : action === 'play';
    this.shared = { ...s, playing, time, at: Date.now() };
    this.send({ action, time, playing, sentAt: Date.now() });
  }

  // --- Others ---

  onRemote(chatId: number, _from: string, data: Record<string, unknown>) {
    if (chatId !== calls.chatId) return;
    const m = data as Message;
    if (m.action === 'stop') {
      this.shared = null;
      return;
    }
    if (m.action === 'load') {
      const { sentAt, ...shared } = m.shared;
      // Allow for the time it took to get here, roughly.
      const late = Math.max(0, Math.min(5, (Date.now() - sentAt) / 1000));
      this.shared = { ...shared, time: shared.time + (shared.playing ? late : 0), at: Date.now() };
      this.apply();
      return;
    }
    const s = this.shared;
    if (!s) return;
    const late = Math.max(0, Math.min(5, (Date.now() - m.sentAt) / 1000));
    this.shared = { ...s, playing: m.playing, time: m.time + (m.playing ? late : 0), at: Date.now() };
    this.apply();
  }

  /** Make our player match. */
  apply() {
    const s = this.shared;
    const p = this.player;
    if (!s || !p) return;
    this.applyingUntil = Date.now() + 1200;
    if (Math.abs(p.time() - this.expected()) > 1) p.seek(this.expected());
    if (s.playing) p.play();
    else p.pause();
  }

  /** Called now and then while playing: catch up if we've drifted. */
  keepInStep() {
    const p = this.player;
    if (!this.shared?.playing || !p || Date.now() < this.applyingUntil) return;
    if (Math.abs(p.time() - this.expected()) > 2) {
      this.applyingUntil = Date.now() + 1200;
      p.seek(this.expected());
    }
  }

  reset() {
    this.shared = null;
    this.player = null;
  }

  private send(data: Message) {
    const chatId = calls.chatId;
    if (chatId !== null) api('POST', `/api/chats/${chatId}/together`, { data }).catch(() => {});
  }
}

export const together = new Together();
