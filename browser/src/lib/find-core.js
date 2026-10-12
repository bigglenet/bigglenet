// Find in page: highlights every match of some text and steps through them, Chrome style. Used
// for the browser's own pages (find.svelte.ts) and, inside every .biggle page, by
// page-runtime.js: loader.ts puts this file in front of the runtime, without the `export`.

/** A finder for the text under `getRoot()`. Plain JS, since it also runs inside pages. */
export function createFinder(getRoot) {
  const MAX = 1000;
  let matches = [];
  let current = -1;
  let lastText = '';
  const highlights = typeof Highlight === 'function' && typeof CSS !== 'undefined' && CSS.highlights;

  function collect(text) {
    const root = getRoot();
    if (!root || !text) return [];
    const pattern = new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const shown = new Map();
    const visible = (el) => {
      if (!shown.has(el)) shown.set(el, el.checkVisibility ? el.checkVisibility() : !!el.getClientRects().length);
      return shown.get(el);
    };
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const el = node.parentElement;
        if (!el || el.closest('script, style, noscript, template, textarea, select, input')) return NodeFilter.FILTER_REJECT;
        return visible(el) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    const found = [];
    for (let node = walker.nextNode(); node && found.length < MAX; node = walker.nextNode()) {
      for (const m of node.data.matchAll(pattern)) {
        const range = document.createRange();
        range.setStart(node, m.index);
        range.setEnd(node, m.index + m[0].length);
        found.push(range);
        if (found.length >= MAX) break;
      }
    }
    return found;
  }

  function show() {
    const range = matches[current];
    if (highlights) {
      CSS.highlights.set('biggle-find', new Highlight(...matches));
      if (range) CSS.highlights.set('biggle-find-current', new Highlight(range));
      else CSS.highlights.delete('biggle-find-current');
    } else if (range) {
      // No highlight support (older Safari): select the current match instead.
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
    range?.startContainer.parentElement?.scrollIntoView({ block: 'center', inline: 'nearest' });
  }

  return {
    /** Look for `text`: from the top ('first'), or the next or previous match. */
    find(text, dir = 'first') {
      const before = matches[current];
      matches = collect(text);
      if (!matches.length) {
        current = -1;
      } else if (dir === 'first' || text !== lastText || !before) {
        // Start at the first match that's on screen or below it.
        const top = matches.findIndex((r) => r.getBoundingClientRect().bottom >= 0);
        current = top === -1 ? 0 : top;
      } else {
        // The page may have changed: carry on from where the last match was.
        let at = matches.findIndex((r) => r.compareBoundaryPoints(Range.START_TO_START, before) >= 0);
        if (at === -1) at = matches.length;
        const same = at < matches.length && matches[at].compareBoundaryPoints(Range.START_TO_START, before) === 0;
        if (dir === 'next') current = (same ? at + 1 : at) % matches.length;
        else current = (at - 1 + matches.length) % matches.length;
      }
      lastText = text;
      show();
      return { count: matches.length, index: current };
    },
    clear() {
      matches = [];
      current = -1;
      lastText = '';
      if (highlights) {
        CSS.highlights.delete('biggle-find');
        CSS.highlights.delete('biggle-find-current');
      }
    },
  };
}
