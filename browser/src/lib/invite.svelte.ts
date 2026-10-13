// Invite links (server/src/invites.ts). Opening one (https://…/invite/CODE on the web, or
// biggle://invite/CODE) remembers the code until you sign up, so you become friends with
// whoever invited you; signed in already, it shows who it's from (InvitePage).
import { api } from './api';

const KEY = 'biggle:invite';
const CODE_RE = /^[A-Za-z0-9]{6,16}$/;

function load(): string | null {
  try {
    const code = localStorage.getItem(KEY);
    return code && CODE_RE.test(code) ? code : null;
  } catch {
    return null;
  }
}

class Invite {
  /** The code to send with sign-up. */
  code = $state<string | null>(load());
  /** Who it's from, once known. */
  from = $state<string | null>(null);

  constructor() {
    if (this.code) this.lookup();
  }

  /** The code in a biggle://invite/CODE link, if it is one. */
  static codeIn(href: string): string | null {
    const m = /^biggle:\/\/invite\/([A-Za-z0-9]+)/i.exec(href);
    return m && CODE_RE.test(m[1]) ? m[1] : null;
  }

  remember(code: string) {
    if (!CODE_RE.test(code)) return;
    this.code = code;
    try {
      localStorage.setItem(KEY, code);
    } catch {}
    this.lookup();
  }

  private async lookup() {
    const code = this.code;
    if (!code) return;
    try {
      const r = await api<{ from: string }>('GET', `/api/invites/${code}`);
      if (this.code === code) this.from = r.from;
    } catch {
      // Gone (they made a new link): forget it.
      if (this.code === code) this.forget();
    }
  }

  forget() {
    this.code = null;
    this.from = null;
    try {
      localStorage.removeItem(KEY);
    } catch {}
  }
}

export const invite = new Invite();
export const inviteCodeIn = Invite.codeIn;
