// The notification centre: the bell in the toolbar. Someone signed your guestbook, your site was
// approved, a friend accepted your request… (server/src/notifications.ts).
import { api } from './api';
import { t } from './i18n.svelte';
import { siteHome, siteHost } from './url';

export type Notification = { id: number; kind: string; data: Record<string, unknown>; read: boolean; at: number };

class Notifications {
  list = $state<Notification[]>([]);
  unread = $state(0);
  more = $state(false);
  loaded = $state(false);

  async refresh() {
    try {
      const r = await api<{ notifications: Notification[]; more: boolean; unread: number }>('GET', '/api/notifications');
      this.list = r.notifications;
      this.more = r.more;
      this.unread = r.unread;
      this.loaded = true;
    } catch {}
  }

  async loadMore() {
    const last = this.list.at(-1);
    if (!last) return;
    const r = await api<{ notifications: Notification[]; more: boolean }>('GET', `/api/notifications?before=${last.id}`);
    this.list = [...this.list, ...r.notifications];
    this.more = r.more;
  }

  /** Mark some read, or all of them. */
  async markRead(ids?: number[]) {
    this.onRead(ids ?? null);
    await api('POST', '/api/notifications/read', ids ? { ids } : {}).catch(() => {});
  }

  /** Live: a new one. */
  onNew(n: Notification) {
    if (this.list.some((x) => x.id === n.id)) return;
    this.list = [n, ...this.list];
    if (!n.read) this.unread++;
  }

  /** Live: read here or on another device. */
  onRead(ids: number[] | null) {
    let changed = 0;
    for (const n of this.list) {
      if ((!ids || ids.includes(n.id)) && !n.read) {
        n.read = true;
        changed++;
      }
    }
    this.unread = ids ? Math.max(0, this.unread - changed) : 0;
  }

  reset() {
    this.list = [];
    this.unread = 0;
    this.more = false;
    this.loaded = false;
  }
}

export const notifications = new Notifications();

const s = (v: unknown) => (typeof v === 'string' ? v : '');

/** What a notification says, and where clicking it goes. */
export function describe(n: Notification): { text: string; href: string | null; icon: 'star' | 'globe' | 'users' | 'chat' | 'bell' | 'alert' } {
  const d = n.data;
  const site = s(d.site);
  switch (n.kind) {
    case 'guestbook':
      return {
        text: t('{who} signed {site}’s guestbook: “{body}”', { who: s(d.author), site: siteHost(site), body: s(d.body) }),
        href: siteHome(site),
        icon: 'chat',
      };
    case 'site-approved':
      return { text: t('{site} is live! An admin approved it.', { site: siteHost(site) }), href: siteHome(site), icon: 'globe' };
    case 'site-rejected':
      return {
        text: d.note
          ? t('{site} wasn’t approved: “{note}”', { site: siteHost(site), note: s(d.note) })
          : t('{site} wasn’t approved.', { site: siteHost(site) }),
        href: `biggle://sites/${site}`,
        icon: 'alert',
      };
    case 'friend-request':
      return { text: t('{who} wants to be friends', { who: s(d.username) }), href: `biggle://u/${s(d.username)}`, icon: 'users' };
    case 'friend-accepted':
      return { text: t('{who} accepted your friend request', { who: s(d.username) }), href: `biggle://u/${s(d.username)}`, icon: 'users' };
    case 'comment':
      return {
        text: t('{who} commented on {page}: “{body}”', { who: s(d.author), page: siteHost(site) + s(d.path), body: s(d.body) }),
        href: `biggle://${siteHost(site)}${s(d.path) || '/'}`,
        icon: 'chat',
      };
    case 'contact':
      return {
        text: t('{who} sent you a message from {site}: “{body}”', { who: s(d.from), site: siteHost(site), body: s(d.body) }),
        href: `biggle://u/${s(d.from)}`,
        icon: 'chat',
      };
    case 'site-updated':
      return { text: t('{site} was updated', { site: siteHost(site) }), href: siteHome(site), icon: 'globe' };
    case 'event-invite':
      return { text: t('{who} invited you to {event}', { who: s(d.from), event: s(d.title) }), href: `biggle://events/${d.event}`, icon: 'bell' };
    case 'event-soon':
      return { text: t('{event} starts soon', { event: s(d.title) }), href: `biggle://events/${d.event}`, icon: 'bell' };
    case 'club-invite':
      return { text: t('{who} invited you to join {club}', { who: s(d.from), club: s(d.name) }), href: `biggle://clubs/${d.club}`, icon: 'users' };
    case 'forum-reply':
      return { text: t('{who} replied to “{thread}”', { who: s(d.author), thread: s(d.title) }), href: `biggle://board.biggle/thread/${d.thread}`, icon: 'chat' };
    case 'achievement':
      return { text: t('Achievement unlocked on {site}: {title}', { site: siteHost(site), title: s(d.title) }), href: siteHome(site), icon: 'star' };
    case 'co-owner':
      return { text: t('{who} added you as an editor of {site}', { who: s(d.from), site: siteHost(site) }), href: `biggle://sites/${site}`, icon: 'globe' };
    case 'report':
      return { text: t('New report: {what}', { what: s(d.summary) }), href: 'biggle://admin/reports', icon: 'alert' };
    case 'announcement':
      return { text: s(d.text), href: null, icon: 'bell' };
    default:
      return { text: t('Something happened on the Bigglenet.'), href: null, icon: 'bell' };
  }
}
