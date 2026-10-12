// The performance overlay: frames per second, memory and processor for the page on screen.
// Pages report as they go (PageFrame, SiteView).

class Perf {
  on = $state(false);
  fps = $state<number | null>(null);
  memory = $state<number | null>(null);
  cpu = $state<number | null>(null);

  toggle() {
    this.on = !this.on;
    this.reset();
  }

  reset() {
    this.fps = this.memory = this.cpu = null;
  }
}

export const perf = new Perf();
