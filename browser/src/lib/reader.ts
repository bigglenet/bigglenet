// Reader mode: a page's main text (found in the page by reader-core.js), cleaned before it's
// shown in the browser's own page. Only plain text, headings, lists, quotes, code, links and
// pictures get through; nothing that runs or styles itself.

const KEEP = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'em', 'strong', 'b', 'i', 'u', 's',
  'a', 'img', 'figure', 'figcaption', 'br', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'sup', 'sub', 'small', 'mark', 'dl', 'dt', 'dd',
]);
// Containers whose insides are kept, without the container.
const UNWRAP = new Set(['div', 'span', 'section', 'article', 'main', 'font', 'center', 'picture', 'time', 'abbr', 'cite', 'q', 'label', 'details', 'summary']);
const MAX_LENGTH = 400_000;

function clean(from: Node, to: Node, doc: Document) {
  for (const child of from.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      to.appendChild(doc.createTextNode(child.textContent ?? ''));
      continue;
    }
    if (!(child instanceof Element)) continue;
    const tag = child.localName;
    if (UNWRAP.has(tag)) {
      clean(child, to, doc);
      continue;
    }
    if (!KEEP.has(tag)) continue;
    const el = doc.createElement(tag);
    if (tag === 'a') {
      const href = child.getAttribute('href') ?? '';
      if (/^(https?|biggle|mailto):/i.test(href)) el.setAttribute('href', href);
    } else if (tag === 'img') {
      const src = child.getAttribute('src') ?? '';
      if (!/^(https?:|data:image\/(png|jpe?g|gif|webp|avif);)/i.test(src)) continue;
      el.setAttribute('src', src);
      el.setAttribute('alt', child.getAttribute('alt') ?? '');
      el.setAttribute('loading', 'lazy');
      el.setAttribute('referrerpolicy', 'no-referrer');
    } else if (tag === 'td' || tag === 'th') {
      for (const a of ['colspan', 'rowspan']) {
        const v = child.getAttribute(a);
        if (v && /^\d{1,2}$/.test(v)) el.setAttribute(a, v);
      }
    }
    clean(child, el, doc);
    to.appendChild(el);
  }
}

/** The page's text, safe to show. null if there's too little to read. */
export function cleanReader(raw: unknown): { title: string; html: string } | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { title?: unknown; html?: unknown; length?: unknown };
  if (typeof r.html !== 'string' || r.html.length > MAX_LENGTH || Number(r.length) < 150) return null;
  const doc = document.implementation.createHTMLDocument('');
  const parsed = new DOMParser().parseFromString(r.html, 'text/html');
  const out = doc.createElement('div');
  clean(parsed.body, out, doc);
  const title = typeof r.title === 'string' ? r.title.slice(0, 300) : '';
  // The page's own heading, when it's the title, isn't shown twice.
  const first = out.querySelector('h1');
  if (first && first.textContent?.trim() === title.trim()) first.remove();
  return { title, html: out.innerHTML };
}
