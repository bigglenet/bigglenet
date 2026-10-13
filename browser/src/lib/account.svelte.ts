// Biggle ID: who's signed in to this browser. You need one to use Bigglenet at all, with a
// confirmed email address or Google.
import { api, onSessionExpired, setToken } from './api';
import { SERVER } from './config';
import { invite } from './invite.svelte';
import { desktop, openExternal } from './platform';
import { createPasskey, getPasskey } from './webauthn';

export type Me = {
  username: string;
  admin: boolean;
  trusted?: boolean;
  email?: string | null;
  emailVerified?: boolean;
  /** Changes with each new profile picture; null when there's none. */
  avatar?: number | null;
};
type SignedIn = { token: string; user: Me };
/** Signed in, or (two-factor) a ticket for the second step. */
type SignInResult = SignedIn | { needs2fa: true; ticket: string };
/**
 * A code to finish with. Either it was emailed out, or (with `join`) the person emails `code`
 * to the `join` address from their own email, then the app finishes once it arrives.
 */
export type Ticket = { ticket: string; devCode?: string; code?: string; join?: string };
/** A code from before, sent back when starting again so the same code keeps working. */
export type Again = { ticket: string; code: string } | undefined;

const KEY = 'biggle:session';

function loadSaved(): SignedIn | null {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return saved?.token && saved?.user ? saved : null;
  } catch {
    return null;
  }
}

class Account {
  token = $state<string | null>(null);
  user = $state<Me | null>(null);
  /** Whether "Continue with Google" is available. */
  google = $state(false);
  /** Whether email codes work: email sign-up, password resets, and confirming an email. */
  email = $state(false);
  /** When set, people confirm an email by emailing a code to this address. */
  join = $state<string | null>(null);
  /** A sign-in waiting for its two-factor code (the ticket for it). */
  secondStep = $state<string | null>(null);

  constructor() {
    const saved = loadSaved();
    if (saved) this.set(saved);
    onSessionExpired(() => this.clear());
    if (saved) this.refresh();
    api<{ google: boolean; email?: boolean; join?: string | null }>('GET', '/api/auth/options').then(
      (o) => {
        this.google = o.google;
        this.email = !!o.email || !!o.join;
        this.join = o.join ?? null;
      },
      () => {},
    );
  }

  /** Signed in, but the account still needs a confirmed email (once email is switched on). */
  get needsEmail(): boolean {
    return this.email && !!this.user && this.user.emailVerified === false;
  }

  async refresh() {
    try {
      const { user } = await api<{ user: Me }>('GET', '/api/me');
      if (this.token) this.set({ token: this.token, user });
    } catch {
      // Offline is fine; an expired session clears itself via onSessionExpired.
    }
  }

  async signIn(login: string, password: string) {
    this.setOrAsk(await api<SignInResult>('POST', '/api/auth/login', { login, password }));
  }

  /** Signed in, or two-factor's turn (AuthScreen then asks for the code). */
  private setOrAsk(r: SignInResult) {
    if ('needs2fa' in r) this.secondStep = r.ticket;
    else this.set(r);
  }

  /** The code from an authenticator app (or a recovery code), to finish signing in. */
  async finishSecondStep(code: string) {
    this.set(await api<SignedIn>('POST', '/api/auth/login/2fa', { ticket: this.secondStep, code }));
    this.secondStep = null;
  }

  cancelSecondStep() {
    this.secondStep = null;
  }

  /**
   * Sign in with a passkey. The desktop app does it in the system browser (which knows about
   * Touch ID, Windows Hello and phones) and waits for it, like Google.
   */
  async passkeySignIn(signal?: AbortSignal) {
    const start = await api<{ id: string; options: Parameters<typeof getPasskey>[0] }>('POST', '/api/passkeys/login/start');
    if (desktop) {
      await openExternal(`${SERVER}/passkey/${start.id}`);
      const done = await this.waitForPasskey(start.id, signal);
      if (done.token && done.user) this.set({ token: done.token, user: done.user });
      return;
    }
    const credential = await getPasskey(start.options);
    this.set(await api<SignedIn>('POST', '/api/passkeys/login/finish', { id: start.id, credential }));
  }

