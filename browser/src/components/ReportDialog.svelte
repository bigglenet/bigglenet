<script lang="ts">
  // Telling admins about something that shouldn't be on the Bigglenet.
  import { api, errorText } from '../lib/api';
  import { browser } from '../lib/browser.svelte';
  import { t } from '../lib/i18n.svelte';
  import { overlays } from '../lib/overlays.svelte';
  import { report } from '../lib/report.svelte';

  const REASONS = ['It’s spam', 'It’s mean or bullying', 'It’s not OK for kids', 'Someone’s pretending to be someone else', 'Something else'];
  let reason = $state(REASONS[0]);
  let more = $state('');
  let busy = $state(false);
  let error = $state('');
  let box = $state<HTMLDivElement>();

  $effect(() => {
    const release = overlays.hold();
    box?.focus();
    return release;
  });

  async function send(e: SubmitEvent) {
    e.preventDefault();
    const r = report.request;
    if (!r || busy) return;
    busy = true;
    error = '';
    try {
      await api('POST', '/api/reports', { kind: r.kind, target: r.target, reason: [t(reason), more.trim()].filter(Boolean).join(': ') });
      report.close();
      browser.say(t('Thanks. An admin will look at it.'));
    } catch (err) {
      error = errorText(err);
    } finally {
      busy = false;
    }
  }
</script>

<div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && report.close()}>
  <div class="dialog" role="dialog" aria-modal="true" aria-label={t('Report')} tabindex="-1" bind:this={box} onkeydown={(e) => e.key === 'Escape' && report.close()}>
    <form onsubmit={send}>
      <h2>{t('Report {what}', { what: report.request?.label ?? '' })}</h2>
      <p class="muted">{t('Admins will see it and what you say. The person you report won’t know it was you.')}</p>
      <fieldset>
        {#each REASONS as r (r)}
          <label><input type="radio" name="reason" value={r} bind:group={reason} /> {t(r)}</label>
        {/each}
      </fieldset>
      <textarea bind:value={more} rows="3" maxlength="400" placeholder={t('Anything else admins should know (optional)')} aria-label={t('More')}></textarea>
      {#if error}<p class="error">{error}</p>{/if}
      <div class="foot">
        <button type="button" class="ghost" onclick={() => report.close()}>{t('Cancel')}</button>
        <button class="primary" disabled={busy}>{busy ? t('Sending…') : t('Send report')}</button>
      </div>
    </form>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: grid;
    place-items: center;
    padding: 20px;
    background: rgb(0 0 0 / 0.35);
  }
  .dialog {
    width: min(440px, 100%);
    outline: 0;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 20px;
    border: 1px solid var(--border);
    border-radius: 18px;
    background: var(--card);
    box-shadow: 0 30px 70px -30px rgb(0 0 0 / 0.5);
  }
  h2 {
    margin: 0;
    font-size: 18px;
    overflow-wrap: anywhere;
  }
  p {
    margin: 0;
  }
  .muted {
    color: var(--muted);
    font-size: 13.5px;
  }
  fieldset {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
    padding: 0;
    border: 0;
    font-size: 14.5px;
  }
  label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }
  textarea {
    resize: vertical;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
  }
  .error {
    color: var(--danger);
    font-size: 13.5px;
  }
  .foot {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .primary,
  .ghost {
    height: 36px;
    padding: 0 16px;
    border-radius: 10px;
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }
  .primary {
    border: 0;
    background: var(--accent);
    color: var(--on-accent);
  }
  .primary:disabled {
    opacity: 0.5;
  }
  .ghost {
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--text);
  }
</style>
