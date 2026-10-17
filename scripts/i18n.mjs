// Lists the browser's texts that have no Turkish yet: everything passed to t() or plural() as
// written text, and the lists of names that are translated where they're shown. Run it with
// `npm run i18n`, then add what it prints to browser/src/lib/locales/tr.ts.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('../browser/src/', import.meta.url));
const STR = String.raw`'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|\x60((?:[^\x60\\$]|\\.|\$(?!\{))*)\x60`;
const unquote = (m, from = 1) => {
  for (let i = from; i < from + 3; i++) if (m[i] !== undefined) return m[i].replace(/\\(['"\x60\\])/g, '$1').replace(/\\n/g, '\n');
  return null;
};
const T_CALL = new RegExp(String.raw`(?<![\w.$])t\(\s*(?:${STR})\s*[,)]`, 'g');
const PLURAL = new RegExp(String.raw`(?<![\w.$])plural\((?:[^,()]|\([^()]*\))+,\s*(?:${STR})\s*,\s*(?:${STR})\s*\)`, 'g');
const LITERAL = new RegExp(STR, 'g');

// Lists whose names go through t() where they're shown: [file, how the list starts].
const LISTS = [
  ['lib/easysite.ts', 'export const BLOCK_NAMES'],
  ['lib/easysite.ts', 'export const THEMES'],
  ['lib/easysite.ts', 'export const FONTS'],
  ['lib/startpage.svelte.ts', 'export const SECTIONS'],
  ['lib/startpage.svelte.ts', 'export const BACKDROPS'],
  ['lib/theme.svelte.ts', 'export const THEMES'],
  ['lib/discover.ts', 'const TAG_NAMES'],
  ['lib/discover.ts', 'const LABEL_NAMES'],
  ['lib/changelog.ts', 'export const CHANGELOG'],
  ['lib/chatevents.ts', 'const EVENTS'],
  ['lib/pagewords.ts', 'export const PAGE_WORDS'],
  ['components/ReportDialog.svelte', 'const REASONS'],
  ['components/community/EventsPage.svelte', 'const WHO_LABEL'],
  ['components/community/EventsPage.svelte', "{#each [['going'"],
  ['components/community/FeedPage.svelte', 'const places'],
  ['components/NoxPage.svelte', 'const ORDERS'],
  ['components/SiteInfo.svelte', 'const NAMES'],
  ['components/SiteSettingsList.svelte', 'const NAMES'],
  ['components/DownloadsPage.svelte', 'const STATE'],
  ['components/AdminPages.svelte', 'const STATUS'],
  ['components/AdminPages.svelte', 'const HOW'],
  ['components/AdminPages.svelte', "{#each [['all'"],
  ['components/SitesPage.svelte', 'const STATUS'],
  ['components/RequestsPage.svelte', 'const STATUS'],
  ['components/RequestsPage.svelte', "{#each [['all'"],
  ['components/SettingsPage.svelte', 'const UPDATE_TEXT'],
  ['components/SettingsPage.svelte', "{#each [['system'"],
  ['../../server/src/board.ts', 'const BOARDS'],
  ['lib/badges.ts', 'export const BADGE_INFO'],
  ['components/chat/ChatComposer.svelte', 'const GAMES'],
];
const SKIP_KEYS = new Set(['id', 'href', 'icon', 'color', 'bg', 'accent', 'stack', 'light', 'dark', 'version', 'date', 'emoji', 'page']);

const texts = new Map();
const add = (text, file) => text.trim() && (texts.get(text) ?? texts.set(text, new Set()).get(text)).add(file);

const walk = (dir) => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? walk(join(dir, name)) : [join(dir, name)]));
for (const file of walk(src)) {
  if (!/\.(svelte|ts)$/.test(file) || file.includes('/locales/')) continue;
  const code = readFileSync(file, 'utf8');
  const rel = relative(src, file);
  for (const m of code.matchAll(T_CALL)) add(unquote(m), rel);
  for (const m of code.matchAll(PLURAL)) [unquote(m, 1), unquote(m, 4)].forEach((s) => s && add(s, rel));
}

for (const [file, start] of LISTS) {
  const code = readFileSync(join(src, file), 'utf8');
  let i = code.indexOf(start);
  if (i < 0) throw new Error(`${file}: can't find ${start}`);
  if (!start.startsWith('{#each')) i = code.indexOf('=', i) + 1; // past any type
  let depth = 0;
  let j = i;
  for (let opened = false; j < code.length; j++) {
    if ('[{('.includes(code[j])) (depth++, (opened = true));
    else if (']})'.includes(code[j])) depth--;
    if (opened && depth === 0) break;
  }
  let block = code.slice(i, j + 1);
  if (start.includes('CHANGELOG')) block = (block.match(/changes:\s*\[[\s\S]*?\]/g) ?? []).join('\n');
  for (const m of block.matchAll(LITERAL)) {
    const text = unquote(m);
    const key = block.slice(0, m.index).trimEnd().match(/(\w+)\s*:$/);
    if (key && SKIP_KEYS.has(key[1])) continue;
    // Page tags' words are all shown as they are; elsewhere, only things that read like text.
    if (text && (start.includes('PAGE_WORDS') || /^[A-Z]/.test(text) || text.includes(' ')) && !text.startsWith('#')) add(text, file);
  }
}

// The Turkish list, read as the object it is.
const trSource = readFileSync(join(src, 'lib/locales/tr.ts'), 'utf8');
const tr = Function(`return ${trSource.slice(trSource.indexOf('{', trSource.indexOf('= {')), trSource.lastIndexOf('};') + 1)}`)();
const placeholders = (s) => (s.match(/\{\w+\}/g) ?? []).sort().join();

// Addresses and examples that read the same in every language.
const SAME = /^(\.?[\w-]*\.(biggle|b|bhtml)(\/[\w-]*)?|https?:\/\/\S+|yourname)$/;
const missing = [...texts.keys()].filter((text) => !(text in tr) && !SAME.test(text));
const wrong = Object.entries(tr).filter(([en, out]) => placeholders(en) !== placeholders(out));
const unused = Object.keys(tr).filter((text) => !texts.has(text));

for (const text of missing) console.log(`missing: ${JSON.stringify(text)}  (${[...texts.get(text)].join(', ')})`);
for (const [en, out] of wrong) console.log(`placeholders differ: ${JSON.stringify(en)} → ${JSON.stringify(out)}`);
for (const text of unused) console.log(`not used any more: ${JSON.stringify(text)}`);
console.log(`${texts.size} texts, ${missing.length} without Turkish.`);
process.exitCode = missing.length || wrong.length ? 1 : 0;
