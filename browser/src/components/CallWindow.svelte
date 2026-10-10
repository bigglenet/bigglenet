<script lang="ts">
  // The call you're in: a small window in the corner, or the whole screen.
  import { account } from '../lib/account.svelte';
  import { calls, type Remote } from '../lib/calls.svelte';
  import { duration, srcObject } from '../lib/chatformat';
  import { chats } from '../lib/chats.svelte';
  import { social } from '../lib/social.svelte';
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';

  const chat = $derived(calls.chat);
  const title = $derived(chat ? chats.title(chat) : 'Call');
  const me = $derived(account.user?.username ?? '');

  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(t);
  });
  const started = $derived(chat?.callStarted ?? calls.joinedAt);
  const connected = $derived(calls.remotes.some((r) => r.state === 'connected'));
  const status = $derived(
    calls.remotes.length === 0 ? (chat?.kind === 'group' ? 'Waiting for people to join…' : 'Ringing…') : connected ? duration(now - started) : 'Connecting…',
  );

  const hasVideo = (r: Remote) => r.video && !!r.stream?.getVideoTracks().length;

  function openChat() {
    if (calls.chatId === null) return;
    calls.expanded = false;
    social.showChat(calls.chatId);
  }
</script>

{#snippet tile(name: string, stream: MediaStream | null, video: boolean, opts: { mine?: boolean; muted?: boolean; speaking?: boolean; note?: string })}
  <div class="tile" class:speaking={opts.speaking} class:has-video={video}>
    {#if video && stream}
      <video use:srcObject={stream} autoplay playsinline muted class:mirror={opts.mine}></video>
    {:else}
      <Avatar {name} size={calls.expanded ? 84 : 48} />
    {/if}
    <span class="tag">
      {#if opts.muted}<Icon name="micOff" size={12} />{/if}
      {opts.mine ? 'You' : name}
    </span>
    {#if opts.note}<span class="note">{opts.note}</span>{/if}
  </div>
{/snippet}

<div class="call" class:big={calls.expanded} role="dialog" aria-label="Call in {title}">
  <header>
    <button class="what" onclick={openChat} title="Open the chat">
      <strong>{title}</strong>
      <span>{status}</span>
    </button>
    <button class="icon" aria-label={calls.expanded ? 'Make smaller' : 'Make bigger'} title={calls.expanded ? 'Smaller' : 'Bigger'} onclick={() => (calls.expanded = !calls.expanded)}>
      <Icon name={calls.expanded ? 'shrink' : 'expand'} size={16} />
    </button>
  </header>

  <div class="tiles" class:many={calls.remotes.length > 1} class:solo={calls.remotes.length === 0}>
    {#each calls.remotes as r (r.username)}
      {@render tile(social.nameOf(r.username), r.stream, hasVideo(r), {
        muted: !r.audio,
        speaking: r.speaking,
        note: r.state === 'connecting' ? 'Connecting…' : r.state === 'lost' ? 'Reconnecting…' : '',
      })}
    {/each}
    {@render tile(me, calls.preview, calls.cameraOn, { mine: true, muted: !calls.micOn, speaking: calls.speaking })}
  </div>

  <!-- What everyone says. Pictures are muted, so the sound comes from here. -->
  {#each calls.remotes as r (r.username)}
    {#if r.stream}<audio use:srcObject={r.stream} autoplay></audio>{/if}
  {/each}

  <footer>
    <button class="round" class:off={!calls.micOn} aria-pressed={!calls.micOn} aria-label={calls.micOn ? 'Mute' : 'Unmute'} title={calls.micOn ? 'Mute' : 'Unmute'} onclick={() => calls.toggleMic()}>
      <Icon name={calls.micOn ? 'mic' : 'micOff'} size={19} />
    </button>
    <button class="round" class:off={!calls.cameraOn} aria-pressed={calls.cameraOn} aria-label={calls.cameraOn ? 'Turn camera off' : 'Turn camera on'} title={calls.cameraOn ? 'Camera off' : 'Camera on'} onclick={() => calls.toggleCamera()}>
      <Icon name={calls.cameraOn ? 'video' : 'videoOff'} size={19} />
    </button>
    <button class="round end" aria-label="Leave call" title="Leave" onclick={() => calls.leave()}>
      <Icon name="hangUp" size={20} />
    </button>
  </footer>
</div>

<style>
  .call {
    position: fixed;
    right: 16px;
    bottom: calc(16px + env(safe-area-inset-bottom));
    z-index: 40;
    display: flex;
    flex-direction: column;
    width: 320px;
    max-width: calc(100vw - 32px);
    max-height: calc(100vh - 120px);
    overflow: hidden;
    border-radius: 18px;
    background: #161616;
    color: #f6f4f0;
    box-shadow: 0 18px 50px rgb(0 0 0 / 0.35);
  }
  .call.big {
    inset: 0;
    width: auto;
    max-width: none;
    max-height: none;
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
    border-radius: 0;
    background: #111;
  }
  button {
    font: inherit;
    cursor: pointer;
  }

  header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 10px 6px 14px;
  }
  .big header {
    padding: 16px 20px 8px 24px;
  }
  .what {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    line-height: 1.25;
    text-align: left;
  }
  .what strong {
    overflow: hidden;
    font-size: 14.5px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .big .what strong {
    font-size: 18px;
  }
  .what span {
    color: #a5a29b;
    font-size: 12.5px;
    font-variant-numeric: tabular-nums;
  }
  .icon {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: 9px;
    background: none;
    color: inherit;
  }
  .icon:hover {
    background: rgb(255 255 255 / 0.1);
  }

  .tiles {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 1fr;
    gap: 6px;
    padding: 6px 10px;
    overflow: auto;
  }
  .tiles.many {
    grid-template-columns: 1fr 1fr;
  }
  .big .tiles {
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    grid-auto-rows: minmax(180px, 1fr);
    gap: 10px;
    padding: 10px 24px;
  }
  .big .tiles.solo {
    grid-template-columns: minmax(280px, 720px);
    justify-content: center;
  }
  .tile {
    position: relative;
    display: grid;
    place-items: center;
    min-height: 0;
    aspect-ratio: 4 / 3;
    overflow: hidden;
    border-radius: 12px;
    background: #262626;
    box-shadow: 0 0 0 0 transparent;
    transition: box-shadow 0.15s;
  }
  .big .tile {
    aspect-ratio: auto;
  }
  .tile.speaking {
    box-shadow: inset 0 0 0 3px #5ccf8a;
  }
  video {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .big video {
    object-fit: contain;
    background: #000;
  }
  video.mirror {
    transform: scaleX(-1);
  }
  .tag {
    position: absolute;
    left: 8px;
    bottom: 8px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    max-width: calc(100% - 16px);
    padding: 2px 8px;
    overflow: hidden;
    border-radius: 8px;
    background: rgb(0 0 0 / 0.55);
    font-size: 12px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .note {
    position: absolute;
    top: 8px;
    left: 8px;
    color: #a5a29b;
    font-size: 11.5px;
  }
  audio {
    display: none;
  }

  footer {
    display: flex;
    justify-content: center;
    gap: 12px;
    padding: 8px 10px 14px;
  }
  .big footer {
    padding: 16px 20px 24px;
  }
  .round {
    display: grid;
    place-items: center;
    width: 46px;
    height: 46px;
    border: 0;
    border-radius: 50%;
    background: rgb(255 255 255 / 0.14);
    color: #fff;
  }
  .big .round {
    width: 54px;
    height: 54px;
  }
  .round:hover {
    background: rgb(255 255 255 / 0.22);
  }
  .round.off {
    background: #f6f4f0;
    color: #161616;
  }
  .round.end {
    background: #d93025;
  }
  .round.end:hover {
    background: #b3261e;
  }

  @media (max-width: 699px) {
    .call:not(.big) {
      right: 8px;
      left: 8px;
      width: auto;
      max-width: none;
    }
  }
</style>
