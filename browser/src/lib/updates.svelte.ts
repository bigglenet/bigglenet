// Keeps Bigglenet up to date.
// Desktop app: finds and downloads new releases in the background, then offers a restart.
// Web app: notices a new deploy and offers a reload.
// Either way it checks now and then, and whenever someone asks (Settings, or the Mac menu).
import { desktop } from './platform';

const CHECK_EVERY = 6 * 60 * 60 * 1000;
// The version this browser last ran, to say "Bigglenet is now 0.4.2" once after an update.
const LAST_VERSION = 'biggle:version';

export type UpdateStatus = 'idle' | 'checking' | 'downloading' | 'ready' | 'current' | 'failed';

class Updates {
  /** This version. */
  readonly current = __APP_VERSION__;
  status = $state<UpdateStatus>('idle');
  /** The newer version, when we know it. */
  version = $state<string | null>(null);
  error = $state('');
  installing = $state(false);
  dismissed = $state(false);
  /** Just updated to this version (shown once). */
  justUpdated = $state<string | null>(null);

  /** A new version is downloaded (desktop) or deployed (web) and ready to use. */
  get ready() {
    return this.status === 'ready';
  }

  start() {
    try {
      const last = localStorage.getItem(LAST_VERSION);
      if (last && last !== this.current) this.justUpdated = this.current;
      localStorage.setItem(LAST_VERSION, this.current);
    } catch {}
    this.check();
    setInterval(() => this.check(), CHECK_EVERY);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.check();
    });
  }

  /** Look for a newer version. `asked`: someone pressed "Check for updates", so say what happened. */
  async check(asked = false) {
    if (this.status === 'ready' || this.status === 'checking' || this.status === 'downloading') {
      if (asked) this.dismissed = false;
      return;
    }
    this.status = 'checking';
    this.error = '';
    try {
      if (desktop) await this.checkApp();
      else await this.checkWeb();
      if (asked) this.dismissed = false;
    } catch (e) {
      // Offline, or the release isn't there yet. Try again later.
      this.status = asked ? 'failed' : 'idle';
      this.error = e instanceof Error ? e.message : 'Couldn’t check for updates.';
    }
  }

  private async checkApp() {
    const found = await desktop!.updates.check();
    if (!found) {
      this.status = 'current';
      return;
    }
    this.version = found.version;
    if (!found.downloaded) {
      // Download it now, and check it's signed by Bigglenet, before offering it.
      this.status = 'downloading';
      await desktop!.updates.download();
    }
    this.status = 'ready';
  }

  private async checkWeb() {
    if (!import.meta.env.PROD) {
      this.status = 'current';
      return;
    }
    const res = await fetch('/version.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('Couldn’t reach the Bigglenet.');
    const { build, version } = await res.json();
    if (build && build !== __BUILD_ID__) {
      this.version = typeof version === 'string' && version !== this.current ? version : null;
      this.status = 'ready';
    } else {
      this.status = 'current';
    }
  }

  async apply() {
    this.installing = true;
    try {
      if (desktop) await desktop.updates.install();
      else location.reload();
    } catch (e) {
      this.installing = false;
      this.status = 'failed';
      this.error = e instanceof Error ? e.message : 'The update couldn’t be installed.';
    }
  }
}

export const updates = new Updates();
