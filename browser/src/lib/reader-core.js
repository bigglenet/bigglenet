// Reader mode: finds a page's main text and returns it, simplified. Plain JS that runs inside the
// page: .biggle pages (page-runtime.js, put there by loader.ts) and, as a copy, sites straight from
// the internet in the desktop app (desktop/main/reader.js). The browser cleans the result again
// before showing it (reader.ts).
export function readerExtract() {
  const SKIP = 'script, style, noscript, template, nav, aside, footer, header, form, iframe, object, embed, button, input, select, textarea, svg, canvas, dialog, [hidden], [aria-hidden="true"], [role="navigation"], [role="banner"], [role="contentinfo"], .ad, .ads, .advert, .share, .social, .comments, .sidebar, .menu, .cookie';
  const textLength = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim().length;
  // The element with the most paragraph text directly inside it.
  let best = document.querySelector('article, main, [role="main"]');
  let bestScore = best ? textLength(best) : 0;
  const scores = new Map();
  for (const p of document.querySelectorAll('p, pre, blockquote, li')) {
    if (p.closest(SKIP)) continue;
    const parent = p.parentElement;
    if (!parent) continue;
    scores.set(parent, (scores.get(parent) || 0) + textLength(p));
  }
  for (const [el, score] of scores) {
    if (score > bestScore * 1.2) {
      best = el;
      bestScore = score;
    }
  }
  if (!best || bestScore < 200) best = document.body;
  const copy = best.cloneNode(true);
  for (const el of copy.querySelectorAll(SKIP)) el.remove();
  // Pictures and links with full addresses, so they work outside the page.
  for (const img of copy.querySelectorAll('img')) {
    const real = img.currentSrc || img.src || img.getAttribute('data-src');
    if (real) img.setAttribute('src', new URL(real, document.baseURI).href);
  }
  for (const a of copy.querySelectorAll('a[href]')) a.setAttribute('href', new URL(a.getAttribute('href'), document.baseURI).href);
  const heading = document.querySelector('h1');
  return {
    title: (heading && textLength(heading) < 200 ? heading.textContent.trim() : '') || document.title,
    html: copy.innerHTML,
    length: textLength(copy),
  };
}
