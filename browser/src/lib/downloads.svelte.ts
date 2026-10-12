// Downloads in the desktop app (desktop/main/downloads.js): the list, kept up to date as files
// come in.
import { desktop, type Download } from './platform';

class Downloads {
  list = $state<Download[]>([]);

  /** Downloading right now. */
  get active(): Download[] {
    return this.list.filter((d) => d.state === 'progressing');
  }

  start() {
    if (!desktop) return;
    desktop.downloads.list().then((l) => (this.list = l));
    desktop.downloads.onUpdate((d) => {
      const i = this.list.findIndex((x) => x.id === d.id);
      if (i === -1) this.list = [d, ...this.list];
      else this.list[i] = d;
    });
  }

  /** Download a file (desktop app), or let the web browser do it. */
  get(url: string) {
    if (desktop) desktop.downloads.start(url);
    else window.open(url, '_blank', 'noopener');
  }

  open = (id: number) => desktop?.downloads.open(id);
  show = (id: number) => desktop?.downloads.show(id);
  pause = (id: number) => desktop?.downloads.pause(id);
  resume = (id: number) => desktop?.downloads.resume(id);
  cancel = (id: number) => desktop?.downloads.cancel(id);

  async forget(id: number) {
    if (desktop) this.list = await desktop.downloads.forget(id);
  }

  async clear() {
    if (desktop) this.list = await desktop.downloads.forget();
  }
}

export const downloads = new Downloads();
