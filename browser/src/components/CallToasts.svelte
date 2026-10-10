<script lang="ts">
  // Someone calling you, and short notes about calls ("No answer").
  import { calls } from '../lib/calls.svelte';
  import { chats } from '../lib/chats.svelte';
  import { social } from '../lib/social.svelte';
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';

  const ring = $derived(calls.ringing);
  const chat = $derived(chats.get(ring?.chatId ?? null));
  const caller = $derived(ring ? social.nameOf(ring.from) : '');
  const where = $derived(chat?.kind === 'group' ? chats.title(chat) : '');
</script>

{#if ring}
  <div class="ring" role="alertdialog" aria-label="{caller} is calling">
    <Avatar name={caller} size={44} />
    <div class="who">
      <strong>{caller}</strong>
      <span>{ring.video ? 'Video call' : 'Voice call'}{where ? ` · ${where}` : ''}</span>
    </div>
    <div class="buttons">
      <button class="round no" aria-label="Decline" title="Decline" onclick={() => calls.decline()}><Icon name="hangUp" size={18} /></button>
      {#if ring.video}
        <button class="round yes" aria-label="Answer with video" title="Answer with video" onclick={() => calls.accept()}><Icon name="video" size={18} /></button>
      {/if}
      <button
        class="round yes"
        aria-label={ring.video ? 'Answer with voice only' : 'Answer'}
        title={ring.video ? 'Voice only' : 'Answer'}
        onclick={() => ring && calls.join(ring.chatId, false)}><Icon name="phone" size={18} /></button
      >
    </div>
  </div>
{/if}

{#if calls.notice}
  <div class="notice" role="status">{calls.notice}</div>
{/if}

<style>
  .ring {
    position: fixed;
    top: calc(56px + env(safe-area-inset-top));
    right: 16px;
    z-index: 45;
    display: flex;
    align-items: center;
    gap: 12px;
    width: 360px;
    max-width: calc(100vw - 32px);
    padding: 12px 12px 12px 14px;
    border-radius: 18px;
    background: #161616;
    color: #f6f4f0;
    box-shadow: 0 18px 50px rgb(0 0 0 / 0.35);
    animation: drop 0.25s ease-out;
  }
  @keyframes drop {
    from {
      opacity: 0;
      transform: translateY(-12px);
    }
  }
  .ring :global(.avatar) {
    animation: pulse 1.4s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      box-shadow: 0 0 0 6px rgb(92 207 138 / 0.35);
    }
  }
  .who {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.3;
  }
  .who strong,
  .who span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .who span {
    color: #a5a29b;
    font-size: 13px;
  }
  .buttons {
    display: flex;
    gap: 8px;
  }
  .round {
    display: grid;
    place-items: center;
    width: 42px;
    height: 42px;
    border: 0;
    border-radius: 50%;
    color: #fff;
    cursor: pointer;
  }
  .no {
    background: #d93025;
  }
  .yes {
    background: #2f9e5b;
  }
  .no:hover {
    background: #b3261e;
  }
  .yes:hover {
    background: #278a4e;
  }
  .notice {
    position: fixed;
    left: 50%;
    bottom: calc(24px + env(safe-area-inset-bottom));
    z-index: 45;
    max-width: calc(100vw - 32px);
    padding: 10px 16px;
    border-radius: 12px;
    background: #161616;
    color: #f6f4f0;
    font-size: 14px;
    box-shadow: 0 10px 30px rgb(0 0 0 / 0.25);
    transform: translateX(-50%);
  }
</style>
