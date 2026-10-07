<script lang="ts">
  import { account } from '../lib/account.svelte';
  import { errorText } from '../lib/api';

  let dialog = $state<HTMLDialogElement>();
  let username = $state('');
  let password = $state('');
  let busy = $state(false);
  let error = $state('');

  const signup = $derived(account.dialog === 'signup');

  $effect(() => {
    dialog?.showModal();
  });

  function switchTo(mode: 'signin' | 'signup') {
    account.dialog = mode;
    error = '';
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    error = '';
    try {
      if (signup) await account.signUp(username, password);
      else await account.signIn(username, password);
      dialog?.close();
    } catch (err) {
      error = errorText(err);
    } finally {
      busy = false;
    }
  }
</script>

<dialog bind:this={dialog} onclose={() => (account.dialog = null)} aria-labelledby="auth-title">
  <span class="logo-mark" aria-hidden="true"></span>
  <h2 id="auth-title">{signup ? 'Join the Bigglenet' : 'Sign in to the Bigglenet'}</h2>
  <p class="lede">{signup ? 'Anyone can join. ' : ''}One Biggle ID works on every .biggle site.</p>

  <div class="switch" role="tablist">
    <button role="tab" aria-selected={!signup} onclick={() => switchTo('signin')}>Sign in</button>
    <button role="tab" aria-selected={signup} onclick={() => switchTo('signup')}>Create account</button>
  </div>

  <form onsubmit={submit}>
    <label>
      Username
      <input bind:value={username} autocomplete="username" autocapitalize="off" spellcheck="false" required />
    </label>
    <label>
      Password
      <input
        type="password"
        bind:value={password}
        autocomplete={signup ? 'new-password' : 'current-password'}
        minlength={signup ? 8 : undefined}
        required
      />
    </label>
    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}
    <div class="actions">
      <button type="button" onclick={() => dialog?.close()}>Cancel</button>
      <button class="primary" disabled={busy}>
        {busy ? 'One moment…' : signup ? 'Create account' : 'Sign in'}
      </button>
    </div>
  </form>
</dialog>

<style>
  dialog {
    width: min(400px, calc(100vw - 32px));
    padding: 28px 24px 24px;
    border: 1px solid var(--border);
    border-radius: 20px;
    background: var(--card);
    color: var(--text);
    box-shadow: 0 24px 60px -20px rgb(0 0 0 / 0.45);
  }
  dialog::backdrop {
    background: rgb(20 20 20 / 0.4);
    backdrop-filter: blur(2px);
  }
  .logo-mark {
    height: 40px;
    margin-bottom: 14px;
  }
  h2 {
    margin: 0 0 4px;
    font-size: 20px;
    letter-spacing: -0.01em;
  }
  .lede {
    margin: 0 0 18px;
    color: var(--muted);
    font-size: 14px;
  }

  .switch {
    display: grid;
    grid-template-columns: 1fr 1fr;
    padding: 3px;
    margin-bottom: 18px;
    border-radius: 11px;
    background: var(--field);
  }
  .switch button {
    padding: 7px;
    border: 0;
    border-radius: 8px;
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 13.5px;
    font-weight: 600;
  }
  .switch button[aria-selected='true'] {
    background: var(--card);
    color: var(--text);
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.12);
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
  }
  input {
    height: 40px;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 15px;
    font-weight: 400;
  }
  input:focus {
    outline: 0;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .error {
    margin: 0;
    color: var(--danger);
    font-size: 14px;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }
  .actions button {
    padding: 10px 16px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--card);
    color: var(--text);
    font: inherit;
    font-weight: 600;
  }
  .actions .primary {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--on-accent);
  }
  .actions .primary:disabled {
    opacity: 0.6;
  }
</style>
