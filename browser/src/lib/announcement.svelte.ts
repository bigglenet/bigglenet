// The banner admins put up for everyone ("maintenance at 8pm"; server/src/moderation.ts).
// Checked at startup and every few minutes; you can hide each one.
import { api } from './api';

const HIDDEN = 'biggle:announcement-hidden';
export type Announcement = { id: number; text: string; level: 'info' | 'warning'; at: number };

class Announcements {
  current = $state<Announcement | null>(null);
  hidden = $state<number>(Number(localStorageGet(HIDDEN)) || 0);
  private timer: ReturnType<typeof setInterval> | undefined;

  get shown(): Announcement | null {
    return this.current && this.current.id !== this.hidden ? this.current : null;
  }

  async check() {
    try {
      this.current = (await api<{ announcement: Announcement | null }>('GET', '/api/announcement')).announcement;
    } catch {}
  }

  start() {
    this.check();
    clearInterval(this.timer);
    this.timer = setInterval(() => this.check(), 5 * 60_000);
  }

  hide() {
    if (!this.current) return;
    this.hidden = this.current.id;
    try {
      localStorage.setItem(HIDDEN, String(this.current.id));
    } catch {}
  }
}

function localStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export const announcements = new Announcements();
