// "Add to collection…" from a site's menu: which site the picker (CollectionPicker.svelte) is for.
class Collect {
  site = $state<string | null>(null);
  open(site: string) {
    this.site = site;
  }
  close() {
    this.site = null;
  }
}

export const collect = new Collect();
