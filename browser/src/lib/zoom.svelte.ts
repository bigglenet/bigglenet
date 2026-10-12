// Page zoom (⌘+ / ⌘− / ⌘0, Ctrl on Windows and Linux), remembered per site like other browsers
// do: hello.biggle stays at 125% until you change it back.
import { parse, siteKey } from './url';

const KEY = 'biggle:zoom';
const LEVELS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];

function load(): Record<string, number> {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return Object.fromEntries(Object.entries(saved).filter(([, z]) => typeof z === 'number' && LEVELS.includes(z))) as Record<string, number>;
  } catch {
    return {};
  }
}

/** What a page's zoom is remembered under: the site, or the built-in page. */
export function zoomKey(url: string): string | null {
  const u = parse(url);
  if (!u) return null;
  return u.kind === 'site' ? siteKey(u) : `biggle://${u.page}`;
}

class Zoom {
  levels = $state<Record<string, number>>(load());

  /** A page's zoom: 1 is 100%. */
  of(url: string): number {
    const key = zoomKey(url);
    return (key && this.levels[key]) || 1;
  }

  /** One step bigger (1) or smaller (-1). */
  step(url: string, by: 1 | -1) {
    const i = LEVELS.indexOf(this.of(url));
    this.set(url, LEVELS[Math.min(LEVELS.length - 1, Math.max(0, i + by))]);
  }

  reset(url: string) {
    this.set(url, 1);
  }

  private set(url: string, zoom: number) {
    const key = zoomKey(url);
    if (!key) return;
    if (zoom === 1) delete this.levels[key];
    else this.levels[key] = zoom;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.levels));
    } catch {}
  }
}

export const zoom = new Zoom();

/** Styles that zoom an iframe's page: a smaller (or bigger) viewport, scaled to fill the tab. */
export function frameZoom(z: number): string {
  return z === 1 ? '' : `width:${100 / z}%;height:${100 / z}%;transform:scale(${z});transform-origin:0 0`;
}
