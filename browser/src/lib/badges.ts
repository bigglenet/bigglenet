// Badges people earn (server/src/badges.ts works out who has which): their pictures, names and
// what they're for. Names are translated where they're shown.
import { browser } from './browser.svelte';
import { t } from './i18n.svelte';

export const BADGE_INFO: Record<string, { emoji: string; name: string; about: string }> = {
  'first-site': { emoji: '🏠', name: 'Site maker', about: 'Has a site on the Bigglenet' },
  'five-sites': { emoji: '🏘️', name: 'Builder', about: 'Has five sites on the Bigglenet' },
  'friends-10': { emoji: '🤝', name: 'Friendly', about: 'Has ten friends' },
  'guestbooks-50': { emoji: '✍️', name: 'Signer', about: 'Signed 50 guestbooks' },
  'streak-7': { emoji: '🔥', name: 'On a roll', about: 'On the Bigglenet seven days in a row' },
  'stamps-25': { emoji: '📮', name: 'Collector', about: 'Collected 25 stamps' },
  remixer: { emoji: '🎛️', name: 'Remixer', about: 'Remixed a site' },
  remixed: { emoji: '🌱', name: 'Inspiring', about: 'Someone remixed one of their sites' },
  'club-founder': { emoji: '🏕️', name: 'Club founder', about: 'Started a club' },
  'challenge-winner': { emoji: '🏆', name: 'Champion', about: 'Won a weekly challenge' },
  'early-bird': { emoji: '🐣', name: 'Early bird', about: 'Joined in the Bigglenet’s first year' },
};

/** Badges you've just earned: a cheer for each. */
export function celebrate(fresh: string[] | undefined) {
  for (const badge of fresh ?? []) {
    const info = BADGE_INFO[badge];
    if (info) browser.say(t('New badge: {emoji} {name}!', { emoji: info.emoji, name: t(info.name) }));
  }
}
