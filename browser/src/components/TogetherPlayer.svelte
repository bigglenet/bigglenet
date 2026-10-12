<script lang="ts" module>
  // YouTube's player API, loaded once, the first time someone watches something together.
  type YTPlayer = {
    playVideo(): void;
    pauseVideo(): void;
    seekTo(seconds: number, allowSeekAhead: boolean): void;
    getCurrentTime(): number;
    destroy(): void;
  };
  type YT = { Player: new (el: HTMLElement, options: Record<string, unknown>) => YTPlayer; PlayerState: Record<string, number> };
  let youtube: Promise<YT> | null = null;
  function loadYouTube(): Promise<YT> {
    youtube ??= new Promise((resolve, reject) => {
      const w = window as unknown as { YT?: YT; onYouTubeIframeAPIReady?: () => void };
      if (w.YT?.Player) return resolve(w.YT);
      w.onYouTubeIframeAPIReady = () => resolve(w.YT!);
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.onerror = () => {
        youtube = null;
        reject(new Error('Couldn’t load YouTube.'));
      };
      document.head.append(script);
    });
    return youtube;
  }
</script>

<script lang="ts">
  // What everyone in the call is watching or listening to, in step (together.svelte.ts).
  import { untrack } from 'svelte';
  import { t } from '../lib/i18n.svelte';
  import { together, type Shared } from '../lib/together.svelte';
  import Icon from './Icon.svelte';

  let { shared }: { shared: Shared } = $props();

  let host = $state<HTMLElement>();
  let media = $state<HTMLVideoElement>();
  let error = $state('');

  // YouTube.
  $effect(() => {
    if (shared.kind !== 'youtube' || !host) return;
    const id = shared.id;
    let player: YTPlayer | null = null;
    let gone = false;
    let lastTime = 0;
    loadYouTube().then(
      (YT) => {
        if (gone || !host) return;
        const el = document.createElement('div');
        host.replaceChildren(el);
        player = new YT.Player(el, {
          videoId: id,
          host: 'https://www.youtube-nocookie.com',
          playerVars: { playsinline: 1, rel: 0, start: Math.floor(together.expected()) },
          events: {
            onReady: () => {
              together.player = {
                seek: (time) => player?.seekTo(time, true),
                play: () => player?.playVideo(),
                pause: () => player?.pauseVideo(),
                time: () => player?.getCurrentTime() ?? 0,
              };
              together.apply();
            },
            onStateChange: (e: { data: number }) => {
              const now = player?.getCurrentTime() ?? 0;
              if (e.data === YT.PlayerState.PLAYING) {
                // Starting again after a jump is a seek; otherwise, plain play.
                if (Math.abs(now - lastTime) > 2) together.local('seek', now, true);
                else together.local('play', now);
              } else if (e.data === YT.PlayerState.PAUSED) {
                together.local('pause', now);
              }
              lastTime = now;
            },
            onError: () => (error = t('This video can’t be played here. Try another link.')),
          },
        });
      },
      (e) => (error = e.message),
    );
    return () => {
      gone = true;
      together.player = null;
      player?.destroy();
    };
  });

  // A video or sound file.
  $effect(() => {
    if (shared.kind !== 'media' || !media) return;
    const el = media;
    untrack(() => {
      together.player = {
        seek: (time) => (el.currentTime = time),
        play: () => el.play().catch(() => {}),
        pause: () => el.pause(),
        time: () => el.currentTime,
      };
      together.apply();
    });
    return () => (together.player = null);
  });

  // Catch up now and then if we've drifted.
  $effect(() => {
    const timer = setInterval(() => together.keepInStep(), 3000);
    return () => clearInterval(timer);
  });

  const isAudio = $derived(/\.(mp3|ogg|oga|wav|m4a|aac|flac|opus)(\?|$)/i.test(shared.url));
</script>

<div class="together" class:audio={isAudio}>
  {#if shared.kind === 'youtube'}
    <div class="frame" bind:this={host}></div>
  {:else}
    <!-- svelte-ignore a11y_media_has_caption -->
    <video
      bind:this={media}
      src={shared.url}
      controls
      playsinline
      onplay={() => together.local('play', media?.currentTime ?? 0)}
      onpause={() => together.local('pause', media?.currentTime ?? 0)}
      onseeked={() => together.local('seek', media?.currentTime ?? 0, !media?.paused)}
      onerror={() => (error = t('This link doesn’t play here. Try a YouTube link or a link straight to a video or song.'))}
    ></video>
  {/if}
  <div class="bar">
    <Icon name="users" size={13} />
    <span class="what">{t('Playing for everyone in the call')}</span>
    <button onclick={() => together.stop()} title={t('Stop it for everyone')}><Icon name="close" size={13} /> {t('Stop')}</button>
  </div>
  {#if error}<p class="error">{error}</p>{/if}
</div>

<style>
  .together {
    display: flex;
    flex-direction: column;
    background: #000;
  }
  .frame,
  video {
    width: 100%;
    aspect-ratio: 16 / 9;
    border: 0;
    background: #000;
  }
  .frame :global(iframe) {
    width: 100%;
    height: 100%;
    border: 0;
  }
  .audio video {
    aspect-ratio: auto;
    height: 54px;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    background: #1d1d1d;
    color: #cfcbc4;
    font-size: 12px;
  }
  .what {
    flex: 1;
  }
  .bar button {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border: 1px solid #3a3a3a;
    border-radius: 7px;
    background: none;
    color: inherit;
    font: inherit;
  }
  .error {
    margin: 0;
    padding: 6px 10px;
    background: #2a1514;
    color: #f2a39b;
    font-size: 12.5px;
  }
</style>
