// Notifications while Bigglenet is closed, on phones and in browsers that allow it (web push;
// server/src/push.ts). public/sw.js shows them. The desktop app keeps running in the background
// instead (desktop/main), so this is for the web.
import { api } from './api';
import { i18n } from './i18n.svelte';
import { desktop } from './platform';

const b64 = (buf: ArrayBuffer | null) =>
  buf
    ? btoa(String.fromCharCode(...new Uint8Array(buf)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
    : '';
const bytes = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

class Push {
  readonly supported = !desktop && typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  on = $state(false);
  /** The server can send them (it has its keys). */
  available = $state(true);

  async refresh() {
    if (!this.supported) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      this.on = !!(await reg.pushManager.getSubscription());
    } catch {}
  }

  async enable() {
    const { key } = await api<{ key: string | null }>('GET', '/api/push');
    if (!key) {
      this.available = false;
      throw new Error('This server can’t send notifications while Bigglenet is closed.');
    }
    if ((await Notification.requestPermission()) !== 'granted') throw new Error('Your browser is blocking Bigglenet’s notifications. Allow them in its site settings.');
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(key) }));
    await api('POST', '/api/push', { endpoint: sub.endpoint, keys: { p256dh: b64(sub.getKey('p256dh')), auth: b64(sub.getKey('auth')) }, lang: i18n.lang });
    this.on = true;
  }

  async disable() {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await api('DELETE', '/api/push', { endpoint: sub.endpoint }).catch(() => {});
      await sub.unsubscribe();
    }
    this.on = false;
  }
}

export const push = new Push();
