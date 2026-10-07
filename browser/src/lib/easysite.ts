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
  | { id: string; type: 'counter' };

export type BlockType = Block['type'];

export type EasySite = {
  version: 1;
  emoji: string;
  title: string;
  tagline: string;
  theme: Theme;
  font: Font;
  blocks: Block[];
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
};

export const newId = () => Math.random().toString(36).slice(2, 10);

export function newBlock(type: BlockType): Block {
  const id = newId();
  switch (type) {
    case 'heading':
      return { id, type, text: 'A new section' };
    case 'text':
      return { id, type, text: 'Write something here.' };
    case 'image':
      return { id, type, src: '', alt: '' };
    case 'button':
      return { id, type, label: 'Visit hello.biggle', url: 'hello.biggle' };
    default:
      return { id, type } as Block;
  }
}

export function starterSite(title: string, theme: Theme): EasySite {
  return {
    version: 1,
    emoji: '👋',
    title,
    tagline: 'Welcome to my corner of the Bigglenet.',
    theme,
    font: 'sans',
    blocks: [
      { id: newId(), type: 'greeting' },
      { id: newId(), type: 'text', text: 'This is my site. I made it with the Biggle site editor.\nChange anything here, add pictures and buttons, and pick a look you like.' },
      { id: newId(), type: 'button', label: 'Explore the Bigglenet', url: 'home.biggle' },
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
      return `<a class="button" href="${esc(linkTarget(b.url))}">${esc(b.label || 'Link')}</a>`;
    case 'divider':
      return '<hr>';
    case 'greeting':
      return '<p class="greeting">Hi, <biggle-me>there</biggle-me>! Thanks for stopping by.</p>';
    case 'counter':
      return `<p class="counter">You've been here <strong data-visits>1</strong> <span data-times>time</span>.</p>`;
  }
}

export function renderIndex(site: EasySite): string {
  const counter = site.blocks.some((b) => b.type === 'counter');
  return `<!bhtml 1>
<!-- Made with the Biggle site editor. It rewrites this file when you change the site there. -->
<html lang="en">
<head>
  <title>${esc(site.title)}</title>
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
      document.querySelectorAll('[data-times]').forEach((el) => (el.textContent = visits === 1 ? 'time' : 'times'));
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
  background-attachment: fixed;
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
  backdrop-filter: blur(12px);
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
