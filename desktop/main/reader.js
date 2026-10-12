// Reader mode for sites in the desktop app: the same extractor the browser puts in .biggle pages
// (browser/src/lib/reader-core.js). Keep the two the same.
export const READER_SCRIPT = `(${function readerExtract() {
  const SKIP = 'script, style, noscript, template, nav, aside, footer, header, form, iframe, object, embed, button, input, select, textarea, svg, canvas, dialog, [hidden], [aria-hidden="true"], [role="navigation"], [role="banner"], [role="contentinfo"], .ad, .ads, .advert, .share, .social, .comments, .sidebar, .menu, .cookie';
  const textLength = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim().length;
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
}})()`;
