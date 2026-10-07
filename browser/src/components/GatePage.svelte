<script lang="ts">
  import type { Gate } from '../lib/gate';

  let { gate }: { gate: Exclude<Gate, 'ok'> } = $props();

  const RELEASES = 'https://github.com/bigglenet/bigglenet/releases/latest';
  const os = /Win/.test(navigator.platform) ? 'Windows' : /Linux/.test(navigator.platform) ? 'Linux' : 'Mac';

  // Android browsers can offer their own install prompt.
  type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
  let installPrompt = $state<InstallPrompt | null>(null);
  let installed = $state(false);

  $effect(() => {
    const onprompt = (e: Event) => {
      e.preventDefault();
      installPrompt = e as InstallPrompt;
    };
    const oninstalled = () => {
      installed = true;
      installPrompt = null;
    };
    addEventListener('beforeinstallprompt', onprompt);
    addEventListener('appinstalled', oninstalled);
    return () => {
      removeEventListener('beforeinstallprompt', onprompt);
      removeEventListener('appinstalled', oninstalled);
    };
  });

  async function install() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') installed = true;
    installPrompt = null;
  }
</script>

<div class="gate">
  <main>
    <span class="logo-word" aria-hidden="true"></span>

    {#if gate === 'desktop'}
      <h1>Bigglenet lives in its own app</h1>
      <p>On a computer, the Bigglenet only opens in the Biggle desktop app. It's free and tiny.</p>
      <div class="actions">
        <a class="primary" href={RELEASES}>Download for {os}</a>
        <a class="secondary" href="biggle://home.biggle/">I have it, open Bigglenet</a>
      </div>
      <p class="small">Also for {os === 'Mac' ? 'Windows and Linux' : os === 'Windows' ? 'Mac and Linux' : 'Mac and Windows'}. On a phone? Open this page there and add it to your home screen.</p>
    {:else if installed}
      <h1>You're all set</h1>
      <p>Open <strong>Bigglenet</strong> from your home screen.</p>
    {:else}
      <h1>Add Bigglenet to your home screen</h1>
      <p>On phones, the Bigglenet works as an app on your home screen, not in a browser tab.</p>
      {#if installPrompt}
        <div class="actions">
          <button class="primary" onclick={install}>Install Bigglenet</button>
        </div>
      {:else}
        <ol>
          {#if gate === 'ios'}
            <li>Tap the <strong>Share</strong> button <svg class="share" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4M8 10H5v11h14V10h-3" /></svg> in your browser.</li>
            <li>Choose <strong>Add to Home Screen</strong>.</li>
          {:else}
            <li>Open your browser's menu (<strong>⋮</strong>).</li>
            <li>Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
          {/if}
          <li>Open <strong>Bigglenet</strong> from your home screen.</li>
        </ol>
      {/if}
    {/if}
  </main>
</div>

<style>
  .gate {
    min-height: 100vh;
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: calc(24px + env(safe-area-inset-top)) 20px calc(24px + env(safe-area-inset-bottom));
    background: var(--surface);
    overflow: auto;
  }
  main {
    width: min(460px, 100%);
    text-align: center;
  }
  .logo-word {
    height: 96px;
    margin-bottom: 28px;
  }
  h1 {
    margin: 0 0 10px;
    font-size: clamp(26px, 6vw, 32px);
    letter-spacing: -0.03em;
    line-height: 1.15;
  }
  p {
    margin: 0 0 24px;
    color: var(--muted);
    line-height: 1.55;
  }
  .small {
    margin: 24px 0 0;
    font-size: 14px;
  }
  .actions {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .primary,
  .secondary {
    display: block;
    padding: 14px 18px;
    border-radius: 14px;
    font: inherit;
    font-weight: 700;
    text-decoration: none;
    cursor: pointer;
  }
  .primary {
    border: 0;
    background: var(--accent);
    color: var(--on-accent);
  }
  .secondary {
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--text);
  }
  ol {
    margin: 0;
    padding: 0;
    list-style: none;
    counter-reset: step;
    text-align: left;
  }
  li {
    position: relative;
    margin-bottom: 10px;
    padding: 14px 16px 14px 56px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--card);
    counter-increment: step;
  }
  li::before {
    content: counter(step);
    position: absolute;
    left: 14px;
    top: 50%;
    translate: 0 -50%;
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--on-accent);
    font-weight: 700;
    font-size: 14px;
  }
  .share {
    width: 18px;
    height: 18px;
    vertical-align: -3px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
