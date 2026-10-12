<script lang="ts">
  // A file sent in a chat: a picture, a video, a voice message, a song, or a file to download.
  import { SERVER } from '../../lib/config';
  import type { Attachment } from '../../lib/chats.svelte';
  import { duration } from '../../lib/chatformat';
  import { t } from '../../lib/i18n.svelte';
  import { openExternal } from '../../lib/platform';
  import Icon from '../Icon.svelte';

  let { a, mine, onopen }: { a: Attachment; mine: boolean; onopen: (a: Attachment) => void } = $props();

  // Links from the server are relative to it.
  const url = $derived(a.url.startsWith('/') ? SERVER + a.url : a.url);
  const isImage = $derived(a.inline && a.type.startsWith('image/'));
  const isVideo = $derived(a.inline && a.type.startsWith('video/'));
  const isAudio = $derived(a.inline && a.type.startsWith('audio/'));

  // Pictures keep their shape while loading.
  const box = $derived.by(() => {
    if (!a.width || !a.height) return null;
    const w = Math.min(280, a.width);
    return { w, h: Math.round((w * a.height) / a.width) };
  });

  // Voice messages and songs.
  let audio = $state<HTMLAudioElement>();
  let playing = $state(false);
  let at = $state(0);
  let measured = $state(0);
  const length = $derived(measured || a.duration || 0);

  function size(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function toggle() {
    if (!audio) return;
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  }

  function seek(e: MouseEvent) {
    if (!audio || !length) return;
    const bar = e.currentTarget as HTMLElement;
    const r = bar.getBoundingClientRect();
    audio.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * length;
  }
</script>

{#if isImage}
  <button class="picture" style:width={box ? `${box.w}px` : null} style:aspect-ratio={box ? `${box.w} / ${box.h}` : null} onclick={() => onopen(a)} title={a.name}>
    <img src={url} alt={a.name} loading="lazy" />
  </button>
{:else if isVideo}
  <!-- svelte-ignore a11y_media_has_caption -->
  <video class="video" src={url} controls preload="metadata" playsinline></video>
{:else if isAudio}
  <div class="voice" class:mine>
    <button class="play" aria-label={playing ? t('Pause') : t('Play')} onclick={toggle}>
      <Icon name={playing ? 'pause' : 'play'} size={15} filled />
    </button>
    <div class="track">
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div class="bar" role="slider" tabindex="-1" aria-valuenow={at} aria-valuemax={length} aria-label={t('Position')} onclick={seek}>
        <span class="fill" style:width="{length ? (at / length) * 100 : 0}%"></span>
      </div>
      <span class="time">{a.voice ? '' : `${a.name} · `}{duration((playing || at ? at : length) * 1000)}</span>
    </div>
    <audio
      bind:this={audio}
      src={url}
      preload="metadata"
      onplay={() => (playing = true)}
      onpause={() => (playing = false)}
      onended={() => ((playing = false), (at = 0))}
      ontimeupdate={() => audio && (at = audio.currentTime)}
      onloadedmetadata={() => audio && Number.isFinite(audio.duration) && (measured = audio.duration)}
    ></audio>
  </div>
{:else}
  <button class="file" class:mine onclick={() => openExternal(url)} title={t('Download {name}', { name: a.name })}>
    <span class="icon"><Icon name="file" size={18} /></span>
    <span class="text">
      <strong>{a.name}</strong>
      <span>{size(a.size)}</span>
    </span>
    <Icon name="download" size={16} />
  </button>
{/if}

<style>
  button {
    font: inherit;
    cursor: pointer;
  }
  .picture {
    display: block;
    max-width: 100%;
    padding: 0;
    border: 0;
    border-radius: 14px;
    overflow: hidden;
    background: var(--hover);
  }
  .picture img {
    display: block;
    width: 100%;
    height: 100%;
    max-height: 340px;
    object-fit: cover;
  }
  .video {
    display: block;
    width: 280px;
    max-width: 100%;
    max-height: 320px;
    border-radius: 14px;
    background: #000;
  }
  .voice {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 230px;
    max-width: 100%;
    padding: 8px 12px 8px 8px;
    border: 1px solid var(--border);
    border-radius: 18px;
    background: var(--card);
  }
  .voice.mine {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--on-accent);
  }
  .play {
    flex: none;
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border: 0;
    border-radius: 50%;
    background: var(--accent);
    color: var(--on-accent);
  }
  .mine .play {
    background: var(--on-accent);
    color: var(--accent);
  }
  .track {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .bar {
    position: relative;
    height: 4px;
    border-radius: 2px;
    background: color-mix(in srgb, currentColor 22%, transparent);
    cursor: pointer;
  }
  .fill {
    position: absolute;
    inset: 0 auto 0 0;
    border-radius: 2px;
    background: currentColor;
  }
  .time {
    font-size: 11.5px;
    opacity: 0.75;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  audio {
    display: none;
  }
  .file {
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: 280px;
    padding: 9px 12px 9px 9px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--card);
    color: var(--text);
    text-align: left;
  }
  .file.mine {
    border-color: var(--accent);
  }
  .file .icon {
    flex: none;
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: 10px;
    background: var(--accent-soft);
  }
  .file .text {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .file strong {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 13.5px;
  }
  .file .text span {
    color: var(--muted);
    font-size: 12px;
  }
</style>
