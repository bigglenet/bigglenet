<script lang="ts" module>
  const KEY = 'biggle:reader';
  type Prefs = { size: number; serif: boolean; theme: 'page' | 'sepia' | 'dark' };
  function loadPrefs(): Prefs {
    try {
      const p = JSON.parse(localStorage.getItem(KEY) ?? 'null');
      return { size: Math.min(26, Math.max(14, Number(p?.size) || 19)), serif: p?.serif !== false, theme: ['page', 'sepia', 'dark'].includes(p?.theme) ? p.theme : 'page' };
    } catch {
      return { size: 19, serif: true, theme: 'page' };
    }
  }
</script>

<script lang="ts">
  // Reader mode (⇧⌘R): the page's main text on its own, easy to read. Links still work.
  import { browser, type Tab } from '../lib/browser.svelte';
  import { t } from '../lib/i18n.svelte';
  import Icon from './Icon.svelte';

  let { tab }: { tab: Tab } = $props();
  const reader = $derived(tab.reader!);

  let prefs = $state(loadPrefs());
  $effect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {}
  });

  // Links inside go through the browser.
  function onclick(e: MouseEvent) {
    const a = (e.target as Element).closest('a[href]');
    if (!a) return;
    e.preventDefault();
    const href = a.getAttribute('href')!;
    if (href.startsWith('biggle://')) browser.go(tab, href);
    else browser.external = href;
  }
</script>

<div class="reader theme-{prefs.theme}" class:serif={prefs.serif} style:--size="{prefs.size}px">
  <div class="tools">
    <button title={t('Smaller text')} aria-label={t('Smaller text')} onclick={() => (prefs.size = Math.max(14, prefs.size - 1))}>A−</button>
    <button title={t('Bigger text')} aria-label={t('Bigger text')} onclick={() => (prefs.size = Math.min(26, prefs.size + 1))}>A+</button>
    <button class:on={prefs.serif} onclick={() => (prefs.serif = !prefs.serif)}>{prefs.serif ? t('Serif') : t('Sans')}</button>
    {#each ['page', 'sepia', 'dark'] as const as th (th)}
      <button class="swatch swatch-{th}" class:on={prefs.theme === th} aria-label={th} onclick={() => (prefs.theme = th)}></button>
    {/each}
    <span class="spacer"></span>
    <button onclick={() => (tab.reader = null)}><Icon name="close" size={14} /> {t('Leave reader mode')}</button>
  </div>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
  <article {onclick}>
    {#if reader.title}<h1>{reader.title}</h1>{/if}
    <!-- Cleaned by reader.ts: only text, links and pictures. -->
    {@html reader.html}
  </article>
</div>

<style>
  .reader {
    position: absolute;
    inset: 0;
    z-index: 5;
    overflow: auto;
    background: #fbfaf7;
    color: #1f1d1a;
  }
  .theme-sepia {
    background: #f4ecd8;
    color: #3b2f22;
  }
  .theme-dark {
    background: #1b1b1b;
    color: #e8e5df;
  }
  .tools {
    position: sticky;
    top: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    background: inherit;
    border-bottom: 1px solid color-mix(in srgb, currentColor 12%, transparent);
  }
  .tools button {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 30px;
    padding: 0 10px;
    border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
    border-radius: 8px;
    background: none;
    color: inherit;
    font: inherit;
    font-size: 13px;
    font-weight: 600;
  }
  .tools button.on {
    background: color-mix(in srgb, currentColor 10%, transparent);
  }
  .swatch {
    width: 30px;
    padding: 0 !important;
  }
  .swatch-page {
    background: #fbfaf7 !important;
  }
  .swatch-sepia {
    background: #f4ecd8 !important;
  }
  .swatch-dark {
    background: #1b1b1b !important;
  }
  .swatch.on {
    outline: 2px solid currentColor;
  }
  .spacer {
    flex: 1;
  }
  article {
    max-width: 680px;
    margin: 0 auto;
    padding: 32px 24px 80px;
    font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
    font-size: var(--size);
    line-height: 1.65;
    overflow-wrap: break-word;
  }
  .serif article {
    font-family: ui-serif, Georgia, 'Iowan Old Style', 'Times New Roman', serif;
  }
  article :global(h1) {
    font-size: 1.8em;
    line-height: 1.2;
    margin: 0 0 0.8em;
  }
  article :global(h2),
  article :global(h3) {
    line-height: 1.3;
    margin: 1.5em 0 0.5em;
  }
  article :global(img) {
    display: block;
    max-width: 100%;
    height: auto;
    margin: 1.2em auto;
    border-radius: 6px;
  }
  article :global(a) {
    color: inherit;
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
  }
  article :global(pre) {
    overflow: auto;
    padding: 12px;
    border-radius: 8px;
    background: color-mix(in srgb, currentColor 7%, transparent);
    font-size: 0.8em;
  }
  article :global(blockquote) {
    margin: 1em 0;
    padding-left: 1em;
    border-left: 3px solid color-mix(in srgb, currentColor 30%, transparent);
    opacity: 0.85;
  }
  article :global(table) {
    border-collapse: collapse;
    font-size: 0.85em;
  }
  article :global(td),
  article :global(th) {
    padding: 4px 8px;
    border: 1px solid color-mix(in srgb, currentColor 15%, transparent);
  }
</style>
