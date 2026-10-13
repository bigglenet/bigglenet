import { i18n, t } from './i18n.svelte';
// The easy editor's sites: a list of blocks and a look, saved as site.json and turned into
// index.bhtml and style.css whenever they change.

export type Theme = 'sunset' | 'ocean' | 'forest' | 'candy' | 'night' | 'paper';
export type Font = 'sans' | 'serif' | 'round' | 'mono';

export type Block =
  | { id: string; type: 'heading'; text: string }
  | { id: string; type: 'text'; text: string }
  | { id: string; type: 'image'; src: string; alt: string }
  | { id: string; type: 'button'; label: string; url: string }
  | { id: string; type: 'divider' }
  | { id: string; type: 'greeting' }
  | { id: string; type: 'counter' }
  | { id: string; type: 'visits' }
  | { id: string; type: 'guestbook' }
  | { id: string; type: 'poll'; question: string; options: string[] }
  | { id: string; type: 'comments' }
  | { id: string; type: 'like' }
  | { id: string; type: 'wall' }
  | { id: string; type: 'contact' }
  | { id: string; type: 'leaderboard'; board: string; title: string }
  | { id: string; type: 'online' }
  | { id: string; type: 'newsites' }
  | { id: string; type: 'embed'; url: string }
  | { id: string; type: 'webring'; ring: number | null };

export type BlockType = Block['type'];

export type EasySite = {
  version: 1;
  emoji: string;
  title: string;
  tagline: string;
  theme: Theme;
  font: Font;
  blocks: Block[];
  /** What a link to the site shows in chats: a line about it, and a picture (a file in the site). */
  description?: string;
  previewImage?: string;
  /** The tab's icon: a picture in the site, or (when empty) the emoji. */
  icon?: string;
};

export const THEMES: { id: Theme; name: string; bg: string; accent: string; dark?: boolean }[] = [
  { id: 'sunset', name: 'Sunset', bg: 'linear-gradient(135deg, #ffe8d6, #ffb199)', accent: '#ff5e3a' },
  { id: 'ocean', name: 'Ocean', bg: 'linear-gradient(135deg, #dff4ff, #a6c1ee)', accent: '#2563eb' },
  { id: 'forest', name: 'Forest', bg: 'linear-gradient(135deg, #e8f5e9, #b7e4c7)', accent: '#2d6a4f' },
  { id: 'candy', name: 'Candy', bg: 'linear-gradient(135deg, #ffe0f4, #dbe4ff)', accent: '#d6336c' },
  { id: 'night', name: 'Night', bg: 'linear-gradient(135deg, #1f1c2c, #3d2f63)', accent: '#b197fc', dark: true },
  { id: 'paper', name: 'Paper', bg: '#f6f4f0', accent: '#222222' },
];

