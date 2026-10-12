// Signing a site's guestbook. A page asks (<biggle-guestbook>'s button), and the browser shows
// its own box to write in (GuestbookDialog.svelte), so a page can never sign it for you.

export type GuestbookNote = { id: number; author: string; body: string; at: number; canDelete: boolean };

class Signing {
  /** The guestbook being signed: the site's key, and who's waiting for the note. */
  request = $state<{ site: string; done: (note: GuestbookNote | null) => void } | null>(null);

  /** Show the box. Resolves with the new note, or null if they changed their mind. */
  ask(site: string): Promise<GuestbookNote | null> {
    this.request?.done(null);
    return new Promise((done) => (this.request = { site, done }));
  }

  finish(note: GuestbookNote | null) {
    const request = this.request;
    this.request = null;
    request?.done(note);
  }
}

export const signing = new Signing();
