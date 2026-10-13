<script lang="ts">
  // Settings → Account: two-factor sign-in, passkeys, syncing between devices, downloading
  // everything, and deleting the account (server/src/twofactor.ts, passkeys.ts, account.ts).
  import { account } from '../lib/account.svelte';
  import { api, errorText } from '../lib/api';
  import { browser } from '../lib/browser.svelte';
  import { SERVER } from '../lib/config';
  import { i18n, t } from '../lib/i18n.svelte';
  import { isApp } from '../lib/platform';
  import { qrSvg } from '../lib/qr';
  import { sync } from '../lib/sync.svelte';
  import { passkeysHere } from '../lib/webauthn';

  // --- Two-factor ---
  let twoFactor = $state<{ enabled: boolean; recoveryLeft: number } | null>(null);
  let setup = $state<{ secret: string; url: string } | null>(null);
  let code = $state('');
  let recovery = $state<string[] | null>(null);
  let turningOff = $state(false);
  let error2fa = $state('');
  let busy = $state(false);

  const load2fa = () => api<{ enabled: boolean; recoveryLeft: number }>('GET', '/api/me/2fa').then((r) => (twoFactor = r), () => {});

  async function act(fn: () => Promise<unknown>, onError: (m: string) => void) {
    if (busy) return;
    busy = true;
    try {
      await fn();
    } catch (e) {
      if ((e as Error).name !== 'AbortError') onError(errorText(e));
    } finally {
      busy = false;
    }
  }

  const startSetup = () => act(async () => ((error2fa = ''), (code = ''), (setup = await api('POST', '/api/me/2fa/setup'))), (m) => (error2fa = m));
  const enable = (e: SubmitEvent) => {
    e.preventDefault();
    act(async () => {
      error2fa = '';
      const r = await api<{ recoveryCodes: string[] }>('POST', '/api/me/2fa/enable', { secret: setup!.secret, code });
      recovery = r.recoveryCodes;
      setup = null;
      code = '';
      await load2fa();
    }, (m) => (error2fa = m));
  };
  const disable = (e: SubmitEvent) => {
    e.preventDefault();
    act(async () => {
      error2fa = '';
      await api('DELETE', '/api/me/2fa', { code });
      turningOff = false;
      code = '';
      recovery = null;
      await load2fa();
    }, (m) => (error2fa = m));
  };

  function saveRecovery() {
    if (!recovery) return;
    const url = URL.createObjectURL(new Blob([`${t('Bigglenet recovery codes for {name}', { name: account.user?.username })}\n\n${recovery.join('\n')}\n\n${t('Each one works once.')}\n`], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bigglenet-recovery-codes.txt';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  // --- Passkeys ---
  type Passkey = { id: string; name: string | null; created_at: number; last_used: number | null };
  let passkeys = $state<Passkey[] | null>(null);
  let errorKeys = $state('');
  let waitingKey = $state(false);
  let keyAbort: AbortController | null = null;
  const loadKeys = () => api<{ passkeys: Passkey[] }>('GET', '/api/passkeys').then((r) => (passkeys = r.passkeys), () => {});
  const canPasskey = isApp || passkeysHere;
  const deviceName = () => (isApp ? t('Bigglenet app') : /Mac/.test(navigator.userAgent) ? 'Mac' : /Windows/.test(navigator.userAgent) ? 'Windows' : /Android/.test(navigator.userAgent) ? 'Android' : /iPhone|iPad/.test(navigator.userAgent) ? 'iPhone' : t('Passkey'));
  const addKey = () => {
    keyAbort = new AbortController();
    waitingKey = isApp;
    act(async () => {
      errorKeys = '';
      try {
        await account.addPasskey(deviceName(), keyAbort!.signal);
      } finally {
        waitingKey = false;
      }
      await loadKeys();
      browser.say(t('Passkey added'));
    }, (m) => (errorKeys = m));
  };
  const removeKey = (id: string) => act(async () => (await api('DELETE', `/api/passkeys/${encodeURIComponent(id)}`), await loadKeys()), (m) => (errorKeys = m));

  // --- Your data ---
  let errorData = $state('');
  let confirmName = $state('');
  let password = $state('');
  let deleting = $state(false);

  const download = () =>
    act(async () => {
      errorData = '';
      const res = await fetch(`${SERVER}/api/me/export`, { headers: { Authorization: `Bearer ${account.token}` } });
      if (!res.ok) throw new Error(t('Couldn’t get your data. Try again.'));
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `bigglenet-${account.user?.username}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    }, (m) => (errorData = m));

  const deleteAccount = (e: SubmitEvent) => {
    e.preventDefault();
    act(async () => {
      errorData = '';
      await api('DELETE', '/api/me', { confirm: confirmName, password });
      await account.signOut();
    }, (m) => (errorData = m));
  };

  $effect(() => {
    load2fa();
    loadKeys();
  });

  const day = (s: number) => new Date(s * 1000).toLocaleDateString(i18n.locale);
</script>

<section id="account">
  <h2>{t('Account')}</h2>

  <h3>{t('Two-factor sign-in')}</h3>
  {#if recovery}
    <div class="note">
      <p><strong>{t('Two-factor sign-in is on.')}</strong> {t('Keep these recovery codes somewhere safe. Each one signs you in once if you lose your phone.')}</p>
      <ul class="codes">{#each recovery as c (c)}<li>{c}</li>{/each}</ul>
      <div class="buttons">
        <button class="ghost" onclick={saveRecovery}>{t('Save them as a file')}</button>
        <button class="ghost" onclick={() => (recovery = null)}>{t('I’ve kept them')}</button>
      </div>
    </div>
  {:else if setup}
    <p class="muted small">{t('Scan this with an authenticator app (like Google Authenticator, 1Password or your phone’s passwords), then type the code it shows.')}</p>
    <div class="setup">
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      <div class="qr" aria-label={t('QR code to scan')}>{@html qrSvg(setup.url)}</div>
      <div class="stack">
        <p class="muted small">{t('Can’t scan it? Type this key in:')}</p>
        <code class="secret">{setup.secret.match(/.{1,4}/g)?.join(' ')}</code>
        <form class="line" onsubmit={enable}>
          <input bind:value={code} inputmode="numeric" maxlength="6" placeholder="000000" aria-label={t('Code from the app')} autocomplete="one-time-code" />
          <button class="primary" disabled={busy || code.length !== 6}>{t('Turn on')}</button>
        </form>
        <button class="link" onclick={() => (setup = null)}>{t('Cancel')}</button>
      </div>
    </div>
  {:else if twoFactor?.enabled}
    <p class="small">{t('On. Signing in asks for a code from your authenticator app.')} <span class="muted">{t('{n} recovery codes left.', { n: twoFactor.recoveryLeft })}</span></p>
    {#if turningOff}
      <form class="line" onsubmit={disable}>
        <input bind:value={code} maxlength="11" placeholder={t('A code or recovery code')} aria-label={t('Code')} autocomplete="one-time-code" />
        <button class="danger" disabled={busy || !code}>{t('Turn off')}</button>
        <button type="button" class="ghost" onclick={() => (turningOff = false)}>{t('Keep it on')}</button>
      </form>
    {:else}
      <button class="ghost" onclick={() => ((turningOff = true), (code = ''))}>{t('Turn off…')}</button>
    {/if}
  {:else if twoFactor}
    <p class="muted small">{t('Ask for a code from your phone as well as your password, so nobody else can get in even if they know it.')}</p>
    <button class="ghost" disabled={busy} onclick={startSetup}>{t('Set up two-factor sign-in')}</button>
  {/if}
  {#if error2fa}<p class="error">{error2fa}</p>{/if}

  <h3>{t('Passkeys')}</h3>
  <p class="muted small">{t('Sign in with Touch ID, Windows Hello or your phone instead of a password.')}</p>
  {#if passkeys?.length}
    <ul class="keys">
      {#each passkeys as k (k.id)}
        <li>
          <span><strong>{k.name || t('Passkey')}</strong> <span class="muted small">{t('added {date}', { date: day(k.created_at) })}{k.last_used ? ` · ${t('last used {date}', { date: day(k.last_used) })}` : ''}</span></span>
          <button class="ghost" disabled={busy} onclick={() => removeKey(k.id)}>{t('Remove')}</button>
        </li>
      {/each}
    </ul>
  {/if}
  {#if waitingKey}
    <p class="small">{t('Finish in the browser window that opened.')} <button class="link" onclick={() => keyAbort?.abort()}>{t('Cancel')}</button></p>
  {:else if canPasskey}
    <button class="ghost" disabled={busy} onclick={addKey}>{t('Add a passkey')}</button>
  {:else}
    <p class="muted small">{t('This browser can’t make passkeys.')}</p>
  {/if}
  {#if errorKeys}<p class="error">{errorKeys}</p>{/if}

  <h3>{t('Sync')}</h3>
  <label class="choice">
    <input type="checkbox" checked={sync.enabled} onchange={(e) => sync.setEnabled(e.currentTarget.checked)} />
    <span>
      <strong>{t('Keep my bookmarks and settings the same everywhere')}</strong><br />
      <span class="muted">{t('Bookmarks, the new tab page, the look and language, and site settings, on every device you sign in on.')}</span>
    </span>
  </label>

  <h3>{t('Your data')}</h3>
  <p class="muted small">{t('Everything you’ve made and written on the Bigglenet, in one file.')}</p>
  <button class="ghost" disabled={busy} onclick={download}>{t('Download my data')}</button>

  {#if deleting}
    <form class="delete stack" onsubmit={deleteAccount}>
      <p class="small"><strong>{t('This deletes your Biggle ID, your sites and what you’ve written, for good.')}</strong> {t('Download your data first if you want to keep anything.')}</p>
      <input bind:value={confirmName} placeholder={t('Type your username: {name}', { name: account.user?.username ?? '' })} aria-label={t('Your username')} autocapitalize="off" spellcheck="false" />
      <input bind:value={password} type="password" placeholder={t('Your password (if you have one)')} aria-label={t('Password')} autocomplete="current-password" />
      <div class="buttons">
        <button class="danger" disabled={busy || confirmName.trim().toLowerCase() !== account.user?.username}>{t('Delete my account')}</button>
        <button type="button" class="ghost" onclick={() => (deleting = false)}>{t('Keep it')}</button>
      </div>
    </form>
  {:else}
    <button class="link delete-link" onclick={() => (deleting = true)}>{t('Delete my account…')}</button>
  {/if}
  {#if errorData}<p class="error">{errorData}</p>{/if}
</section>

<style>
  /* The same look as the rest of Settings (SettingsPage.svelte). */
  section {
    margin-bottom: 18px;
    scroll-margin-top: 16px;
    padding: 20px;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--card);
  }
  h2 {
    margin: 0 0 12px;
    font-size: 17px;
  }
  p {
    margin: 0;
  }
  .muted {
    color: var(--muted);
  }
  .small {
    font-size: 13px;
  }
  button {
    font: inherit;
    cursor: pointer;
  }
  .primary,
  .ghost {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 36px;
    padding: 0 14px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
  }
  .primary {
    border: 0;
    background: var(--accent);
    color: var(--on-accent);
  }
  .primary:disabled,
  .ghost:disabled {
    opacity: 0.5;
  }
  .ghost {
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
  }
  .choice {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 4px 0;
    font-size: 14.5px;
    line-height: 1.4;
    cursor: pointer;
  }
  .choice input {
    margin-top: 3px;
  }
  .choice .muted {
    font-size: 13px;
  }
  h3 {
    margin: 18px 0 6px;
    font-size: 14.5px;
  }
  h2 + h3 {
    margin-top: 0;
  }
  .note {
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--accent-soft);
    font-size: 14px;
  }
  .codes {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 4px 16px;
    margin: 10px 0;
    padding: 0;
    list-style: none;
    font-family: ui-monospace, Menlo, monospace;
  }
  .buttons,
  .line {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .line input,
  .delete input {
    flex: 1;
    min-width: 140px;
    height: 36px;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
  }
  .setup {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: flex-start;
  }
  .qr {
    width: 168px;
    height: 168px;
    padding: 6px;
    border-radius: 12px;
    background: #fff;
  }
  .qr :global(svg) {
    display: block;
    width: 100%;
    height: 100%;
  }
  .stack {
    flex: 1;
    min-width: 200px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .secret {
    padding: 8px 10px;
    border-radius: 8px;
    background: var(--surface);
    font-size: 14px;
    letter-spacing: 0.05em;
    overflow-wrap: anywhere;
  }
  .keys {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 8px 0;
    padding: 0;
    list-style: none;
  }
  .keys li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .delete {
    margin-top: 16px;
    padding: 14px;
    border: 1px solid var(--danger);
    border-radius: 12px;
  }
  .delete-link {
    display: block;
    margin-top: 16px;
    color: var(--danger);
  }
  .danger {
    height: 36px;
    padding: 0 14px;
    border: 1px solid var(--danger);
    border-radius: 10px;
    background: var(--danger);
    color: #fff;
    font-weight: 600;
  }
  .danger:disabled {
    opacity: 0.5;
  }
  .link {
    align-self: flex-start;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    font-size: 14px;
    text-decoration: underline;
  }
  .error {
    margin-top: 8px;
    color: var(--danger);
    font-size: 13.5px;
  }
</style>
