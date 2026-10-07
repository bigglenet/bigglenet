// Starter files for new sites made in the Biggle site editor.

export type Template = 'page' | 'blog' | 'blank';
export const TEMPLATES: Template[] = ['page', 'blog', 'blank'];

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const BASE_CSS = `:root {
  color-scheme: light dark;
  --bg: #fff8ef;
  --card: #ffffff;
  --ink: #23201c;
  --muted: #6f6a62;
  --accent: #ff6b4a;
  --line: #efe6da;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  line-height: 1.6;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #17151a;
    --card: #221f26;
    --ink: #f3efe9;
    --muted: #a8a19a;
    --accent: #ff8a6e;
    --line: #322d36;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  background: var(--bg);
  color: var(--ink);
}
a { color: var(--accent); }
`;

function page(title: string, about: string): Record<string, string> {
  const initial = esc((title.trim()[0] ?? '?').toUpperCase());
  return {
    'index.bhtml': `<!bhtml 1>
<html lang="en">
<head>
  <title>${esc(title)}</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <main class="card">
    <div class="avatar">${initial}</div>
    <h1>${esc(title)}</h1>
    <p class="about">${esc(about)}</p>

    <nav class="links">
      <a href="about.bhtml">More about me</a>
      <a href="biggle://home.biggle/">Explore the Bigglenet</a>
    </nav>

    <p class="hello">Hi <biggle-me>there</biggle-me>, thanks for stopping by.</p>
  </main>
</body>
</html>
`,
    'about.bhtml': `<!bhtml 1>
<html lang="en">
<head>
  <title>About · ${esc(title)}</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <main class="card">
    <p><a href="./">← Back</a></p>
    <h1>About me</h1>
    <p>Write anything you like here. Change this page in the Biggle site editor.</p>
    <ul>
      <li>Something I love</li>
      <li>Something I'm making</li>
      <li>Something I'm learning</li>
    </ul>
  </main>
</body>
</html>
`,
    'style.css': `${BASE_CSS}
body {
  display: grid;
  place-items: center;
  padding: 40px 20px;
  background:
    radial-gradient(circle at 15% 20%, color-mix(in srgb, var(--accent) 30%, transparent), transparent 40%),
    radial-gradient(circle at 85% 80%, color-mix(in srgb, #7b61ff 25%, transparent), transparent 45%),
    var(--bg);
}
.card {
  width: min(520px, 100%);
  padding: 36px;
  border-radius: 28px;
  background: var(--card);
  border: 1px solid var(--line);
  box-shadow: 0 30px 60px -30px rgb(0 0 0 / 0.35);
  text-align: center;
}
.card ul { text-align: left; }
.avatar {
  display: grid;
  place-items: center;
  width: 88px;
  height: 88px;
  margin: 0 auto 18px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--accent), #7b61ff);
  color: white;
  font-size: 40px;
  font-weight: 800;
}
h1 {
  margin: 0 0 8px;
  font-size: 2.2rem;
  letter-spacing: -0.03em;
}
.about {
  margin: 0 0 24px;
  color: var(--muted);
  font-size: 1.1rem;
}
.links {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.links a {
  display: block;
  padding: 14px;
  border-radius: 14px;
  background: var(--bg);
  border: 1px solid var(--line);
  color: var(--ink);
  font-weight: 600;
  text-decoration: none;
}
.links a:hover { border-color: var(--accent); }
.hello {
  margin: 24px 0 0;
  color: var(--muted);
  font-size: 0.9rem;
}
`,
  };
}

function blog(title: string, about: string): Record<string, string> {
  return {
    'index.bhtml': `<!bhtml 1>
<html lang="en">
<head>
  <title>${esc(title)}</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header>
    <h1>${esc(title)}</h1>
    <p>${esc(about)}</p>
  </header>
  <main>
    <article class="post-link">
      <a href="first-post.bhtml">
        <time>Today</time>
        <h2>My first post</h2>
        <p>Hello, Bigglenet! This is where it all begins.</p>
      </a>
    </article>
  </main>
  <footer>Made on the Bigglenet</footer>
</body>
</html>
`,
    'first-post.bhtml': `<!bhtml 1>
<html lang="en">
<head>
  <title>My first post · ${esc(title)}</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header>
    <p><a href="./">← ${esc(title)}</a></p>
  </header>
  <main class="post">
    <time>Today</time>
    <h1>My first post</h1>
    <p>Hello, <biggle-me>reader</biggle-me>! This is my first post on the Bigglenet.</p>
    <p>To write another one, make a new <code>.bhtml</code> file in the site editor and link to it from the home page.</p>
  </main>
</body>
</html>
`,
    'style.css': `${BASE_CSS}
body {
  max-width: 680px;
  margin: 0 auto;
  padding: 56px 20px;
}
header h1 {
  margin: 0;
  font-size: 2.6rem;
  letter-spacing: -0.035em;
}
header p { color: var(--muted); margin: 6px 0 40px; }
.post-link a {
  display: block;
  padding: 22px 24px;
  margin-bottom: 14px;
  border-radius: 18px;
  background: var(--card);
  border: 1px solid var(--line);
  color: inherit;
  text-decoration: none;
}
.post-link a:hover { border-color: var(--accent); }
.post-link h2 { margin: 4px 0 6px; font-size: 1.35rem; }
.post-link p { margin: 0; color: var(--muted); }
time {
  color: var(--accent);
  font-size: 0.85rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.post h1 { font-size: 2.2rem; letter-spacing: -0.03em; margin: 6px 0 20px; }
.post p { font-size: 1.1rem; }
code {
  padding: 1px 6px;
  border-radius: 6px;
  background: var(--card);
  border: 1px solid var(--line);
}
footer { margin-top: 60px; color: var(--muted); font-size: 0.9rem; }
`,
  };
}

function blank(title: string): Record<string, string> {
  return {
    'index.bhtml': `<!bhtml 1>
<html lang="en">
<head>
  <title>${esc(title)}</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <h1>${esc(title)}</h1>
  <p>Start writing here.</p>
</body>
</html>
`,
    'style.css': `${BASE_CSS}
body {
  max-width: 720px;
  margin: 0 auto;
  padding: 48px 20px;
}
`,
  };
}

export function templateFiles(template: Template, title: string, about: string): Record<string, string> {
  if (template === 'blog') return blog(title, about || 'Thoughts, notes and things I find.');
  if (template === 'blank') return blank(title);
  return page(title, about || 'Welcome to my corner of the Bigglenet.');
}