export const FONTS: { id: Font; name: string; stack: string }[] = [
  { id: 'sans', name: 'Clean', stack: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif' },
  { id: 'serif', name: 'Classic', stack: 'ui-serif, Georgia, "Times New Roman", serif' },
  { id: 'round', name: 'Friendly', stack: 'ui-rounded, "SF Pro Rounded", "Nunito", system-ui, sans-serif' },
  { id: 'mono', name: 'Techy', stack: 'ui-monospace, "SF Mono", Menlo, monospace' },
];

export const BLOCK_NAMES: Record<BlockType, string> = {
  heading: 'Heading',
  text: 'Text',
  image: 'Image',
  button: 'Button',
  divider: 'Divider',
  greeting: 'Greeting',
  counter: 'Visit counter',
  visits: 'Total visits',
  guestbook: 'Guestbook',
  poll: 'Poll',
  comments: 'Comments',
  like: 'Like button',
  wall: 'Drawing wall',
  contact: 'Contact button',
  leaderboard: 'Leaderboard',
  online: 'People online',
  newsites: 'Newest sites',
  embed: 'Another page',
  webring: 'Webring',
};

export const newId = () => Math.random().toString(36).slice(2, 10);

export function newBlock(type: BlockType): Block {
  const id = newId();
  switch (type) {
    case 'heading':
      return { id, type, text: t('A new section') };
    case 'text':
      return { id, type, text: t('Write something here.') };
    case 'image':
      return { id, type, src: '', alt: '' };
    case 'button':
      return { id, type, label: t('Visit hello.biggle'), url: 'hello.biggle' };
    case 'poll':
      return { id, type, question: t('What should I make next?'), options: ['A game', 'A blog', 'Art'] };
    case 'leaderboard':
      return { id, type, board: 'main', title: t('High scores') };
    case 'embed':
      return { id, type, url: 'hello.biggle' };
    case 'webring':
      return { id, type, ring: null };
    default:
      return { id, type } as Block;
  }
}

export function starterSite(title: string, theme: Theme): EasySite {
  return {
    version: 1,
    emoji: '👋',
    title,
    tagline: t('Welcome to my corner of the Bigglenet.'),
    theme,
    font: 'sans',
    blocks: [
      { id: newId(), type: 'greeting' },
      { id: newId(), type: 'text', text: t('This is my site. I made it with the Biggle site editor.\nChange anything here, add pictures and buttons, and pick a look you like.') },
      { id: newId(), type: 'button', label: t('Explore the Bigglenet'), url: 'home.biggle' },
      { id: newId(), type: 'counter' },
    ],
  };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Turn what someone typed into a link: "hello.biggle", "biggle://…", "https://…" or a page. */
export function linkTarget(raw: string): string {
  const url = raw.trim();
  if (!url) return '#';
  if (/^(biggle|https?):\/\//i.test(url) || /^mailto:/i.test(url)) return url;
  if (/^[a-z0-9-]+\.biggle(\/.*)?$/i.test(url)) return `biggle://${url}${url.includes('/') ? '' : '/'}`;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(url)) return `https://${url}`;
  return url;
}

function block(b: Block): string {
  switch (b.type) {
    case 'heading':
      return `<h2>${esc(b.text)}</h2>`;
    case 'text':
      return `<p>${esc(b.text).replace(/\n/g, '<br>')}</p>`;
    case 'image':
      return b.src ? `<img src="${esc(b.src)}" alt="${esc(b.alt)}">` : '';
    case 'button':
      return `<a class="button" href="${esc(linkTarget(b.url))}">${esc(b.label || t('Link'))}</a>`;
    case 'divider':
      return '<hr>';
    case 'greeting':
      // In the language of whoever made the site; the parts in braces are filled in here.
      return `<p class="greeting">${esc(t('Hi, {name}! Thanks for stopping by.')).replace('{name}', `<biggle-me>${esc(t('there'))}</biggle-me>`)}</p>`;
    case 'counter':
      return `<p class="counter">${esc(t('You’ve been here {count} {times}.'))
        .replace('{count}', '<strong data-visits>1</strong>')
        .replace('{times}', `<span data-times>${esc(t('time'))}</span>`)}</p>`;
    case 'visits':
      return `<p class="counter">${esc(t('Visits so far: {count}')).replace('{count}', '<strong><biggle-visits></biggle-visits></strong>')}</p>`;
    case 'guestbook':
      return '<biggle-guestbook></biggle-guestbook>';
    case 'poll': {
      const options = b.options.map((o) => o.replace(/\|/g, '/').trim()).filter(Boolean);
      return options.length >= 2 ? `<biggle-poll id="poll-${b.id}" question="${esc(b.question)}" options="${esc(options.join('|'))}"></biggle-poll>` : '';
    }
    case 'comments':
      return '<biggle-comments></biggle-comments>';
    case 'like':
      return '<p class="center"><biggle-like></biggle-like></p>';
    case 'wall':
      return `<biggle-wall id="wall-${b.id}"></biggle-wall>`;
    case 'contact':
      return '<p class="center"><biggle-contact></biggle-contact></p>';
    case 'leaderboard':
      return `<biggle-leaderboard board="${esc(b.board.replace(/[^a-z0-9_-]/gi, '') || 'main')}" heading="${esc(b.title)}"></biggle-leaderboard>`;
    case 'online':
      return `<p class="counter">${esc(t('On the Bigglenet right now: {count}')).replace('{count}', '<strong><biggle-online></biggle-online></strong>')}</p>`;
    case 'newsites':
      return `<h2>${esc(t('New on the Bigglenet'))}</h2><biggle-new-sites></biggle-new-sites>`;
    case 'embed': {
      const target = linkTarget(b.url);
      return target.startsWith('biggle://') ? `<biggle-embed src="${esc(target)}"></biggle-embed>` : '';
    }
    case 'webring':
      return b.ring ? `<biggle-webring ring="${Math.floor(b.ring)}"></biggle-webring>` : '';
  }
}

export function renderIndex(site: EasySite): string {
  const counter = site.blocks.some((b) => b.type === 'counter');
  return `<!bhtml 1>
<!-- Made with the Biggle site editor. It rewrites this file when you change the site there. -->
<html lang="${i18n.lang}">
<head>
  <title>${esc(site.title)}</title>
  ${site.description ? `<meta name="description" content="${esc(site.description)}">` : ''}
  ${site.previewImage ? `<meta property="og:image" content="${esc(site.previewImage)}">` : ''}
  <link rel="icon" href="${esc(site.icon || emojiIcon(site.emoji))}">
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <main class="page">
    <header>
      ${site.emoji ? `<div class="emoji">${esc(site.emoji)}</div>` : ''}
      <h1>${esc(site.title)}</h1>
      ${site.tagline ? `<p class="tagline">${esc(site.tagline)}</p>` : ''}
    </header>
    ${site.blocks.map(block).filter(Boolean).join('\n    ')}
  </main>
  <footer>Made on the Bigglenet</footer>${
    counter
      ? `
  <script>
    biggle.storage.get('visits').then(async (n) => {
      const visits = (n ?? 0) + 1;
      await biggle.storage.set('visits', visits);
      document.querySelectorAll('[data-visits]').forEach((el) => (el.textContent = visits));
      document.querySelectorAll('[data-times]').forEach((el) => (el.textContent = visits === 1 ? ${JSON.stringify(t('time'))} : ${JSON.stringify(t('times'))}));
    });
  </script>`
      : ''
  }
</body>
</html>
`;
}

export function renderStyle(site: EasySite): string {
  const theme = THEMES.find((t) => t.id === site.theme) ?? THEMES[0];
  const font = FONTS.find((f) => f.id === site.font) ?? FONTS[0];
  const dark = !!theme.dark;
  return `/* Made with the Biggle site editor. It rewrites this file when you change the site there. */
:root {
  --bg: ${theme.bg};
  --accent: ${theme.accent};
  --card: ${dark ? 'rgba(20, 16, 34, 0.72)' : 'rgba(255, 255, 255, 0.82)'};
  --ink: ${dark ? '#f3f0ff' : '#211d1a'};
  --muted: ${dark ? '#c4bde0' : '#5f5a54'};
  --line: ${dark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)'};
  color-scheme: ${dark ? 'dark' : 'light'};
  font-family: ${font.stack};
  line-height: 1.6;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  padding: 48px 18px 32px;
  background: var(--bg);
  color: var(--ink);
}
.page {
  max-width: 600px;
  margin: 0 auto;
  padding: 36px 32px;
  border-radius: 28px;
  background: var(--card);
  border: 1px solid var(--line);
  box-shadow: 0 30px 70px -40px rgba(0, 0, 0, 0.45);
}
header { text-align: center; margin-bottom: 24px; }
.emoji { font-size: 64px; line-height: 1; margin-bottom: 12px; }
h1 { margin: 0; font-size: 2.4rem; line-height: 1.1; letter-spacing: -0.03em; }
.tagline { margin: 10px 0 0; color: var(--muted); font-size: 1.1rem; }
h2 { margin: 28px 0 8px; font-size: 1.4rem; letter-spacing: -0.02em; }
p { margin: 0 0 14px; font-size: 1.05rem; }
img { display: block; max-width: 100%; margin: 18px auto; border-radius: 18px; }
hr { border: 0; height: 1px; margin: 26px 0; background: var(--line); }
a { color: var(--accent); }
.button {
  display: block;
  margin: 12px 0;
  padding: 15px 18px;
  border-radius: 16px;
  background: var(--accent);
  color: ${dark ? '#1b1530' : '#ffffff'};
  font-weight: 700;
  text-align: center;
  text-decoration: none;
  transition: transform 0.15s;
}
.button:hover { transform: translateY(-2px); }
.greeting {
  padding: 14px 18px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  font-weight: 600;
  text-align: center;
}
.counter { color: var(--muted); font-size: 0.95rem; text-align: center; }
.center { text-align: center; }
footer { margin-top: 24px; text-align: center; color: var(--muted); font-size: 0.85rem; }
`;
}

export function renderFiles(site: EasySite): Record<string, string> {
  return {
    'site.json': JSON.stringify(site, null, 2),
    'index.bhtml': renderIndex(site),
    'style.css': renderStyle(site),
  };
}

/** An emoji as a tab icon (a tiny picture made of the emoji). */
export function emojiIcon(emoji: string): string {
  const e = emoji || '👋';
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${e.replace(/[<&]/g, '')}</text></svg>`)}`;
}
