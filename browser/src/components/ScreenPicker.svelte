<script lang="ts">
  // Desktop app: pick a screen or window to share in a call (where the system has no picker).
  import { dialog } from '../lib/dialog';
  import { t } from '../lib/i18n.svelte';
  import { overlays } from '../lib/overlays.svelte';
  import { desktop, type ScreenSource } from '../lib/platform';

  let request = $state<{ id: number; sources: ScreenSource[] } | null>(null);

  $effect(() => desktop?.screen.onChoose((id, sources) => (request = { id, sources })));
  $effect(() => {
    if (request) return overlays.hold();
  });

  function choose(sourceId: string | null) {
    if (!request) return;
    desktop?.screen.chosen(request.id, sourceId);
    request = null;
  }

  const screens = $derived(request?.sources.filter((s) => s.screen) ?? []);
  const windows = $derived(request?.sources.filter((s) => !s.screen) ?? []);
</script>

{#if request}
  <div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && choose(null)}>
    <div class="dialog" role="dialog" aria-label={t('Share your screen')} tabindex="-1" use:dialog onkeydown={(e) => e.key === 'Escape' && choose(null)}>
      <h2>{t('What do you want to share?')}</h2>
      {#each [{ label: t('Screens'), list: screens }, { label: t('Windows'), list: windows }] as group (group.label)}
        {#if group.list.length}
          <h3>{group.label}</h3>
          <div class="grid">
            {#each group.list as s (s.id)}
              <button onclick={() => choose(s.id)}>
                <img src={s.thumbnail} alt="" />
                <span>{s.name}</span>
              </button>
            {/each}
          </div>
        {/if}
      {/each}
      <div class="foot"><button class="ghost" onclick={() => choose(null)}>{t('Cancel')}</button></div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 70;
    display: grid;
    place-items: center;
    padding: 20px;
    background: rgb(0 0 0 / 0.45);
  }
  .dialog {
    width: min(760px, 100%);
    max-height: calc(100vh - 40px);
    overflow: auto;
    padding: 20px;
    border: 1px solid var(--border);
    border-radius: 18px;
    background: var(--card);
    box-shadow: 0 30px 70px -30px rgb(0 0 0 / 0.5);
  }
  h2 {
    margin: 0 0 6px;
    font-size: 18px;
  }
  h3 {
    margin: 16px 0 8px;
    color: var(--muted);
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 10px;
  }
  .grid button {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 13px;
    text-align: left;
  }
  .grid button:hover {
    border-color: var(--accent);
  }
  img {
    width: 100%;
    aspect-ratio: 16 / 10;
    object-fit: contain;
    border-radius: 6px;
    background: #000;
  }
  span {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .foot {
    display: flex;
    justify-content: flex-end;
    margin-top: 16px;
  }
  .ghost {
    height: 34px;
    padding: 0 14px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: none;
    color: var(--text);
    font: inherit;
    font-weight: 600;
  }
</style>
