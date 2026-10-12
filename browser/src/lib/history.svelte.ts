// History: the sites you've been to, kept in this browser and listed at biggle://history.
// Built-in pages aren't kept, and neither are previews of sites waiting for approval.

export type Visit = { url: string; title: string; at: number };

const KEY = 'biggle:history';
const MAX = 1500;
const KEEP_MS = 90 * 24 * 60 * 60 * 1000;
// Coming back to the same page this soon (a reload, say) updates the last visit instead.
const SAME_VISIT_MS = 60 * 1000;

function load(): Visit[] {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    const since = Date.now() - KEEP_MS;
    return Array.isArray(saved)
      ? saved.filter((v): v is Visit => !!v && typeof v.url === 'string' && typeof v.title === 'string' && typeof v.at === 'number' && v.at > since)
      : [];
  } catch {
    return [];
  }
}

class PageHistory {
  /** Newest first. */
  visits = $state<Visit[]>(load());

  add(url: string, title: string) {
    const last = this.visits.find((v) => v.url === url);
    if (last && Date.now() - last.at < SAME_VISIT_MS) {
      last.at = Date.now();
      if (title) last.title = title;
      this.visits = [last, ...this.visits.filter((v) => v !== last)];
    } else {
      this.visits = [{ url, title, at: Date.now() }, ...this.visits].slice(0, MAX);
    }
    this.save();
  }

  /** The page's title arrived after it loaded. */
  retitle(url: string, title: string) {
    const last = this.visits.find((v) => v.url === url);
    if (!last || !title || last.title === title || Date.now() - last.at > 10 * 60 * 1000) return;
    last.title = title;
    this.save();
  }

  remove(visit: Visit) {
    this.visits = this.visits.filter((v) => v !== visit);
    this.save();
  }

  clear() {
    this.visits = [];
    this.save();
  }

  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.visits));
    } catch {}
  }
}

export const pageHistory = new PageHistory();
