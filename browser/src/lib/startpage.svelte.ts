// How the new tab page looks and what new tabs open, kept in this browser. Change them from the
// start page's Customize button. biggle://start always shows the start page, whatever's set.
import { START, fromInput } from './url';

export type Section = 'clock' | 'search' | 'shortcuts' | 'featured' | 'sites';
export type Shortcut = { name: string; url: string };
export type Backdrop = 'plain' | 'sunset' | 'ocean' | 'forest' | 'candy' | 'lavender';

export const SECTIONS: { id: Section; label: string }[] = [
  { id: 'clock', label: 'Clock and greeting' },
  { id: 'search', label: 'Search box' },
  { id: 'shortcuts', label: 'My shortcuts' },
  { id: 'featured', label: 'home.biggle and "Make your own site"' },
  { id: 'sites', label: 'Sites on the Bigglenet' },
];

/** Each backdrop is a colour washed over the page's own background, so it suits light and dark. */
export const BACKDROPS: { id: Backdrop; name: string; color: string | null }[] = [
  { id: 'plain', name: 'Plain', color: null },
  { id: 'sunset', name: 'Sunset', color: '#ff7a59' },
  { id: 'ocean', name: 'Ocean', color: '#3b82f6' },
  { id: 'forest', name: 'Forest', color: '#2f9e6b' },
  { id: 'candy', name: 'Candy', color: '#e64998' },
  { id: 'lavender', name: 'Lavender', color: '#8b6cf0' },
];

export const MAX_SHORTCUTS = 12;
const KEY = 'biggle:start';

type Saved = { newTab: string | null; shown: Record<Section, boolean>; shortcuts: Shortcut[]; backdrop: Backdrop };

const DEFAULTS: Saved = {
  newTab: null,
  shown: { clock: false, search: true, shortcuts: true, featured: true, sites: true },
  shortcuts: [],
  backdrop: 'plain',
};

function load(): Saved {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Saved> | null;
    return {
      newTab: typeof saved?.newTab === 'string' ? saved.newTab : null,
      shown: { ...DEFAULTS.shown, ...saved?.shown },
      shortcuts: Array.isArray(saved?.shortcuts) ? saved.shortcuts.filter((s) => s && typeof s.url === 'string') : [],
      backdrop: BACKDROPS.some((b) => b.id === saved?.backdrop) ? saved!.backdrop! : 'plain',
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

/** Turn what someone typed ("stix", "home.biggle", "biggle://nox") into a Bigglenet address, or null. */
export function toAddress(text: string): string | null {
  const target = fromInput(text);
  return target?.kind === 'biggle' ? target.href : null;
}

class StartSettings {
  #saved = load();
  /** The address new tabs open, or null for the start page. */
  newTab = $state(this.#saved.newTab);
  shown = $state(this.#saved.shown);
  shortcuts = $state(this.#saved.shortcuts);
  backdrop = $state(this.#saved.backdrop);

  /** What a new tab opens. */
  get newTabAddress(): string {
    return this.newTab ?? START;
  }

  save() {
    const saved: Saved = { newTab: this.newTab, shown: this.shown, shortcuts: this.shortcuts, backdrop: this.backdrop };
    try {
      localStorage.setItem(KEY, JSON.stringify(saved));
    } catch {}
  }

  reset() {
    this.newTab = DEFAULTS.newTab;
    this.shown = { ...DEFAULTS.shown };
    this.shortcuts = [];
    this.backdrop = DEFAULTS.backdrop;
    this.save();
  }
}

export const startSettings = new StartSettings();
