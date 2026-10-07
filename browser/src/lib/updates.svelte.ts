// Keeps Bigglenet up to date.
// Desktop app: downloads new releases in the background, then offers a restart.
// Web app: notices a new deploy and offers a reload.
import type { Update } from '@tauri-apps/plugin-updater';
import { isApp } from './platform';

const CHECK_EVERY = 6 * 60 * 60 * 1000;

class Updates {
  /** A new version is downloaded (desktop) or deployed (web) and ready to use. */
  ready = $state(false);
  /** The new version number, when we know it. */
  version = $state<string | null>(null);
  installing = $state(false);
  dismissed = $state(false);

  private pending: Update | null = null;
  private checking = false;

  start() {
    this.check();
    setInterval(() => this.check(), CHECK_EVERY);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.check();
    });
  }

  async check() {
    if (this.ready || this.checking) return;
    this.checking = true;
    try {
      if (isApp) await this.checkApp();
      else await this.checkWeb();
    } catch {
      // Offline, or the release isn't there yet. Try again later.
    } finally {
      this.checking = false;
    }
  }

  private async checkApp() {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();
    if (!update) return;
    await update.download();
    this.pending = update;
    this.version = update.version;
    this.ready = true;
  }

  private async checkWeb() {
    if (!import.meta.env.PROD) return;
    const res = await fetch('/version.json', { cache: 'no-store' });
    if (!res.ok) return;
    const { build } = await res.json();
    if (build && build !== __BUILD_ID__) this.ready = true;
  }

  async apply() {
    this.installing = true;
    if (this.pending) {
      await this.pending.install();
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } else {
      location.reload();
    }
  }
}

export const updates = new Updates();
