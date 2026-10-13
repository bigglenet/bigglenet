<script lang="ts">
  // The first thing you see: you need a Biggle ID (email or Google) to use Bigglenet.
  import { account, type Again, type Ticket } from '../lib/account.svelte';
  import Trans from './Trans.svelte';
  import { errorText } from '../lib/api';
  import { t } from '../lib/i18n.svelte';
  import { invite } from '../lib/invite.svelte';
  import { isApp, openExternal } from '../lib/platform';
  import { passkeysHere } from '../lib/webauthn';

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
    | 'add-email-code'
    | 'second-step'
    | 'passkey-wait'
    | 'mail';

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
  // Confirming by emailing us: what to do once the email lands, and where "back" goes.
  let mailFinish: (() => Promise<unknown>) | null = null;
  let mailBack = $state<Step>('welcome');

  $effect(() => {
    if (account.needsEmail && !step.startsWith('add-email') && step !== 'mail') step = 'add-email';
  });
  // Two-factor is on: the code is next (after a password, Google or a password reset).
  $effect(() => {
    if (account.secondStep && step !== 'second-step') {
      code = '';
      step = 'second-step';
    }
  });

  let passkeyAbort: AbortController | null = null;
  function passkey() {
    passkeyAbort = new AbortController();
    const signal = passkeyAbort.signal;
    // The desktop app waits for the system browser; the web asks right here.
    if (isApp) step = 'passkey-wait';
    run(async () => {
      try {
        await account.passkeySignIn(signal);
      } catch (e) {
        if (isApp) step = 'welcome';
        throw e;
      }
    });
  }
  const canPasskey = isApp || passkeysHere;

  function go(next: Step) {
    error = '';
    code = '';
    googleAbort?.abort();
    passkeyAbort?.abort();
    if (step === 'second-step') account.cancelSecondStep();
    step = next;
  }

  async function run(fn: () => Promise<unknown>) {
    if (busy) return;
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
    code = t.devCode ?? t.code ?? '';
  };

  // Confirming by emailing us is remembered in this browser, because phones often reload the
  // app while someone is off in their email app. Coming back picks up where they left off.
  type Flow = 'signup' | 'add-email' | 'reset';
  type Pending = { flow: Flow; email: string; ticket: string; code: string; join: string; at: number };
  const PENDING = 'biggle:confirming';
  const PENDING_MS = 15 * 60 * 1000;

  function loadPending(): Pending | null {
    try {
      const p = JSON.parse(localStorage.getItem(PENDING) ?? 'null') as Pending | null;
      return p && Date.now() - p.at < PENDING_MS ? p : null;
    } catch {
      return null;
    }
  }

  function savePending(p: Pending | null) {
    try {
      if (p) localStorage.setItem(PENDING, JSON.stringify(p));
      else localStorage.removeItem(PENDING);
    } catch {}
  }

  /** The code from last time, if they're starting the same thing again with the same email. */
  function again(flow: Flow): Again {
    const p = loadPending();
    return p && p.flow === flow && p.email === email.trim().toLowerCase() ? { ticket: p.ticket, code: p.code } : undefined;
  }

  const finishes: Record<Flow, () => Promise<unknown>> = {
    signup: () => account.signUpFinish(ticket!.ticket, code),
    'add-email': () => account.emailFinish(ticket!.ticket, code),
    reset: () => account.resetFinish(ticket!.ticket, code),
  };

  /** A code is ready: type in the emailed one, or (with `join`) email it to us and wait. */
  function confirm(t: Ticket, flow: Flow, codeStep: Step) {
    withCode(t);
    if (t.join) {
      savePending({ flow, email: email.trim().toLowerCase(), ticket: t.ticket, code: t.code ?? '', join: t.join, at: Date.now() });
      mailFinish = finishes[flow];
      mailBack = flow;
      step = 'mail';
    } else {
      step = codeStep;
    }
  }

  // Back from the email app after the page reloaded: carry on waiting.
  const resume = loadPending();
  if (resume && (resume.flow === 'add-email') === !!account.user) {
    email = resume.email;
    ticket = { ticket: resume.ticket, code: resume.code, join: resume.join };
    code = resume.code;
    mailFinish = finishes[resume.flow];
    mailBack = resume.flow;
    step = 'mail';
  }

  const mailto = $derived(
    ticket?.join
      ? `mailto:${ticket.join}?subject=${encodeURIComponent(`Bigglenet code ${ticket.code}`)}&body=${encodeURIComponent(`My Bigglenet code is ${ticket.code}.`)}`
      : '',
  );

  function openMail(e: MouseEvent) {
    if (!isApp) return;
    e.preventDefault();
    openExternal(mailto);
  }

  // While waiting for their email, check every few seconds and as soon as they come back here.
  $effect(() => {
    if (step !== 'mail' || !ticket) return;
    const id = ticket.ticket;
    let stopped = false;
    let checking = false;
    // Phones drop the connection when switching apps, so a lost connection just means try again.
    const offline = (e: unknown) => (e as { code?: string }).code === 'offline';
    const attempt = async () => {
      try {
        if (!(await account.codeConfirmed(id))) return;
      } catch (e) {
        if (offline(e)) return;
        stopped = true;
        if ((e as { code?: string }).code === 'code_expired') savePending(null);
        error = errorText(e);
        return;
      }
      busy = true;
      error = '';
      try {
        await mailFinish!();
        stopped = true;
        savePending(null);
      } catch (e) {
        if (offline(e)) return;
        stopped = true;
        error = errorText(e);
      } finally {
        busy = false;
      }
    };
    const check = async () => {
      if (stopped || checking) return;
      checking = true;
      try {
        await attempt();
      } finally {
        checking = false;
      }
    };
    const timer = setInterval(check, 3000);
    const onvisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onvisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onvisible);
    };
  });

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

    {#if invite.from && (step === 'welcome' || step === 'signup')}
      <p class="invited">{t('{from} invited you. Make a Biggle ID and you’ll be friends straight away.', { from: invite.from })}</p>
    {/if}

    {#if step === 'welcome'}
      <h1>{t('The internet, but smaller and nicer')}</h1>
      <p class="lede">{t('Make a Biggle ID to explore .biggle sites, chat with friends and build your own site.')}</p>
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
            {t('Continue with Google')}
          </button>
        {/if}
        {#if account.email}
          <button class="primary" onclick={() => go('signup')}>{t('Sign up with email')}</button>
        {/if}
        <button class={account.email || account.google ? 'secondary' : 'primary'} onclick={() => go('signin')}>
          {t('I already have an account')}
        </button>
        {#if canPasskey}
          <button class="secondary" onclick={passkey} disabled={busy}>{t('Sign in with a passkey')}</button>
        {/if}
      </div>
      {#if !account.email && !account.google}
        <p class="note">{t('New accounts open very soon.')}</p>
      {/if}
    {:else if step === 'signin'}
      <h1>{t('Welcome back')}</h1>
      <form class="stack" onsubmit={submit(() => account.signIn(username, password))}>
        <input bind:value={username} placeholder={t('Email or username')} aria-label={t('Email or username')} autocomplete="username" autocapitalize="off" spellcheck="false" required />
        <input bind:value={password} type="password" placeholder={t('Password')} aria-label={t('Password')} autocomplete="current-password" required />
        <button class="primary" disabled={busy}>{busy ? t('Signing in…') : t('Sign in')}</button>
      </form>
      <p class="links">
        {#if account.email}<button class="link" onclick={() => go('reset')}>{t('Forgot your password?')}</button>{/if}
        <button class="link" onclick={() => go('welcome')}>{t('Back')}</button>
      </p>
    {:else if step === 'signup'}
      <h1>{t('Make your Biggle ID')}</h1>
      <form
        class="stack"
        onsubmit={submit(async () =>
          confirm(await account.signUpStart(email, username, password, again('signup')), 'signup', 'signup-code'),
        )}
      >
        <input bind:value={email} type="email" placeholder={t('Email address')} aria-label={t('Email address')} autocomplete="email" required />
        <input bind:value={username} placeholder={t('Username')} aria-label={t('Username')} autocomplete="username" autocapitalize="off" spellcheck="false" required />
        <input bind:value={password} type="password" placeholder={t('Password (8+ characters)')} aria-label={t('Password (8+ characters)')} autocomplete="new-password" minlength="8" required />
        <button class="primary" disabled={busy}>{busy ? (account.join ? t('One moment…') : t('Sending code…')) : 'Continue'}</button>
      </form>
      <p class="links"><button class="link" onclick={() => go('welcome')}>{t('Back')}</button></p>
    {:else if step === 'signup-code' || step === 'add-email-code'}
      <h1>{t('Check your email')}</h1>
      <p class="lede"><Trans text={t('We sent a 6-digit code to {address}.')}>{#snippet address()}<strong>{email}</strong>{/snippet}</Trans></p>
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
          aria-label={t('Code')}
          required
        />
        <button class="primary" disabled={busy || code.length < 6}>{busy ? t('Checking…') : 'Confirm'}</button>
      </form>
      <p class="links">
        <button
          class="link"
          onclick={() =>
            run(async () => withCode(step === 'signup-code' ? await account.signUpStart(email, username, password) : await account.emailStart(email)))}
          >{t('Send a new code')}</button
        >
        <button class="link" onclick={() => go(step === 'signup-code' ? 'signup' : 'add-email')}>{t('Use a different email')}</button>
      </p>
    {:else if step === 'reset'}
      <h1>{t('Reset your password')}</h1>
      <p class="lede">{account.join ? t("Then you'll send us a quick email to prove it's you.") : t("We'll email you a code.")}</p>
      <form
        class="stack"
        onsubmit={submit(async () =>
          confirm(await account.resetStart(email, account.join ? password : undefined, again('reset')), 'reset', 'reset-code'),
        )}
      >
        <input bind:value={email} type="email" placeholder={t('Email address')} aria-label={t('Email address')} autocomplete="email" required />
        {#if account.join}
          <input bind:value={password} type="password" placeholder={t('New password (8+ characters)')} aria-label={t('New password (8+ characters)')} autocomplete="new-password" minlength="8" required />
        {/if}
        <button class="primary" disabled={busy}>{busy ? t('One moment…') : account.join ? 'Continue' : t('Send code')}</button>
      </form>
      <p class="links"><button class="link" onclick={() => go('signin')}>{t('Back')}</button></p>
    {:else if step === 'reset-code'}
      <h1>{t('Choose a new password')}</h1>
      <p class="lede"><Trans text={t('If there’s an account for {address}, a code is on its way.')}>{#snippet address()}<strong>{email}</strong>{/snippet}</Trans></p>
      <form class="stack" onsubmit={submit(() => account.resetFinish(ticket!.ticket, code, password))}>
        <input class="code" bind:value={code} inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" aria-label={t('Code')} required />
        <input bind:value={password} type="password" placeholder={t('New password (8+ characters)')} aria-label={t('New password (8+ characters)')} autocomplete="new-password" minlength="8" required />
        <button class="primary" disabled={busy}>{busy ? t('Saving…') : t('Reset password')}</button>
      </form>
      <p class="links"><button class="link" onclick={() => go('signin')}>{t('Back')}</button></p>
    {:else if step === 'second-step'}
      <h1>{t('Enter your code')}</h1>
      <p class="lede">{t('From your authenticator app. Lost your phone? Use one of your recovery codes.')}</p>
      <form class="stack" onsubmit={submit(() => account.finishSecondStep(code))}>
        <input class="code" bind:value={code} autocomplete="one-time-code" maxlength="11" placeholder="000000" aria-label={t('Code')} autocapitalize="off" spellcheck="false" required />
        <button class="primary" disabled={busy}>{busy ? t('Checking…') : t('Sign in')}</button>
      </form>
      <p class="links"><button class="link" onclick={() => go('welcome')}>{t('Back')}</button></p>
    {:else if step === 'passkey-wait'}
      <h1>{t('Finish in your browser')}</h1>
      <p class="lede">{t('Use your passkey in the window that opened. We’ll carry on here when you’re done.')}</p>
      <div class="spinner" aria-hidden="true"></div>
      <p class="links"><button class="link" onclick={() => go('welcome')}>{t('Cancel')}</button></p>
    {:else if step === 'google-wait'}
      <h1>{t('Finish in your browser')}</h1>
      <p class="lede">{t("Pick your Google account in the window that opened. We'll carry on here when you're done.")}</p>
      <div class="spinner" aria-hidden="true"></div>
      <p class="links"><button class="link" onclick={() => go('welcome')}>{t('Cancel')}</button></p>
    {:else if step === 'google-username'}
      <h1>{t('Pick a username')}</h1>
      <p class="lede">{email ? t("It's how friends find you. You're signing in as {email}.", { email }) : t("It's how friends find you.")}</p>
      <form class="stack" onsubmit={submit(() => account.googleFinish(googleId, username))}>
        <input bind:value={username} placeholder={t('Username')} aria-label={t('Username')} autocapitalize="off" spellcheck="false" required />
        <button class="primary" disabled={busy}>{busy ? t('One moment…') : 'Done'}</button>
      </form>
    {:else if step === 'add-email'}
      <h1>{t('One more thing')}</h1>
      <p class="lede">{t('Every Biggle ID now has an email address, so you can always get back in. Add yours, {username}.', { username: account.user?.username })}</p>
      <form
        class="stack"
        onsubmit={submit(async () =>
          confirm(await account.emailStart(email, again('add-email')), 'add-email', 'add-email-code'),
        )}
      >
        <input bind:value={email} type="email" placeholder={t('Email address')} aria-label={t('Email address')} autocomplete="email" required />
        <button class="primary" disabled={busy}>{busy ? t('One moment…') : account.join ? 'Continue' : t('Send code')}</button>
      </form>
      <p class="links"><button class="link" onclick={() => account.signOut()}>{t('Sign out')}</button></p>
    {:else if step === 'mail'}
      <h1>{t("Prove it's your email")}</h1>
      <p class="lede"><Trans text={t('Send us a quick email from {address}. It’s already written for you, so just press send.')}>{#snippet address()}<strong>{email}</strong>{/snippet}</Trans></p>
      <div class="stack">
        <a class="primary" href={mailto} onclick={openMail}>{t('Open my email app')}</a>
      </div>
      {#if !error}
        <p class="waiting"><span class="spinner small" aria-hidden="true"></span>{busy ? t('Got it! One moment…') : t('Waiting for your email…')}</p>
      {/if}
      <p class="note">
        <Trans text={t('No email app? Email {to} from {address} with {code} in the subject.')} address={email}>
          {#snippet to()}<strong class="pick">{ticket?.join}</strong>{/snippet}
          {#snippet code()}<strong class="pick">{ticket?.code}</strong>{/snippet}
        </Trans>
      </p>
      <p class="links"><button class="link" onclick={() => go(mailBack)}>{t('Use a different email')}</button></p>
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
  :global([data-titlebar]) .auth {
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
  a.primary {
    text-decoration: none;
  }
  .waiting {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    margin: 18px 0 0;
    color: var(--muted);
  }
  .pick {
    color: var(--text);
    user-select: all;
    overflow-wrap: anywhere;
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
  .spinner.small {
    width: 18px;
    height: 18px;
    margin: 0;
    border-width: 2px;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .invited {
    margin: 0 0 18px;
    padding: 10px 14px;
    border-radius: 12px;
    background: var(--accent-soft);
    font-size: 14px;
    font-weight: 600;
  }
</style>
