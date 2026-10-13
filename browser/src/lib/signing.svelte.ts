// Writing something on a site as you: signing its guestbook, commenting on a page, or messaging
// its owner. A page asks (<biggle-guestbook>, <biggle-comments>, <biggle-contact>), and the
// browser shows its own box to write in (GuestbookDialog.svelte), so a page can never post
// anything in your name by itself.

export type GuestbookNote = { id: number; author: string; body: string; at: number; canDelete: boolean };
export type WriteKind = 'guestbook' | 'comment' | 'contact';

class Signing {
  /** What's being written: on which site (and page, for comments), and who's waiting for it. */
  request = $state<{ site: string; kind: WriteKind; path: string; done: (result: unknown) => void } | null>(null);

  /** Show the box. Resolves with what was posted, or null if they changed their mind. */
  ask(site: string, kind: WriteKind = 'guestbook', path = '/'): Promise<unknown> {
    this.request?.done(null);
    return new Promise((done) => (this.request = { site, kind, path, done }));
  }

  finish(result: unknown) {
    const request = this.request;
    this.request = null;
    request?.done(result);
  }
}

export const signing = new Signing();
