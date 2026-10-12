<script lang="ts">
  // biggle://downloads (desktop app): what you've downloaded, with Open, Show in folder, and
  // pause, resume or cancel while it's going.
  import { downloads } from '../lib/downloads.svelte';
  import { i18n, t } from '../lib/i18n.svelte';
  import { isApp, isMac } from '../lib/platform';
  import Icon from './Icon.svelte';

  const size = (bytes: number) =>
    bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${Math.round(bytes / 1024)} KB` : bytes < 1024 ** 3 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  const when = (at: number) => new Date(at).toLocaleString(i18n.locale, { dateStyle: 'medium', timeStyle: 'short' });
  const STATE: Record<string, string> = { cancelled: 'Cancelled', interrupted: 'Didn’t finish', paused: 'Paused' };
</script>

<div class="page">
  <div class="inner">
    <header>
      <h1>{t('Downloads')}</h1>
      {#if downloads.list.some((d) => d.state !== 'progressing' && d.state !== 'paused')}
        <button class="ghost" onclick={() => downloads.clear()}>{t('Clear list')}</button>
      {/if}
    </header>
    {#if !isApp}
      <p class="muted">{t('Downloads go to your web browser’s downloads.')}</p>
    {:else if downloads.list.length === 0}
      <div class="empty">
        <Icon name="download" size={28} />
        <p>{t('Nothing downloaded yet.')}</p>
        <p class="muted">{t('Files you download from sites and chats show up here, and go in your Downloads folder.')}</p>
      </div>
    {:else}
      <ul>
        {#each downloads.list as d (d.id)}
          <li>
            <span class="icon"><Icon name="file" size={18} /></span>
            <span class="text">
              {#if d.state === 'completed'}
                <button class="name" onclick={() => downloads.open(d.id)}>{d.name}</button>
              {:else}
                <span class="name plain">{d.name}</span>
              {/if}
              {#if d.state === 'progressing' || d.state === 'paused'}
                <span class="bar"><span style:width="{d.total ? (d.received / d.total) * 100 : 5}%"></span></span>
                <span class="muted small">{size(d.received)}{d.total ? ` / ${size(d.total)}` : ''}{d.state === 'paused' ? ` · ${t('Paused')}` : ''}</span>
              {:else}
                <span class="muted small">
                  {d.state === 'completed' ? size(d.total || d.received) : t(STATE[d.state] ?? d.state)} · {when(d.at)}
                </span>
              {/if}
            </span>
            {#if d.state === 'progressing'}
              <button class="icon-button" title={t('Pause')} onclick={() => downloads.pause(d.id)}><Icon name="pause" size={15} /></button>
              <button class="icon-button" title={t('Cancel')} onclick={() => downloads.cancel(d.id)}><Icon name="close" size={15} /></button>
            {:else if d.state === 'paused'}
              <button class="icon-button" title={t('Resume')} onclick={() => downloads.resume(d.id)}><Icon name="play" size={15} /></button>
              <button class="icon-button" title={t('Cancel')} onclick={() => downloads.cancel(d.id)}><Icon name="close" size={15} /></button>
            {:else}
              {#if d.state === 'completed'}
                <button class="ghost small-button" onclick={() => downloads.show(d.id)}>{isMac ? t('Show in Finder') : t('Show in folder')}</button>
              {/if}
              <button class="icon-button" title={t('Remove from list')} onclick={() => downloads.forget(d.id)}><Icon name="close" size={15} /></button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>

<style>
  .page {
    height: 100%;
    overflow: auto;
    background: var(--surface);
  }
  .inner {
    max-width: 720px;
    margin: 0 auto;
    padding: 40px 20px 64px;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
  }
  h1 {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.02em;
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--card);
    overflow: hidden;
  }
  li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-top: 1px solid var(--border);
  }
  li:first-child {
    border-top: 0;
  }
  .icon {
    flex: none;
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: 10px;
    background: var(--accent-soft);
  }
  .text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .name {
    padding: 0;
    border: 0;
    background: none;
    color: var(--text);
    font: inherit;
    font-size: 14.5px;
    font-weight: 600;
    text-align: left;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    cursor: pointer;
  }
  .name:hover {
    text-decoration: underline;
  }
  .name.plain {
    cursor: default;
  }
  .bar {
    height: 4px;
    border-radius: 2px;
    background: var(--hover);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--accent);
  }
  .muted {
    color: var(--muted);
  }
  .small {
    font-size: 12.5px;
  }
  button {
    font: inherit;
  }
  .ghost {
    height: 32px;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: 9px;
    background: var(--card);
    color: var(--text);
    font-size: 13px;
    font-weight: 600;
  }
  .small-button {
    flex: none;
  }
  .icon-button {
    flex: none;
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border: 0;
    border-radius: 8px;
    background: none;
    color: var(--muted);
  }
  .icon-button:hover {
    background: var(--hover);
    color: var(--text);
  }
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 48px 20px;
    border: 1px dashed var(--border);
    border-radius: 16px;
    color: var(--muted);
    text-align: center;
  }
  .empty p {
    margin: 0;
    color: var(--text);
  }
  .empty p.muted {
    color: var(--muted);
  }
</style>
