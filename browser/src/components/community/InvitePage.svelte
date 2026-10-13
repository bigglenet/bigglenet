<script lang="ts">
  // biggle://invite/<code>, signed in: who the invite is from, and adding them as a friend.
  // (Signed out, the code waits for sign-up instead; see invite.svelte.ts.)
  import { account } from '../../lib/account.svelte';
  import { api, errorText } from '../../lib/api';
  import { browser, type Tab } from '../../lib/browser.svelte';
  import { invite } from '../../lib/invite.svelte';
  import { t } from '../../lib/i18n.svelte';
  import { social } from '../../lib/social.svelte';
  import Avatar from '../Avatar.svelte';
  import InviteCard from './InviteCard.svelte';
  import Page from './Page.svelte';

  let { tab, path }: { tab: Tab; path: string } = $props();

  let from = $state<string | null>(null);
  let error = $state('');
  let sent = $state(false);

  $effect(() => {
    const code = path;
    from = null;
    error = '';
    // You're signed in, so the code isn't needed for sign-up any more.
    if (invite.code === code) invite.forget();
    api<{ from: string }>('GET', `/api/invites/${encodeURIComponent(code)}`).then(
      (r) => (from = r.from),
      (e) => (error = errorText(e)),
    );
  });

  const friend = $derived(from ? social.friends.some((f) => f.username === from) : false);
  const mine = $derived(from === account.user?.username);

  async function add() {
    if (!from) return;
    try {
      await social.addFriend(from);
      sent = true;
    } catch (e) {
      error = errorText(e);
    }
  }
</script>

<Page>
  {#if error}
    <h1>{t('Invite')}</h1>
    <p class="bad">{error}</p>
  {:else if !from}
    <p class="muted">{t('Loading…')}</p>
  {:else if mine}
    <header class="top"><h1>{t('This is your invite link')}</h1></header>
    <InviteCard />
  {:else}
    <div class="card stack center">
      <Avatar name={from} user={from} size={72} />
      <h1>{t('{who} invited you', { who: from })}</h1>
      {#if friend}
        <p class="muted">{t('You’re already friends.')}</p>
      {:else if sent}
        <p class="muted">{t('Friend request sent.')}</p>
      {:else}
        <p class="muted">{t('You already have a Biggle ID, so add them as a friend.')}</p>
        <button class="primary" onclick={add}>{t('Add {who} as a friend', { who: from })}</button>
      {/if}
      <button class="link" onclick={() => browser.go(tab, `biggle://u/${from}`)}>{t('See their profile')}</button>
    </div>
  {/if}
</Page>

<style>
  .center {
    align-items: center;
    padding: 36px 20px;
    text-align: center;
  }
</style>
