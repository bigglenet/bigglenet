// Bigglenet menus and dialogs that sit over the page area. A site view (a site's own web view laid
// over its tab, see SiteView.svelte) is drawn above everything in the Biggle window, so it steps
// aside while one of these is showing.
class Overlays {
  count = $state(0);

  /** Something is showing over the page. Returns a function to call when it's gone. */
  hold(): () => void {
    this.count++;
    let held = true;
    return () => {
      if (held) this.count--;
      held = false;
    };
  }
}

export const overlays = new Overlays();
