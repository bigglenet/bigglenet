<script lang="ts">
  // Signing a site's guestbook. The browser asks, not the page, so a page can't sign for you.
  import { account } from '../lib/account.svelte';
  import { api, errorText } from '../lib/api';
  import { overlays } from '../lib/overlays.svelte';
  import { signing, type GuestbookNote } from '../lib/signing.svelte';
  import { siteHost } from '../lib/url';

  const MAX = 500;
  const site = $derived(signing.request?.site ?? '');

  let text = $state('');
  let sending = $state(false);
  let error = $state('');
  let box = $state<HTMLTextAreaElement>();

  $effect(() => {
    const release = overlays.hold();
    box?.focus();
    return release;
  });

  async function send(e: SubmitEvent) {
    e.preventDefault();
    if (!text.trim() || sending) return;
    sending = true;
    error = '';
    try {
      const { note } = await api<{ note: GuestbookNote }>('POST', `/api/sites/${encodeURIComponent(site)}/guestbook`, { body: text });
      text = '';
      signing.finish(note);
    } catch (err) {
      error = errorText(err);
    } finally {
      sending = false;
    }
  }
</script>

<div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && signing.finish(null)}>
  <div class="dialog" role="dialog" aria-modal="true" aria-label="Sign the guestbook" tabindex="-1" onkeydown={(e) => e.key === 'Escape' && signing.finish(null)}>
    <form onsubmit={send}>
      <h2>Sign {siteHost(site)}’s guestbook</h2>
      <p class="muted">Everyone who visits can read it, signed <strong>{account.user?.username}</strong>.</p>
      <textarea bind:this={box} bind:value={text} rows="4" maxlength={MAX} placeholder="Say hi, leave a compliment…" aria-label="Your note"></textarea>
      <div class="foot">
        <span class="count" class:near={text.length > MAX - 50}>{text.length}/{MAX}</span>
        <button type="button" class="ghost" onclick={() => signing.finish(null)}>Cancel</button>
        <button class="primary" disabled={!text.trim() || sending}>{sending ? 'Signing…' : 'Sign it'}</button>
      </div>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
    </form>
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
    width: min(440px, 100%);
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 20px;
    border: 1px solid var(--border);
    border-radius: 18px;
    background: var(--card);
    box-shadow: 0 30px 70px -30px rgb(0 0 0 / 0.5);
  }
  h2 {
    margin: 0;
    font-size: 18px;
    overflow-wrap: anywhere;
  }
  p {
    margin: 0;
  }
  .muted {
    color: var(--muted);
    font-size: 13.5px;
  }
  textarea {
    resize: vertical;
    min-height: 90px;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 15px;
  }
  textarea:focus {
    outline: 0;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .foot {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .count {
    flex: 1;
    color: var(--muted);
    font-size: 12.5px;
  }
  .count.near {
    color: var(--danger);
  }
  .primary,
  .ghost {
    height: 36px;
    padding: 0 16px;
    border-radius: 10px;
    font: inherit;
    font-size: 14px;
    font-weight: 600;
  }
  .primary {
    border: 0;
    background: var(--accent);
    color: var(--on-accent);
  }
  .primary:disabled {
    opacity: 0.5;
  }
  .ghost {
    border: 1px solid var(--border);
    background: none;
    color: var(--text);
  }
  .error {
    color: var(--danger);
    font-size: 13.5px;
  }
</style>
