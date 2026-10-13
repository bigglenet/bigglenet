<script lang="ts">
  // Your invite link: whoever signs up through it is your friend straight away.
  import { api, errorText } from '../../lib/api';
  import { browser } from '../../lib/browser.svelte';
  import { plural, t } from '../../lib/i18n.svelte';

  let link = $state<{ link: string; joined: number } | null>(null);
  let error = $state('');
  let confirmNew = $state(false);

  $effect(() => {
    api<{ link: string; joined: number }>('GET', '/api/invites').then(
      (r) => (link = r),
      (e) => (error = errorText(e)),
    );
  });

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.link);
      browser.say(t('Invite link copied'));
    } catch {
      browser.say(t('Couldn’t copy it. Select the link and copy it yourself.'));
    }
  }

  async function renew() {
    confirmNew = false;
    try {
      link = await api('POST', '/api/invites/new');
      browser.say(t('New link made. The old one doesn’t work any more.'));
    } catch (e) {
      error = errorText(e);
    }
  }
</script>

<section class="card stack invite">
  <h3>{t('Invite friends')}</h3>
  <p class="muted small">{t('Anyone who signs up with your link becomes your friend straight away.')}</p>
  {#if link}
    <input readonly value={link.link} aria-label={t('Your invite link')} onfocus={(e) => e.currentTarget.select()} />
    <div class="row">
      <button class="primary" onclick={copy}>{t('Copy link')}</button>
      {#if confirmNew}
        <button class="ghost" onclick={renew}>{t('Make a new one')}</button>
        <button class="link small" onclick={() => (confirmNew = false)}>{t('Keep this one')}</button>
      {:else}
        <button class="ghost" onclick={() => (confirmNew = true)} title={t('The old link stops working')}>{t('New link')}</button>
      {/if}
    </div>
    {#if link.joined}<p class="muted small">{plural(link.joined, '{n} person joined with your link', '{n} people joined with your link')}</p>{/if}
  {:else if error}
    <p class="bad">{error}</p>
  {/if}
</section>

<style>
  .invite input {
    font-family: ui-monospace, Menlo, monospace;
    font-size: 13px;
  }
</style>
