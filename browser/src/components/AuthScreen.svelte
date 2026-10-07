<script lang="ts">
  // The first thing you see: you need a Biggle ID (email or Google) to use Bigglenet.
  import { account, type Ticket } from '../lib/account.svelte';
  import { errorText } from '../lib/api';

  type Step =
    | 'welcome'
    | 'signin'
    | 'signup'
    | 'signup-code'
    | 'reset'
    | 'reset-code'
    | 'google-wait'
    | 'google-username'
    | 'add-email'
    | 'add-email-code';

  let step = $state<Step>(account.needsEmail ? 'add-email' : 'welcome');
  let email = $state('');
  let username = $state('');
  let password = $state('');
  let code = $state('');
  let ticket = $state<Ticket | null>(null);
  let googleId = $state('');
  let busy = $state(false);
  let error = $state('');
  let googleAbort: AbortController | null = null;

  $effect(() => {
    if (account.needsEmail && !step.startsWith('add-email')) step = 'add-email';
  });

  function go(next: Step) {
    error = '';
    code = '';
    googleAbort?.abort();
    step = next;
  }

  async function run(fn: () => Promise<unknown>) {
    busy = true;
    error = '';
    try {
      await fn();
    } catch (e) {
      if ((e as Error).name !== 'AbortError') error = errorText(e);
    } finally {
      busy = false;
    }
  }

  const submit = (fn: () => Promise<unknown>) => (e: SubmitEvent) => {
    e.preventDefault();
    run(fn);
  };

  // Test servers send the code back instead of emailing it.
  const withCode = (t: Ticket) => {
    ticket = t;
    code = t.devCode ?? '';
  };

  function google() {
    googleAbort = new AbortController();
    const signal = googleAbort.signal;
    step = 'google-wait';
    run(async () => {
      try {
        const r = await account.googleSignIn(signal);
        if (r.result === 'username') {
          googleId = r.id;
          email = r.email ?? '';
          username = (r.email ?? '').split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24);
          step = 'google-username';
        }
      } catch (e) {
        step = 'welcome';
        throw e;
      }
    });
  }
</script>

