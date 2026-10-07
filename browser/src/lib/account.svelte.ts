// Biggle ID: who's signed in to this browser. You need one to use Bigglenet at all, with a
// confirmed email address or Google.
import { api, onSessionExpired, setToken } from './api';
import { openExternal } from './platform';

export type Me = { username: string; admin: boolean; email?: string | null; emailVerified?: boolean };
type SignedIn = { token: string; user: Me };
/** An emailed code is on its way; finish with the ticket and the code. */
export type Ticket = { ticket: string; devCode?: string };

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

  constructor() {
    const saved = loadSaved();
    if (saved) this.set(saved);
    onSessionExpired(() => this.clear());
    if (saved) this.refresh();
    api<{ google: boolean }>('GET', '/api/auth/options').then(
      (o) => (this.google = o.google),
      () => {},
    );
  }

  /** Signed in, but the account still needs a confirmed email. */
  get needsEmail(): boolean {
    return !!this.user && this.user.emailVerified === false;
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
    this.set(await api<SignedIn>('POST', '/api/auth/login', { login, password }));
  }

  signUpStart(email: string, username: string, password: string) {
    return api<Ticket>('POST', '/api/auth/signup/start', { email, username, password });
  }

  async signUpFinish(ticket: string, code: string) {
    this.set(await api<SignedIn>('POST', '/api/auth/signup/finish', { ticket, code }));
  }

  resetStart(email: string) {
    return api<Ticket>('POST', '/api/auth/reset/start', { email });
  }

  async resetFinish(ticket: string, code: string, password: string) {
    this.set(await api<SignedIn>('POST', '/api/auth/reset/finish', { ticket, code, password }));
  }

  emailStart(email: string) {
    return api<Ticket>('POST', '/api/auth/email/start', { email });
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
      const r = await api<Partial<SignedIn> & { waiting?: boolean; needsUsername?: boolean; email?: string | null }>(
        'POST',
        '/api/auth/google/poll',
        { id },
      );
      if (r.needsUsername) return { id, result: 'username', email: r.email };
      if (r.token && r.user) {
        this.set({ token: r.token, user: r.user });
        return { id, result: 'done' };
      }
    }
    throw new DOMException('Cancelled', 'AbortError');
  }

  async googleFinish(id: string, username: string) {
    this.set(await api<SignedIn>('POST', '/api/auth/google/finish', { id, username }));
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
