<script lang="ts">
  // Minimize, maximize and close, for the desktop app on Windows and Linux, where the tab bar
  // takes the place of the system title bar. Styled like the system's own buttons.
  import { t } from '../lib/i18n.svelte';
  import { desktop } from '../lib/platform';

  const win = desktop?.window;
  let maximized = $state(false);

  $effect(() => {
    if (!win) return;
    win.isMaximized().then((m) => (maximized = m));
    return win.onMaximizedChange((m) => (maximized = m));
  });
</script>

<div class="controls">
  <button aria-label={t('Minimize')} title={t('Minimize')} onclick={() => win?.minimize()}>
    <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M0 5.5h10" /></svg>
  </button>
  <button aria-label={maximized ? t('Restore') : t('Maximize')} title={maximized ? t('Restore') : t('Maximize')} onclick={() => win?.toggleMaximize()}>
    {#if maximized}
      <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2.5 2.5V.5h7v7h-2M.5 2.5h7v7h-7z" /></svg>
    {:else}
      <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M.5.5h9v9h-9z" /></svg>
    {/if}
  </button>
  <button class="close" aria-label={t('Close')} title={t('Close')} onclick={() => win?.close()}>
    <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M.5.5l9 9M9.5.5l-9 9" /></svg>
  </button>
</div>

<style>
  .controls {
    -webkit-app-region: no-drag;
    flex: none;
    display: flex;
    align-self: stretch;
    margin-left: auto;
  }
  button {
    display: grid;
    place-items: center;
    border: 0;
    background: none;
    color: var(--text);
    cursor: default;
  }
  svg {
    width: 10px;
    height: 10px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1;
    shape-rendering: crispEdges;
  }

  /* Windows: flat buttons the full height of the bar, and a red close. */
  :global([data-os='windows']) button {
    width: 46px;
    height: 100%;
  }
  :global([data-os='windows']) button:hover {
    background: var(--hover);
  }
  :global([data-os='windows']) .close:hover {
    background: #c42b1c;
    color: #fff;
  }

  /* Linux: round buttons, like GNOME and KDE. */
  :global([data-os='linux']) .controls {
    align-items: center;
    gap: 10px;
    padding: 0 12px 0 10px;
  }
  :global([data-os='linux']) button {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--hover);
  }
  :global([data-os='linux']) svg {
    width: 8px;
    height: 8px;
    stroke-width: 1.4;
    shape-rendering: auto;
  }
  :global([data-os='linux']) button:hover {
    background: var(--border);
  }
</style>
