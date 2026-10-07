// Sites you've made in the Biggle site editor, and (for admins) how many are waiting for approval.
import { account } from './account.svelte';
import { api } from './api';

export type SiteStatus = 'pending' | 'live' | 'rejected';
export type MySite = {
  name: string;
  title: string | null;
  status: SiteStatus;
  note: string | null;
  createdAt: number;
  updatedAt: number;
};

class Sites {
  mine = $state<MySite[] | null>(null);
  /** How many sites you may have, or null for no limit (admins). */
  limit = $state<number | null>(3);
  /** Sites waiting for an admin's approval. */
  reviews = $state(0);
  /** Bumped when the review queue changes, so the admin page can reload it. */
  reviewsChanged = $state(0);

  async refreshMine() {
    if (!account.token) return;
    try {
      const r = await api<{ sites: MySite[]; limit: number | null }>('GET', '/api/sites');
      this.mine = r.sites;
      this.limit = r.limit;
    } catch {}
  }

  async refreshReviews() {
    if (!account.user?.admin) {
      this.reviews = 0;
      return;
    }
    try {
      const r = await api<{ sites: unknown[] }>('GET', '/api/admin/reviews');
      this.reviews = r.sites.length;
      this.reviewsChanged++;
    } catch {}
  }

  /** Live events: a site was submitted for review, or one of yours was approved or rejected. */
  onEvent(type: string) {
    if (type === 'review') this.refreshReviews();
    if (type === 'site') this.refreshMine();
  }

  reset() {
    this.mine = null;
    this.reviews = 0;
  }
}

export const sites = new Sites();