<div class="auth">
  <main>
    <span class="logo-word" aria-hidden="true"></span>

    {#if step === 'welcome'}
      <h1>The internet, but smaller and nicer</h1>
      <p class="lede">Make a Biggle ID to explore .biggle sites, chat with friends and build your own site.</p>
      <div class="stack">
        {#if account.google}
          <button class="google" onclick={google}>
            <svg viewBox="0 0 24 24" aria-hidden="true"
              ><path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8z" /><path
                fill="#34A853"
                d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.9A11 11 0 0 0 12 23z"
              /><path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7H2.1a11 11 0 0 0 0 10l3.7-2.9z" /><path
                fill="#EA4335"
                d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7l3.7 2.9C6.7 7.3 9.1 5.4 12 5.4z"
              /></svg
            >
            Continue with Google
          </button>
        {/if}
        {#if account.email}
          <button class="primary" onclick={() => go('signup')}>Sign up with email</button>
        {/if}
        <button class={account.email || account.google ? 'secondary' : 'primary'} onclick={() => go('signin')}>
          I already have an account
        </button>
      </div>
      {#if !account.email && !account.google}
        <p class="note">New accounts open very soon.</p>
      {/if}
    {:else if step === 'signin'}
      <h1>Welcome back</h1>
      <form class="stack" onsubmit={submit(() => account.signIn(username, password))}>
        <input bind:value={username} placeholder="Email or username" autocomplete="username" autocapitalize="off" spellcheck="false" required />
        <input bind:value={password} type="password" placeholder="Password" autocomplete="current-password" required />
        <button class="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <p class="links">
        {#if account.email}<button class="link" onclick={() => go('reset')}>Forgot your password?</button>{/if}
        <button class="link" onclick={() => go('welcome')}>Back</button>
      </p>
    {:else if step === 'signup'}
      <h1>Make your Biggle ID</h1>
      <form
        class="stack"
        onsubmit={submit(async () => {
          withCode(await account.signUpStart(email, username, password));
          step = 'signup-code';
        })}
      >
        <input bind:value={email} type="email" placeholder="Email address" autocomplete="email" required />
        <input bind:value={username} placeholder="Username" autocomplete="username" autocapitalize="off" spellcheck="false" required />
        <input bind:value={password} type="password" placeholder="Password (8+ characters)" autocomplete="new-password" minlength="8" required />
        <button class="primary" disabled={busy}>{busy ? 'Sending code…' : 'Continue'}</button>
      </form>
      <p class="links"><button class="link" onclick={() => go('welcome')}>Back</button></p>
    {:else if step === 'signup-code' || step === 'add-email-code'}
      <h1>Check your email</h1>
      <p class="lede">We sent a 6-digit code to <strong>{email}</strong>.</p>
      <form
        class="stack"
        onsubmit={submit(() =>
          step === 'signup-code' ? account.signUpFinish(ticket!.ticket, code) : account.emailFinish(ticket!.ticket, code),
        )}
      >
        <input
          class="code"
          bind:value={code}
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="6"
          placeholder="000000"
          aria-label="Code"
          required
        />
        <button class="primary" disabled={busy || code.length < 6}>{busy ? 'Checking…' : 'Confirm'}</button>
      </form>
      <p class="links">
        <button
          class="link"
          onclick={() =>
            run(async () => withCode(step === 'signup-code' ? await account.signUpStart(email, username, password) : await account.emailStart(email)))}
          >Send a new code</button
        >
        <button class="link" onclick={() => go(step === 'signup-code' ? 'signup' : 'add-email')}>Use a different email</button>
      </p>
    {:else if step === 'reset'}
      <h1>Reset your password</h1>
      <p class="lede">We'll email you a code.</p>
      <form
        class="stack"
        onsubmit={submit(async () => {
          withCode(await account.resetStart(email));
          step = 'reset-code';
        })}
      >
        <input bind:value={email} type="email" placeholder="Email address" autocomplete="email" required />
        <button class="primary" disabled={busy}>{busy ? 'Sending…' : 'Send code'}</button>
      </form>
      <p class="links"><button class="link" onclick={() => go('signin')}>Back</button></p>
    {:else if step === 'reset-code'}
      <h1>Choose a new password</h1>
      <p class="lede">If there's an account for <strong>{email}</strong>, a code is on its way.</p>
      <form class="stack" onsubmit={submit(() => account.resetFinish(ticket!.ticket, code, password))}>
        <input class="code" bind:value={code} inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" aria-label="Code" required />
        <input bind:value={password} type="password" placeholder="New password (8+ characters)" autocomplete="new-password" minlength="8" required />
        <button class="primary" disabled={busy}>{busy ? 'Saving…' : 'Reset password'}</button>
      </form>
      <p class="links"><button class="link" onclick={() => go('signin')}>Back</button></p>
    {:else if step === 'google-wait'}
      <h1>Finish in your browser</h1>
      <p class="lede">Pick your Google account in the window that opened. We'll carry on here when you're done.</p>
      <div class="spinner" aria-hidden="true"></div>
      <p class="links"><button class="link" onclick={() => go('welcome')}>Cancel</button></p>
    {:else if step === 'google-username'}
      <h1>Pick a username</h1>
      <p class="lede">It's how friends find you{email ? `. You're signing in as ${email}` : ''}.</p>
      <form class="stack" onsubmit={submit(() => account.googleFinish(googleId, username))}>
        <input bind:value={username} placeholder="Username" autocapitalize="off" spellcheck="false" required />
        <button class="primary" disabled={busy}>{busy ? 'One moment…' : 'Done'}</button>
      </form>
    {:else if step === 'add-email'}
      <h1>One more thing</h1>
      <p class="lede">Every Biggle ID now has an email address, so you can always get back in. Add yours, {account.user?.username}.</p>
      <form
        class="stack"
        onsubmit={submit(async () => {
          withCode(await account.emailStart(email));
          step = 'add-email-code';
        })}
      >
        <input bind:value={email} type="email" placeholder="Email address" autocomplete="email" required />
        <button class="primary" disabled={busy}>{busy ? 'Sending code…' : 'Send code'}</button>
      </form>
      <p class="links"><button class="link" onclick={() => account.signOut()}>Sign out</button></p>
    {/if}

    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}
  </main>
</div>

<style>
  .auth {
    min-height: 100vh;
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: calc(24px + env(safe-area-inset-top)) 20px calc(24px + env(safe-area-inset-bottom));
    background: var(--surface);
    overflow: auto;
  }
  /* Room for the window buttons in the desktop app. */
  :global([data-titlebar='overlay']) .auth {
    padding-top: 48px;
  }
  main {
    width: min(380px, 100%);
    text-align: center;
  }
  .logo-word {
    height: 84px;
    margin-bottom: 28px;
  }
  h1 {
    margin: 0 0 8px;
    font-size: 25px;
    letter-spacing: -0.025em;
    line-height: 1.2;
  }
  .lede {
    margin: 0 0 22px;
    color: var(--muted);
    line-height: 1.5;
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 18px;
  }
  input {
    height: 48px;
    padding: 0 14px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--card);
    color: var(--text);
    font: inherit;
    font-size: 16px;
  }
  input:focus {
    outline: 0;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  input.code {
    text-align: center;
    font-size: 26px;
    font-weight: 700;
    letter-spacing: 0.3em;
  }
  button {
    font: inherit;
    cursor: pointer;
  }
  .primary,
  .secondary,
  .google {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    height: 50px;
    border-radius: 12px;
    font-weight: 700;
    font-size: 15.5px;
  }
  .primary {
    border: 0;
    background: var(--accent);
    color: var(--on-accent);
  }
  .primary:disabled {
    opacity: 0.55;
  }
  .secondary,
  .google {
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--text);
  }
  .google svg {
    width: 20px;
    height: 20px;
  }
  .links {
    display: flex;
    justify-content: center;
    gap: 18px;
    margin: 18px 0 0;
  }
  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--muted);
    font-size: 14px;
    text-decoration: underline;
  }
  .error {
    margin: 16px 0 0;
    color: var(--danger);
  }
  .note {
    margin: 18px 0 0;
    color: var(--muted);
    font-size: 14px;
  }
  .spinner {
    width: 32px;
    height: 32px;
    margin: 8px auto 0;
    border: 3px solid var(--accent-soft);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
