// Couch mode: getting around Bigglenet with a game controller. The D-pad or left stick moves
// between buttons and links, A presses, B goes back, LB and RB switch tabs, Y opens the command
// palette. On a game, the controller belongs to the game; press the Home (or View + Menu)
// buttons to use it for Bigglenet instead, and again to give it back.
import { browser } from './browser.svelte';

const KEY = 'biggle:couch';
const REPEAT_MS = 180;
const FOCUSABLE = 'button:not(:disabled), a[href], input:not([type="hidden"]):not(:disabled), select, textarea, [tabindex]:not([tabindex="-1"])';

// Standard controller layout.
const A = 0;
const B = 1;
const Y = 3;
const LB = 4;
const RB = 5;
const VIEW = 8;
const MENU = 9;
const UP = 12;
const DOWN = 13;
const LEFT = 14;
const RIGHT = 15;
const HOME = 16;

type Direction = 'up' | 'down' | 'left' | 'right';

class Couch {
  /** Controllers can be used to get around (Settings). */
  enabled = $state(localStorage.getItem(KEY) !== '0');
  /** A controller is connected. */
  connected = $state(false);
  /** The controller is working Bigglenet (rather than a game). */
  active = $state(false);
  /** Ask the command palette to open (CommandPalette watches). */
  palette = $state(0);

  private frame = 0;
  private was: boolean[] = [];
  private repeatAt = 0;

  setEnabled(on: boolean) {
    this.enabled = on;
    try {
      localStorage.setItem(KEY, on ? '1' : '0');
    } catch {}
    if (!on) this.stop();
    else if (this.connected) this.start();
  }

  init() {
    addEventListener('gamepadconnected', () => {
      this.connected = true;
      if (this.enabled) this.start();
    });
    addEventListener('gamepaddisconnected', () => {
      this.connected = navigator.getGamepads().some(Boolean);
      if (!this.connected) this.stop();
    });
  }

  private start() {
    if (this.frame) return;
    const loop = () => {
      this.poll();
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  private stop() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.setActive(false);
  }

  private setActive(on: boolean) {
    this.active = on;
    document.documentElement.classList.toggle('couch', on);
    if (on && !document.activeElement?.matches(FOCUSABLE)) this.move('down');
  }

  /** Whether a game or page is showing, which gets the controller unless asked otherwise. */
  private get onPage() {
    const v = browser.active?.view.type;
    return v === 'page' || v === 'web';
  }

  private poll() {
    const pad = navigator.getGamepads().find(Boolean);
    if (!pad) return;
    const down = pad.buttons.map((b) => b.pressed);
    const pressed = (i: number) => !!down[i] && !this.was[i];

    // Home, or View and Menu together: switch between the game and Bigglenet.
    if (pressed(HOME) || (down[VIEW] && down[MENU] && (pressed(VIEW) || pressed(MENU)))) this.setActive(!this.active);
    // Off a page, the controller is for Bigglenet.
    if (!this.onPage && !this.active) this.setActive(true);

    if (this.active) {
      const x = pad.axes[0] ?? 0;
      const y = pad.axes[1] ?? 0;
      const dir: Direction | null =
        down[UP] || y < -0.6 ? 'up' : down[DOWN] || y > 0.6 ? 'down' : down[LEFT] || x < -0.6 ? 'left' : down[RIGHT] || x > 0.6 ? 'right' : null;
      const now = performance.now();
      if (dir && now >= this.repeatAt) {
        this.move(dir);
        this.repeatAt = now + (this.was.some(Boolean) || Math.abs(x) > 0.6 || Math.abs(y) > 0.6 ? REPEAT_MS : REPEAT_MS * 2);
      } else if (!dir) {
        this.repeatAt = 0;
      }
      if (pressed(A)) (document.activeElement as HTMLElement | null)?.click();
      if (pressed(B)) this.back();
      if (pressed(Y)) this.palette++;
      if (pressed(LB) || pressed(RB)) this.switchTab(pressed(RB) ? 1 : -1);
    }
    this.was = down;
  }

  private back() {
    // Close whatever's open first, like Escape would.
    const before = document.activeElement;
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    if (document.activeElement !== before) return;
    const tab = browser.active;
    if (tab && tab.index > 0) browser.back(tab);
  }

  private switchTab(by: 1 | -1) {
    const tabs = browser.tabs;
    const i = tabs.findIndex((t) => t.id === browser.activeId);
    const next = tabs[(i + by + tabs.length) % tabs.length];
    if (next) browser.activate(next.id);
  }

  /** Focus the nearest thing in a direction. */
  private move(dir: Direction) {
    const all = [...document.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && getComputedStyle(el).visibility !== 'hidden';
    });
    const current = document.activeElement instanceof HTMLElement && all.includes(document.activeElement) ? document.activeElement : null;
    if (!current) return all[0]?.focus();
    const from = current.getBoundingClientRect();
    const fx = from.left + from.width / 2;
    const fy = from.top + from.height / 2;
    let best: HTMLElement | null = null;
    let bestScore = Infinity;
    for (const el of all) {
      if (el === current) continue;
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const dx = x - fx;
      const dy = y - fy;
      const along = dir === 'up' ? -dy : dir === 'down' ? dy : dir === 'left' ? -dx : dx;
      const across = dir === 'up' || dir === 'down' ? Math.abs(dx) : Math.abs(dy);
      if (along <= 4) continue;
      const s = along + across * 2.5;
      if (s < bestScore) {
        bestScore = s;
        best = el;
      }
    }
    best?.focus();
    best?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

export const couch = new Couch();
