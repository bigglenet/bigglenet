// People: profile pictures, statuses, what friends are up to, and who you've blocked. Profiles
// themselves are biggle://u/<name> (ProfilePage.svelte).
import { account } from './account.svelte';
import { api, apiFetch } from './api';
import { SERVER } from './config';
import { t } from './i18n.svelte';

export type Status = { text: string; emoji: string; until: number | null };
export type Activity = { text: string; at: number };

export type Profile = {
  username: string;
  bio: string | null;
  avatar: number | null;
  status: Status | null;
  activity: Activity | null;
  joined: number;
  sites: { name: string; tld: 'biggle' | 'b'; title: string | null }[];
  friends: number;
  achievements: { site: string; key: string; title: string; description: string | null; at: number }[];
  /** Their listed collections and open clubs. */
  collections?: { id: string; title: string; sites: number }[];
  clubs?: { id: number; name: string; emoji: string | null }[];
  friendship: 'friends' | 'incoming' | 'outgoing' | null;
  blocked: boolean;
  me: boolean;
  shareActivity?: boolean;
};

class People {
  /** Profile picture versions we know of: a number, null (none), or missing (not known yet). */
  avatars = $state<Record<string, number | null>>({});
  /** Statuses and activities of friends, kept fresh by the live connection. */
  statuses = $state<Record<string, { status: Status | null; activity: Activity | null }>>({});
  /** People you've blocked. */
  blocked = $state<string[]>([]);
  /** Whether friends see what you're up to on the Bigglenet. */
  shareActivity = $state(false);

  avatarVersion(username: string): number | null | undefined {
    if (username === account.user?.username && account.user.avatar !== undefined) return account.user.avatar;
    return this.avatars[username];
  }

  /** A profile picture's address, or null when they have none. */
  avatarUrl(username: string): string | null {
    const v = this.avatarVersion(username);
    if (v === null) return null;
    return `${SERVER}/api/avatars/${encodeURIComponent(username)}${v ? `?v=${v}` : ''}`;
  }

  /** What to show under a friend's name: their status, or what they're up to. */
  statusLine(username: string): string {
    const s = this.statuses[username];
    if (!s) return '';
    const status = s.status && (!s.status.until || s.status.until > Date.now()) ? s.status : null;
    if (status) return `${status.emoji} ${status.text}`.trim();
    return s.activity ? t('On {place}', { place: s.activity.text }) : '';
  }

  isBlocked(username: string | null): boolean {
    return !!username && this.blocked.includes(username);
  }

  /** What we learned from a profile or the friends list. */
  learn(username: string, info: { avatar?: number | null; status?: Status | null; activity?: Activity | null }) {
    if (info.avatar !== undefined) this.avatars[username] = info.avatar;
    if (info.status !== undefined || info.activity !== undefined) {
      this.statuses[username] = { status: info.status ?? null, activity: info.activity ?? null };
    }
  }

  async start() {
    try {
      const [me, blocks] = await Promise.all([
        api<Profile>('GET', `/api/users/${encodeURIComponent(account.user!.username)}`),
        api<{ blocked: string[] }>('GET', '/api/blocks'),
      ]);
      this.shareActivity = !!me.shareActivity;
      this.learn(me.username, me);
      this.blocked = blocks.blocked;
    } catch {}
  }

  reset() {
    this.statuses = {};
    this.blocked = [];
    this.shareActivity = false;
  }

  async refreshBlocks() {
    try {
      this.blocked = (await api<{ blocked: string[] }>('GET', '/api/blocks')).blocked;
    } catch {}
  }

  async profile(username: string): Promise<Profile> {
    const p = await api<Profile>('GET', `/api/users/${encodeURIComponent(username)}`);
    this.learn(p.username, p);
    return p;
  }

  async update(change: { bio?: string; status?: Omit<Status, 'until'> & { until?: number | null }; shareActivity?: boolean } | { status: null }) {
    const p = await api<Profile>('PATCH', '/api/me/profile', change);
    this.learn(p.username, p);
    this.shareActivity = !!p.shareActivity;
    return p;
  }

  async setAvatar(image: Blob) {
    const res = await apiFetch('PUT', '/api/me/avatar', image, image.type);
    const { avatar } = (await res.json()) as { avatar: number };
    if (account.user) account.user.avatar = avatar;
  }

  async removeAvatar() {
    await api('DELETE', '/api/me/avatar');
    if (account.user) account.user.avatar = null;
  }

  async block(username: string) {
    await api('POST', '/api/blocks', { username });
    if (!this.blocked.includes(username)) this.blocked = [username, ...this.blocked];
  }

  async unblock(username: string) {
    await api('DELETE', `/api/blocks/${encodeURIComponent(username)}`);
    this.blocked = this.blocked.filter((u) => u !== username);
  }

  /** Say what I'm up to (if I share it). null: nothing worth saying. */
  private lastActivity: string | null | undefined;
  async reportActivity(text: string | null) {
    if (!this.shareActivity || text === this.lastActivity) return;
    this.lastActivity = text;
    await api('PUT', '/api/me/activity', { text }).catch(() => (this.lastActivity = undefined));
  }
  /** Say it again, so it doesn't go stale while I'm still at it. */
  keepActivity() {
    const text = this.lastActivity;
    this.lastActivity = undefined;
    if (text) this.reportActivity(text);
  }
}

export const people = new People();

/** A square, small copy of a picture, ready to upload as a profile picture. */
export async function squareImage(file: Blob, size = 256): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.86));
  if (blob && blob.type === 'image/webp') return blob;
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Couldn’t read that picture.'))), 'image/jpeg', 0.88));
}
