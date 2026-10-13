// A code site's link preview and tab icon live in its index.bhtml <head>: the description and
// picture people see when it's shared (server/src/previews.ts reads them), and the icon on its
// tab. The site editor lets you set them without touching the code.

export type HeadMeta = { description: string; image: string; icon: string };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const TAGS: Record<keyof HeadMeta, { re: RegExp; make: (v: string) => string }> = {
  description: {
    re: /(^[ \t]*)?<meta\b[^>]*\bname\s*=\s*["']?description["']?[^>]*>([ \t]*\n)?/gim,
    make: (v) => `<meta name="description" content="${esc(v)}">`,
  },
  image: {
    re: /(^[ \t]*)?<meta\b[^>]*\bproperty\s*=\s*["']?og:image["']?[^>]*>([ \t]*\n)?/gim,
    make: (v) => `<meta property="og:image" content="${esc(v)}">`,
  },
  icon: {
    re: /(^[ \t]*)?<link\b[^>]*\brel\s*=\s*["']?(?:shortcut\s+)?icon["']?[^>]*>([ \t]*\n)?/gim,
    make: (v) => `<link rel="icon" href="${esc(v)}">`,
  },
};

/** What the page's head says now. */
export function readHead(html: string): HeadMeta {
  const doc = new DOMParser().parseFromString(html.replace(/^\s*<!bhtml[^>]*>/i, ''), 'text/html');
  const attr = (selector: string, name: string) => doc.querySelector(selector)?.getAttribute(name)?.trim() ?? '';
  return {
    description: attr('meta[name="description" i]', 'content'),
    image: attr('meta[property="og:image" i]', 'content'),
    icon: attr('link[rel~="icon" i]', 'href'),
  };
}

/** The page with its head saying `meta`: tags are changed in place, added, or (when empty) removed. */
export function writeHead(html: string, meta: HeadMeta): string {
  let out = html;
  let add = '';
  for (const key of Object.keys(TAGS) as (keyof HeadMeta)[]) {
    const value = meta[key].trim();
    let done = false;
    // A tag on a line of its own goes with its line; one in the middle of a line, just itself.
    out = out.replace(TAGS[key].re, (_, lead: string | undefined, tail: string | undefined) => {
      if (done || !value) return lead !== undefined && tail !== undefined ? '' : (lead ?? '') + (tail ?? '');
      done = true;
      return (lead ?? '') + TAGS[key].make(value) + (tail ?? '');
    });
    if (!done && value) add += `  ${TAGS[key].make(value)}\n`;
  }
  if (!add) return out;
  const close = out.search(/<\/head>/i);
  if (close >= 0) {
    // Just before </head>, on lines of their own.
    const line = out.lastIndexOf('\n', close - 1) + 1;
    return /^[ \t]*$/.test(out.slice(line, close)) ? out.slice(0, line) + add + out.slice(line) : out.slice(0, close) + '\n' + add + out.slice(close);
  }
  if (/<head\b[^>]*>/i.test(out)) return out.replace(/<head\b[^>]*>\n?/i, (m) => m + (m.endsWith('\n') ? '' : '\n') + add);
  // No head at all: put the tags after the <!bhtml> line.
  return out.replace(/^(\s*<!bhtml[^>]*>\n?)?/i, (m) => m + (m && !m.endsWith('\n') ? '\n' : '') + add);
}
