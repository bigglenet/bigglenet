<script lang="ts" module>
  // Previews already fetched, so scrolling a chat doesn't ask again.
  type Preview = { site: string; title: string | null; description: string | null; image: string | null; icon: string | null };
  const cache = new Map<string, Promise<Preview | null>>();
</script>

<script lang="ts">
  // A biggle:// link in a chat message: the page's title, description and picture.
  import { api } from '../../lib/api';

  let { href, onopen }: { href: string; onopen: () => void } = $props();

  let preview = $state<Preview | null>(null);
  $effect(() => {
    const url = href;
    let p = cache.get(url);
    if (!p) {
      p = api<Preview>('GET', `/api/link-preview?url=${encodeURIComponent(url)}`).catch(() => null);
      cache.set(url, p);
    }
    p.then((r) => href === url && (preview = r));
  });
</script>

{#if preview && (preview.title || preview.description || preview.image)}
  <button class="card" onclick={onopen}>
    {#if preview.image}<img class="image" src={preview.image} alt="" loading="lazy" />{/if}
    <span class="text">
      <span class="site">
        {#if preview.icon}<img src={preview.icon} alt="" width="14" height="14" />{/if}
        {preview.site}
      </span>
      {#if preview.title}<strong>{preview.title}</strong>{/if}
      {#if preview.description}<span class="description">{preview.description}</span>{/if}
    </span>
  </button>
{/if}

<style>
  .card {
    display: flex;
    flex-direction: column;
    width: 280px;
    max-width: 100%;
    margin-top: 4px;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 14px;
    overflow: hidden;
    background: var(--card);
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .card:hover {
    border-color: var(--accent);
  }
  .image {
    width: 100%;
    max-height: 150px;
    object-fit: cover;
    background: var(--hover);
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 9px 12px 10px;
  }
  .site {
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--muted);
    font-size: 11.5px;
  }
  .site img {
    border-radius: 3px;
  }
  strong {
    font-size: 13.5px;
    line-height: 1.3;
  }
  .description {
    color: var(--muted);
    font-size: 12.5px;
    line-height: 1.35;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