  /** Add a passkey to this Biggle ID. */
  async addPasskey(name: string, signal?: AbortSignal) {
    const start = await api<{ id: string; options: Parameters<typeof createPasskey>[0] }>('POST', '/api/passkeys/register/start');
    if (desktop) {
      await openExternal(`${SERVER}/passkey/${start.id}`);
      await this.waitForPasskey(start.id, signal);
      return;
    }
    const credential = await createPasskey(start.options);
    await api('POST', '/api/passkeys/register/finish', { id: start.id, name, credential });
  }

  private async waitForPasskey(id: string, signal?: AbortSignal): Promise<Partial<SignedIn> & { done?: boolean }> {
    while (!signal?.aborted) {
      await new Promise((r) => setTimeout(r, 2000));
      if (signal?.aborted) break;
      const r = await api<Partial<SignedIn> & { waiting?: boolean; done?: boolean }>('POST', '/api/passkeys/poll', { id });
      if (!r.waiting) return r;
    }
    throw new DOMException('Cancelled', 'AbortError');
  }

  signUpStart(email: string, username: string, password: string, again?: Again) {
    return api<Ticket>('POST', '/api/auth/signup/start', { email, username, password, again });
  }

  async signUpFinish(ticket: string, code: string) {
    // Signing up through an invite link makes you friends with whoever sent it.
    this.set(await api<SignedIn>('POST', '/api/auth/signup/finish', { ticket, code, invite: invite.code }));
    invite.forget();
  }

  /** With `password` when confirming by emailing us: the server keeps it until the email arrives. */
  resetStart(email: string, password?: string, again?: Again) {
    return api<Ticket>('POST', '/api/auth/reset/start', { email, password, again });
  }

  async resetFinish(ticket: string, code: string, password?: string) {
    this.setOrAsk(await api<SignInResult>('POST', '/api/auth/reset/finish', { ticket, code, password }));
  }

  emailStart(email: string, again?: Again) {
    return api<Ticket>('POST', '/api/auth/email/start', { email, again });
  }

  /** Whether the email for a ticket has reached the Biggle server yet. */
  async codeConfirmed(ticket: string): Promise<boolean> {
    return (await api<{ confirmed: boolean }>('POST', '/api/auth/code/status', { ticket })).confirmed;
  }

  async emailFinish(ticket: string, code: string) {
    const { user } = await api<{ user: Me }>('POST', '/api/auth/email/finish', { ticket, code });
    if (this.token) this.set({ token: this.token, user });
  }

  /**
   * Sign in with Google in the system browser, then wait for it to finish.
   * Resolves with 'done', or 'username' when a new account needs a username first.
   */
  async googleSignIn(signal: AbortSignal): Promise<{ id: string; result: 'done' | 'username'; email?: string | null }> {
    const { id, url } = await api<{ id: string; url: string }>('POST', '/api/auth/google/start');
    await openExternal(url);
    while (!signal.aborted) {
      await new Promise((r) => setTimeout(r, 2000));
      if (signal.aborted) break;
      const r = await api<Partial<SignedIn> & { waiting?: boolean; needsUsername?: boolean; email?: string | null; needs2fa?: true; ticket?: string }>(
        'POST',
        '/api/auth/google/poll',
        { id },
      );
      if (r.needsUsername) return { id, result: 'username', email: r.email };
      if (r.needs2fa && r.ticket) {
        this.secondStep = r.ticket;
        return { id, result: 'done' };
      }
      if (r.token && r.user) {
        this.set({ token: r.token, user: r.user });
        return { id, result: 'done' };
      }
    }
    throw new DOMException('Cancelled', 'AbortError');
  }

  async googleFinish(id: string, username: string) {
    this.set(await api<SignedIn>('POST', '/api/auth/google/finish', { id, username, invite: invite.code }));
    invite.forget();
  }

  async signOut() {
    try {
      await api('POST', '/api/auth/logout');
    } catch {}
    this.clear();
  }

  private set({ token, user }: SignedIn) {
    this.token = token;
    this.user = user;
    setToken(token);
    try {
      localStorage.setItem(KEY, JSON.stringify({ token, user }));
    } catch {}
  }

  private clear() {
    this.token = null;
    this.user = null;
    setToken(null);
    try {
      localStorage.removeItem(KEY);
    } catch {}
  }
}

export const account = new Account();
