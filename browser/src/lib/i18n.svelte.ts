// Languages: English, and Turkish (locales/tr.ts). Text is written in English and passed through
// t(); the Turkish list maps each English text to its translation. Anything not translated yet
// shows in English. English is the default; pick Turkish (or "Same as this device") in
// Settings → Language.
import { registerSync, syncChanged } from './sync.svelte';

export type Lang = 'en' | 'tr';
export type LangChoice = 'system' | Lang;

const KEY = 'biggle:lang';
// Turkish is only downloaded for people who use it (see languageReady).
const DICTIONARIES: Record<Lang, Record<string, string>> = { en: {}, tr: {} };

async function loadLanguage(lang: Lang) {
  if (lang === 'tr' && !Object.keys(DICTIONARIES.tr).length) DICTIONARIES.tr = (await import('./locales/tr')).default;
}

function systemLang(): Lang {
  return (navigator.languages ?? [navigator.language]).some((l) => /^tr\b/i.test(l)) ? 'tr' : 'en';
}

function loadChoice(): LangChoice {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === 'en' || saved === 'tr' || saved === 'system' ? saved : 'en';
  } catch {
    return 'en';
  }
}

class I18n {
  choice = $state<LangChoice>(loadChoice());
  /** The language in use. */
  lang = $derived<Lang>(this.choice === 'system' ? systemLang() : this.choice);
  /** For dates and numbers. */
  locale = $derived(this.lang === 'tr' ? 'tr-TR' : undefined);

  async set(choice: LangChoice) {
    await loadLanguage(choice === 'system' ? systemLang() : choice);
    this.choice = choice;
    try {
      // English unless someone picks otherwise.
      if (choice === 'en') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, choice);
    } catch {}
    document.documentElement.lang = this.lang;
    syncChanged('settings');
  }
}

export const i18n = new I18n();
/** Settles once the language in use can be shown; the app waits for it before it starts. */
export const languageReady = loadLanguage(i18n.lang).catch(() => {});

registerSync('settings', 'language', {
  get: () => i18n.choice,
  set: (data) => {
    if (data === 'system' || data === 'en' || data === 'tr') i18n.set(data);
  },
});
if (typeof document !== 'undefined') document.documentElement.lang = i18n.lang;

/**
 * Text in the visitor's language. `{name}` in the text is filled from `params`:
 * t('Hi, {name}!', { name: 'ethem' }).
 */
export function t(text: string, params?: Record<string, string | number | null | undefined>): string {
  const out = DICTIONARIES[i18n.lang][text] ?? text;
  return params ? out.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k] ?? '') : m)) : out;
}

/** "1 visit" / "3 visits" (Turkish doesn't change the word after a number). */
export function plural(n: number, one: string, many: string): string {
  return t(n === 1 ? one : many, { n: n.toLocaleString(i18n.locale) });
}
