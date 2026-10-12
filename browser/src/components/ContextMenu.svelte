<script lang="ts">
  // Whichever right-click menu is open (contextmenu.svelte.ts). Arrow keys move through it, Enter
  // picks, Escape closes.
  import { tick } from 'svelte';
  import { menu, type MenuItem } from '../lib/contextmenu.svelte';
  import { overlays } from '../lib/overlays.svelte';
  import Icon from './Icon.svelte';

  let root = $state<HTMLElement>();
  let pos = $state({ x: 0, y: 0 });
  let sub = $state<{ items: MenuItem[]; x: number; y: number } | null>(null);

  const open = $derived(menu.open);

  $effect(() => {
    if (!open) return;
    const release = overlays.hold();
    sub = null;
    pos = { x: open.x, y: open.y };
    // Keep it on screen.
    tick().then(() => {
      if (!root) return;
      const r = root.getBoundingClientRect();
      pos = { x: Math.max(4, Math.min(open.x, innerWidth - r.width - 4)), y: Math.max(4, Math.min(open.y, innerHeight - r.height - 4)) };
      (root.querySelector('button:not(:disabled)') as HTMLElement | null)?.focus();
    });
    const onpointerdown = (e: PointerEvent) => {
      if (!(e.target as Element).closest('.context-menu')) menu.close();
    };
    const onkeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') menu.close();
    };
    const onblur = () => menu.close();
    document.addEventListener('pointerdown', onpointerdown, true);
    document.addEventListener('keydown', onkeydown);
    window.addEventListener('blur', onblur);
    return () => {
      release();
      document.removeEventListener('pointerdown', onpointerdown, true);
      document.removeEventListener('keydown', onkeydown);
      window.removeEventListener('blur', onblur);
    };
  });

  function pick(item: MenuItem, e: MouseEvent) {
    if (item.separator) return;
    if (item.submenu) {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      sub = { items: item.submenu, x: r.right + 2, y: r.top - 4 };
      return;
    }
    menu.close();
    item.action?.();
  }

  /** Arrow keys move between items. */
  function onkeydown(e: KeyboardEvent) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const list = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('button.item:not(:disabled)')];
    const i = list.indexOf(document.activeElement as HTMLElement);
    list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]?.focus();
  }
</script>

{#snippet items(list: MenuItem[])}
  {#each list as item, i (i)}
    {#if item.separator}
      <hr />
    {:else if item.colors}
      <div class="colors">
        {#each item.colors as c (c.value)}
          <button class="dot group-{c.value}" class:current={c.current} aria-label={c.value} onclick={() => (c.pick(), menu.close())}></button>
        {/each}
      </div>
    {:else}
      <button class="item" class:danger={item.danger} disabled={item.disabled} role="menuitem" onclick={(e) => pick(item, e)}>
        <span class="icon">{#if item.icon}<Icon name={item.icon} size={15} />{/if}</span>
        <span class="label">{item.label}</span>
        {#if item.submenu}<Icon name="forward" size={14} />{/if}
      </button>
    {/if}
  {/each}
{/snippet}

{#if open}
  <div class="context-menu" role="menu" tabindex="-1" bind:this={root} style:left="{pos.x}px" style:top="{pos.y}px" {onkeydown}>
    {@render items(open.items)}
  </div>
  {#if sub}
    <div class="context-menu" role="menu" tabindex="-1" style:left="{Math.min(sub.x, innerWidth - 240)}px" style:top="{Math.min(sub.y, innerHeight - 40 * sub.items.length)}px" {onkeydown}>
      {@render items(sub.items)}
    </div>
  {/if}
{/if}

<style>
  .context-menu {
    position: fixed;
    z-index: 90;
    min-width: 210px;
    max-width: 320px;
    max-height: calc(100vh - 8px);
    overflow: auto;
    padding: 5px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--card);
    box-shadow: 0 14px 36px -12px rgb(0 0 0 / 0.45);
  }
  .item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 7px 10px 7px 8px;
    border: 0;
    border-radius: 8px;
    background: none;
    color: var(--text);
    font: inherit;
    font-size: 13.5px;
    text-align: left;
  }
  .item:hover:not(:disabled),
  .item:focus-visible {
    outline: 0;
    background: var(--hover);
  }
  .item:disabled {
    color: var(--faint);
  }
  .item.danger {
    color: var(--danger);
  }
  .icon {
    flex: none;
    display: grid;
    place-items: center;
    width: 18px;
    color: var(--muted);
  }
  .label {
    flex: 1;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  hr {
    margin: 4px 6px;
    border: 0;
    border-top: 1px solid var(--border);
  }
  .colors {
    display: flex;
    gap: 6px;
    padding: 6px 10px;
  }
  .dot {
    width: 18px;
    height: 18px;
    border: 2px solid transparent;
    border-radius: 50%;
    background: var(--group);
  }
  .dot.current {
    border-color: var(--text);
  }
</style>
