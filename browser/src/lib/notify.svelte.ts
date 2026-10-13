// Notifications for new messages and calls while Bigglenet isn't the window you're using, and the
// unread count on the app's icon (the Dock on a Mac, the taskbar on Windows, an installed PWA's
// icon). Turn them off in Settings.
import { t } from './i18n.svelte';
import { desktop } from './platform';

const KEY = 'biggle:notify';

type Permission = NotificationPermission | 'unsupported';

const supported = typeof Notification !== 'undefined';

class Notices {
  /** Show notifications (Settings). */
  enabled = $state(load());
  /** Game mode: no notifications for now. */
  quiet = false;
  /** Whether this browser lets Bigglenet show them. The desktop app always does. */
  permission = $state<Permission>(desktop ? 'granted' : supported ? Notification.permission : 'unsupported');

  setEnabled(on: boolean) {
    this.enabled = on;
    try {
      localStorage.setItem(KEY, on ? '1' : '0');
    } catch {}
    if (on) this.allow();
  }

  /** Ask the browser to allow notifications (only works right after a click). */
  async allow() {
    if (desktop || !supported || Notification.permission !== 'default') return;
    this.permission = await Notification.requestPermission();
  }

  /** Someone sent a message. `onclick`: show it. */
  async message(title: string, body: string, chatId: number, onclick: () => void) {
    await this.show(title, body, `chat-${chatId}`, { chatId }, onclick);
  }

  /** Someone is calling. */
  async call(from: string, video: boolean, chatId: number, onclick: () => void) {
    await this.show(from, video ? t('Video call. Open Bigglenet to answer.') : t('Calling you. Open Bigglenet to answer.'), `call-${chatId}`, { chatId }, onclick);
  }

  async test() {
    await this.allow();
    await this.show('Bigglenet', t('Notifications are on. You’ll see one like this when a friend messages you.'), 'test', {}, () => {}, true);
  }

  private async show(title: string, body: string, tag: string, data: Record<string, unknown>, onclick: () => void, always = false) {
    if (!always && (!this.enabled || this.quiet || (await looking()))) return;
    if (this.permission !== 'granted') return;
    try {
      const n = new Notification(title, { body: body.slice(0, 200), tag, ...(desktop ? {} : { icon: '/favicon.png' }) });
      n.onclick = () => {
        n.close();
        if (desktop) desktop.window.focus();
        else window.focus();
        onclick();
      };
    } catch {
      // Phones only show notifications through the service worker (see public/sw.js).
      const sw = await navigator.serviceWorker?.getRegistration();
      await sw?.showNotification(title, { body: body.slice(0, 200), tag, icon: '/favicon.png', data }).catch(() => {});
    }
  }

  /** The unread count on the app's icon. */
  badge(count: number) {
    if (desktop) {
      desktop.badge(count, count ? badgeImage(count) : null).catch(() => {});
    } else if ('setAppBadge' in navigator) {
      (count ? navigator.setAppBadge(count) : navigator.clearAppBadge()).catch(() => {});
    }
  }
}

function load(): boolean {
  try {
    return localStorage.getItem(KEY) !== '0';
  } catch {
    return true;
  }
}

/** Bigglenet is the window you're using right now. */
async function looking(): Promise<boolean> {
  if (desktop) return desktop.window.isFocused().catch(() => false);
  return document.visibilityState === 'visible' && document.hasFocus();
}

/** A red dot with the count, for the taskbar on Windows (it can't show a number by itself). */
function badgeImage(count: number): string | null {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#e5484d';
  g.beginPath();
  g.arc(16, 16, 16, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fff';
  g.font = `bold ${count > 9 ? 17 : 21}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(count > 9 ? '9+' : String(count), 16, 17);
  return canvas.toDataURL('image/png');
}

export const notices = new Notices();
