<script lang="ts">
  // Add the site you're on to one of your collections (or a new one).
  import { api, errorText } from '../../lib/api';
  import { browser } from '../../lib/browser.svelte';
  import { collect } from '../../lib/collect.svelte';
  import { t } from '../../lib/i18n.svelte';
  import { overlays } from '../../lib/overlays.svelte';
  import { siteHost } from '../../lib/url';
  import Icon from '../Icon.svelte';

  type Row = { id: string; title: string; sites: number; has: boolean };

  const site = $derived(collect.site ?? '');
  let rows = $state<Row[] | null>(null);
  let error = $state('');
  let title = $state('');
  let busy = $state(false);
  let box = $state<HTMLDivElement>();

  $effect(() => {
    const release = overlays.hold();
    box?.focus();
    return release;
  });

  $effect(() => {
    const s = site;
    rows = null;
    api<{ collections: Row[] }>('GET', `/api/collections/for/${encodeURIComponent(s)}`).then(
      (r) => (rows = r.collections),
      (e) => (error = errorText(e)),
    );
  });

  async function toggle(row: Row) {
    error = '';
    try {
      if (row.has) await api('DELETE', `/api/collections/${row.id}/sites/${encodeURIComponent(site)}`);
      else await api('POST', `/api/collections/${row.id}/sites`, { site });
      row.has = !row.has;
      browser.say(row.has ? t('Added to {name}', { name: row.title }) : t('Taken out of {name}', { name: row.title }));
    } catch (e) {
      error = errorText(e);
    }
  }

  async function create(e: SubmitEvent) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    busy = true;
    error = '';
    try {
      const { id } = await api<{ id: string }>('POST', '/api/collections', { title });
      await api('POST', `/api/collections/${id}/sites`, { site });
      rows = [{ id, title: title.trim(), sites: 1, has: true }, ...(rows ?? [])];
      browser.say(t('Added to {name}', { name: title.trim() }));
      title = '';
    } catch (err) {
      error = errorText(err);
    } finally {
      busy = false;
    }
  }
</script>

<div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && collect.close()}>
  <div class="dialog" role="dialog" aria-modal="true" aria-label={t('Add to collection')} tabindex="-1" bind:this={box} onkeydown={(e) => e.key === 'Escape' && collect.close()}>
    <header>
      <h2>{t('Add {site} to a collection', { site: siteHost(site) })}</h2>
      <button class="icon" aria-label={t('Close')} onclick={() => collect.close()}><Icon name="close" size={16} /></button>
    </header>
    {#if rows === null && !error}
      <p class="muted">{t('Loading…')}</p>
    {:else if rows}
      <ul>
        {#each rows as row (row.id)}
          <li>
            <label>
              <input type="checkbox" checked={row.has} onchange={() => toggle(row)} />
              <span>{row.title}</span>
            </label>
          </li>
        {/each}
      </ul>
    {/if}
    <form onsubmit={create}>
      <input bind:value={title} maxlength="60" placeholder={t('New collection')} aria-label={t('New collection name')} />
      <button class="primary" disabled={busy || !title.trim()}>{t('Make it')}</button>
    </form>
    {#if error}<p class="bad">{error}</p>{/if}
    <button class="link" onclick={() => (collect.close(), browser.newTab('biggle://collections', { after: browser.activeId }))}>{t('See all your collections')}</button>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: grid;
    place-items: center;
    padding: 20px;
    background: rgb(0 0 0 / 0.35);
  }
  .dialog {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: min(400px, 100%);
    max-height: min(560px, 100%);
    overflow: auto;
    padding: 18px 20px 20px;
    border: 1px solid var(--border);
    border-radius: 18px;
    background: var(--card);
    box-shadow: 0 30px 70px -30px rgb(0 0 0 / 0.5);
    outline: 0;
  }
  header {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  h2 {
    flex: 1;
    margin: 0;
    font-size: 17px;
    overflow-wrap: anywhere;
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  label {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 4px;
    border-radius: 8px;
    font-size: 14.5px;
    cursor: pointer;
  }
  label:hover {
    background: var(--hover);
  }
  form {
    display: flex;
    gap: 8px;
  }
  input:not([type='checkbox']) {
    flex: 1;
    min-width: 0;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
  }
  .primary {
    padding: 0 14px;
    border: 0;
    border-radius: 10px;
    background: var(--accent);
    color: var(--on-accent);
    font: inherit;
    font-weight: 600;
  }
  .primary:disabled {
    opacity: 0.5;
  }
  .icon {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: 9px;
    background: none;
    color: var(--text);
  }
  .link {
    align-self: flex-start;
    padding: 0;
    border: 0;
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 13.5px;
    text-decoration: underline;
    cursor: pointer;
  }
  .muted {
    margin: 0;
    color: var(--muted);
  }
  .bad {
    margin: 0;
    color: var(--danger);
    font-size: 13.5px;
  }
</style>
