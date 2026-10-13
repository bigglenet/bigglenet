<script lang="ts">
  // Frames per second, memory and processor for the page on screen (the command palette turns
  // it on and off).
  import { t } from '../lib/i18n.svelte';
  import { perf } from '../lib/perf.svelte';
  import Icon from './Icon.svelte';

  const mb = (bytes: number | null) => (bytes === null ? '–' : `${Math.round(bytes / 1024 / 1024)} MB`);
  const level = $derived(perf.fps === null ? '' : perf.fps >= 50 ? 'good' : perf.fps >= 30 ? 'ok' : 'bad');
</script>

<div class="perf" role="status" aria-label={t('Performance')}>
  <span class="fps {level}">{perf.fps === null ? '–' : Math.round(perf.fps)} <small>{t('FPS')}</small></span>
  <span>{t('Memory')} {mb(perf.memory)}</span>
  {#if perf.cpu !== null}<span>{t('Processor')} {Math.round(perf.cpu)}%</span>{/if}
  <button aria-label={t('Hide')} onclick={() => perf.toggle()}><Icon name="close" size={12} /></button>
</div>

<style>
  .perf {
    position: fixed;
    right: 12px;
    bottom: 12px;
    z-index: 65;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 8px 6px 12px;
    border-radius: 10px;
    background: rgb(0 0 0 / 0.78);
    color: #eee;
    font: 600 12px/1 ui-monospace, Menlo, monospace;
    pointer-events: auto;
  }
  .fps {
    font-size: 15px;
  }
  .fps small {
    font-size: 10px;
    opacity: 0.7;
  }
  .good {
    color: #5ccf8a;
  }
  .ok {
    color: #f5c451;
  }
  .bad {
    color: #f2756a;
  }
  button {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border: 0;
    border-radius: 6px;
    background: none;
    color: inherit;
  }
</style>
