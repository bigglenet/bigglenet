// For dialogs (use:dialog): focus moves into one when it opens, Tab and Shift+Tab stay inside it,
// and focus goes back to where it was when it closes. The dialog needs tabindex="-1".
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function dialog(node: HTMLElement) {
  const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  if (!node.contains(document.activeElement)) node.focus({ preventScroll: true });
  const onkeydown = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
    if (!items.length) return e.preventDefault();
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === node)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  node.addEventListener('keydown', onkeydown);
  return {
    destroy() {
      node.removeEventListener('keydown', onkeydown);
      if (before?.isConnected) before.focus({ preventScroll: true });
    },
  };
}
