// Biggle ID: who's signed in to this browser.
import { api, onSessionExpired, setToken } from './api';

export type Me = { username: string; admin: boolean };

const KEY = 'biggle:session';

function loadSaved(): { token: string; user: Me } | null {
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
  /** Which sign-in dialog is showing, if any. */
  dialog = $state<'signin' | 'signup' | null>(null);

  constructor() {
    const saved = loadSaved();
    if (saved) this.set(saved.token, saved.user);
    onSessionExpired(() => this.clear());
    if (saved) this.refresh();
  }

  async refresh() {
    try {
      const { user } = await api<{ user: Me }>('GET', '/api/me');
      if (this.token) this.set(this.token, user);
    } catch {
      // Offline is fine; an expired session clears itself via onSessionExpired.
    }
  }

  async signIn(username: string, password: string) {
    const r = await api<{ token: string; user: Me }>('POST', '/api/auth/login', { username, password });
    this.set(r.token, r.user);
  }

  async signUp(username: string, password: string, invite: string) {
    const r = await api<{ token: string; user: Me }>('POST', '/api/auth/signup', { username, password, invite });
    this.set(r.token, r.user);
  }

  async signOut() {
    try {
      await api('POST', '/api/auth/logout');
    } catch {}
    this.clear();
  }

  private set(token: string, user: Me) {
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
