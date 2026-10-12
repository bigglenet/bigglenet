// How the browser itself looks: light, dark or the same as the computer, and a colour theme.
// The new tab page has its own backdrops (startpage.svelte.ts).

const KEY = 'biggle:theme';

export type Appearance = 'system' | 'light' | 'dark';
export type ThemeId = 'classic' | 'ocean' | 'forest' | 'sunset' | 'candy' | 'lavender' | 'midnight';

/** Each theme's accent colour, in light and dark. Classic is Bigglenet's cream and charcoal. */
export const THEMES: { id: ThemeId; name: string; light: string | null; dark: string | null }[] = [
  { id: 'classic', name: 'Classic', light: null, dark: null },
  { id: 'ocean', name: 'Ocean', light: '#2563eb', dark: '#6ea2ff' },
  { id: 'forest', name: 'Forest', light: '#2d7a55', dark: '#5ccf8a' },
  { id: 'sunset', name: 'Sunset', light: '#e0582f', dark: '#ff8a65' },
  { id: 'candy', name: 'Candy', light: '#d6336c', dark: '#f06595' },
  { id: 'lavender', name: 'Lavender', light: '#7048e8', dark: '#a78bfa' },
  { id: 'midnight', name: 'Midnight', light: '#1e3a5f', dark: '#93c5fd' },
];

function load(): { appearance: Appearance; theme: ThemeId } {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return {
      appearance: ['system', 'light', 'dark'].includes(saved?.appearance) ? saved.appearance : 'system',
      theme: THEMES.some((th) => th.id === saved?.theme) ? saved.theme : 'classic',
    };
  } catch {
    return { appearance: 'system', theme: 'classic' };
  }
}

class Theme {
  #saved = load();
  appearance = $state<Appearance>(this.#saved.appearance);
  theme = $state<ThemeId>(this.#saved.theme);

  /** Put the look on the page. Called at startup and after each change. */
  apply() {
    const root = document.documentElement;
    if (this.appearance === 'system') delete root.dataset.appearance;
    else root.dataset.appearance = this.appearance;
    const th = THEMES.find((x) => x.id === this.theme)!;
    const dark = this.appearance === 'dark' || (this.appearance === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    const accent = dark ? th.dark : th.light;
    if (accent) {
      root.style.setProperty('--accent', accent);
      root.style.setProperty('--accent-soft', `color-mix(in srgb, ${accent} 16%, transparent)`);
      root.style.setProperty('--on-accent', dark ? '#111' : '#fff');
    } else {
      for (const v of ['--accent', '--accent-soft', '--on-accent']) root.style.removeProperty(v);
    }
  }

  set(change: { appearance?: Appearance; theme?: ThemeId }) {
    if (change.appearance) this.appearance = change.appearance;
    if (change.theme) this.theme = change.theme;
    try {
      localStorage.setItem(KEY, JSON.stringify({ appearance: this.appearance, theme: this.theme }));
    } catch {}
    this.apply();
  }
}

export const theme = new Theme();
if (typeof window !== 'undefined') {
  theme.apply();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => theme.apply());
}
