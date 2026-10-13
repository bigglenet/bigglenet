<script lang="ts">
  // The admins' banner for everyone, under the toolbar.
  import { announcements } from '../lib/announcement.svelte';
  import { t } from '../lib/i18n.svelte';
  import Linked from './community/Linked.svelte';
  import Icon from './Icon.svelte';

  const a = $derived(announcements.shown);
</script>

{#if a}
  <div class="banner" class:warning={a.level === 'warning'} role="status">
    <Icon name={a.level === 'warning' ? 'alert' : 'bell'} size={15} />
    <span class="text"><Linked text={a.text} /></span>
    <button aria-label={t('Hide')} title={t('Hide')} onclick={() => announcements.hide()}><Icon name="close" size={14} /></button>
  </div>
{/if}

<style>
  .banner {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 10px 7px 14px;
    background: var(--accent-soft);
    color: var(--text);
    font-size: 13.5px;
  }
  .banner.warning {
    background: color-mix(in srgb, #f08c00 24%, transparent);
  }
  .text {
    flex: 1;
    min-width: 0;
  }
  button {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border: 0;
    border-radius: 7px;
    background: none;
    color: var(--muted);
    cursor: pointer;
  }
  button:hover {
    background: var(--hover);
    color: var(--text);
  }
</style>
