// Bigglenet menus and dialogs that sit over the page area. A site view (a site's own web view laid
// over its tab, see SiteView.svelte) is drawn above everything in the Biggle window, so it steps
// aside while one of these is showing.
import { untrack } from 'svelte';

class Overlays {
  count = $state(0);

  /**
   * Something is showing over the page. Returns a function to call when it's gone. Safe to call
   * from an effect: it doesn't make the effect depend on the count.
   */
  hold(): () => void {
    untrack(() => this.count++);
    let held = true;
    return () => {
      if (held) untrack(() => this.count--);
      held = false;
    };
  }
}

export const overlays = new Overlays();
