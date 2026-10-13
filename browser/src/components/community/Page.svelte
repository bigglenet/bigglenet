<script lang="ts">
  // The frame and shared look of the community pages (feed, clubs, the board, events and
  // collections): a centred column, cards, lists, buttons and form fields.
  import type { Snippet } from 'svelte';

  let { children, wide = false }: { children: Snippet; wide?: boolean } = $props();
</script>

<div class="cp">
  <div class="inner" class:wide>
    {@render children()}
  </div>
</div>

<style>
  .cp {
    height: 100%;
    overflow: auto;
    background: var(--surface);
  }
  .inner {
    max-width: 760px;
    margin: 0 auto;
    padding: 36px 20px 64px;
  }
  .inner.wide {
    max-width: 1000px;
  }
  :global(.cp :where(header.top)) {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    margin-bottom: 20px;
  }
  :global(.cp :where(header.top h1)) {
    flex: 1;
    min-width: 200px;
  }
  :global(.cp :where(h1)) {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.02em;
    overflow-wrap: anywhere;
  }
  :global(.cp :where(h2)) {
    margin: 28px 0 10px;
    font-size: 16px;
  }
  :global(.cp :where(h3)) {
    margin: 0 0 6px;
    font-size: 15px;
  }
  :global(.cp :where(p)) {
    margin: 0;
  }
  :global(.cp :where(.muted)) {
    color: var(--muted);
  }
  :global(.cp :where(.small)) {
    font-size: 13px;
  }
  :global(.cp :where(.bad)) {
    color: var(--danger);
    font-size: 14px;
  }
  :global(.cp :where(.back)) {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 14px;
    padding: 4px 8px 4px 4px;
    border: 0;
    border-radius: 8px;
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 14px;
    cursor: pointer;
  }
  :global(.cp :where(.back:hover)) {
    background: var(--hover);
    color: var(--text);
  }
  :global(.cp :where(.card)) {
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--card);
  }
  :global(.cp :where(.stack)) {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  :global(.cp :where(.row)) {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  :global(.cp :where(.grow)) {
    flex: 1;
    min-width: 0;
  }
  :global(.cp :where(ul.list)) {
    margin: 0;
    padding: 0;
    list-style: none;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--card);
    overflow: hidden;
  }
  :global(.cp :where(ul.list > li)) {
    border-top: 1px solid var(--border);
  }
  :global(.cp :where(ul.list > li:first-child)) {
    border-top: 0;
  }
  :global(.cp :where(.item)) {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 12px 14px;
    border: 0;
    background: none;
    color: var(--text);
    font: inherit;
    text-align: left;
  }
  :global(.cp :where(button.item)) {
    cursor: pointer;
  }
  :global(.cp :where(button.item:hover)) {
    background: var(--hover);
  }
  :global(.cp :where(.item .text)) {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  :global(.cp :where(.item .name)) {
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  :global(.cp :where(.item .sub)) {
    color: var(--muted);
    font-size: 13px;
    overflow-wrap: anywhere;
  }
  :global(.cp :where(.emoji-tile)) {
    flex: none;
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: 12px;
    background: var(--accent-soft);
    font-size: 20px;
    font-weight: 700;
  }
  :global(.cp :where(.empty)) {
    padding: 32px 16px;
    text-align: center;
    color: var(--muted);
  }
  :global(.cp :where(.pill)) {
    padding: 2px 9px;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--text);
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
  }
  :global(.cp :where(.primary)),
  :global(.cp :where(.ghost)),
  :global(.cp :where(.danger)) {
    height: 36px;
    padding: 0 16px;
    border-radius: 10px;
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }
  :global(.cp :where(.primary)) {
    border: 0;
    background: var(--accent);
    color: var(--on-accent);
  }
  :global(.cp :where(.ghost)) {
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--text);
  }
  :global(.cp :where(.danger)) {
    border: 1px solid var(--danger);
    background: var(--danger);
    color: #fff;
  }
  :global(.cp :where(.primary:disabled)),
  :global(.cp :where(.ghost:disabled)) {
    opacity: 0.5;
    cursor: default;
  }
  :global(.cp :where(.link)) {
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    font-weight: 600;
    text-decoration: underline;
    cursor: pointer;
  }
  :global(.cp :where(.cp-field)) {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 13px;
    font-weight: 600;
  }
  :global(.cp :where(input:not([type='checkbox']):not([type='radio']))),
  :global(.cp :where(textarea)),
  :global(.cp :where(select)) {
    width: 100%;
    padding: 9px 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--card);
    color: var(--text);
    font: inherit;
    font-size: 14.5px;
    font-weight: 400;
  }
  :global(.cp :where(textarea)) {
    resize: vertical;
  }
  :global(.cp :where(input:focus)),
  :global(.cp :where(textarea:focus)),
  :global(.cp :where(select:focus)) {
    outline: 0;
    border-color: var(--accent);
  }
  :global(.cp :where(.check)) {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    font-weight: 400;
    cursor: pointer;
  }
  :global(.cp :where(.tabs)) {
    display: flex;
    gap: 4px;
    margin-bottom: 14px;
  }
  :global(.cp :where(.tabs button)) {
    padding: 6px 12px;
    border: 0;
    border-radius: 9px;
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }
  :global(.cp :where(.tabs button[aria-selected='true'])) {
    background: var(--accent-soft);
    color: var(--text);
  }
  :global(.cp :where(.body-text)) {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    line-height: 1.55;
  }
</style>
