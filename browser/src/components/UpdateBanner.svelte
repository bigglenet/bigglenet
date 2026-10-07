<script lang="ts">
  import { updates } from '../lib/updates.svelte';
  import Icon from './Icon.svelte';
</script>

<div class="update" role="status">
  <span class="text">
    <strong>{updates.version ? `Bigglenet ${updates.version} is ready` : 'A new Bigglenet is ready'}</strong>
    <span>{updates.version ? 'Restart to start using it.' : 'Reload to start using it.'}</span>
  </span>
  <button class="go" disabled={updates.installing} onclick={() => updates.apply()}>
    {updates.installing ? 'Updating…' : updates.version ? 'Restart' : 'Reload'}
  </button>
  <button class="later" aria-label="Later" title="Later" onclick={() => (updates.dismissed = true)}>
    <Icon name="close" size={15} />
  </button>
</div>

<style>
  .update {
    position: fixed;
    right: 16px;
    bottom: calc(16px + env(safe-area-inset-bottom));
    z-index: 25;
    display: flex;
    align-items: center;
    gap: 12px;
    max-width: calc(100vw - 32px);
    padding: 12px 10px 12px 16px;
    border-radius: 16px;
    background: var(--accent);
    color: var(--on-accent);
    box-shadow: 0 16px 40px -14px rgb(0 0 0 / 0.5);
    animation: rise 0.25s ease-out;
  }
  @keyframes rise {
    from {
      transform: translateY(12px);
      opacity: 0;
    }
  }
  .text {
    display: flex;
    flex-direction: column;
    min-width: 0;
    font-size: 14px;
  }
  .text span {
    opacity: 0.7;
    font-size: 13px;
  }
  .go {
    flex: none;
    padding: 8px 14px;
    border: 0;
    border-radius: 10px;
    background: var(--on-accent);
    color: var(--accent);
    font: inherit;
    font-size: 13.5px;
    font-weight: 700;
  }
  .go:disabled {
    opacity: 0.7;
  }
  .later {
    flex: none;
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border: 0;
    border-radius: 8px;
    background: none;
    color: inherit;
    opacity: 0.7;
  }
  .later:hover {
    opacity: 1;
  }
</style>
