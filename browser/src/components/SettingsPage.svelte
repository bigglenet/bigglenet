<script lang="ts">
  // biggle://settings: what new tabs open, and a way back to the normal new tab page.
  import { browser, type Tab } from '../lib/browser.svelte';
  import { startSettings as settings } from '../lib/startpage.svelte';
  import Icon from './Icon.svelte';

  let { tab }: { tab: Tab } = $props();

  let ownPage = $state(settings.newTab !== null);
  let pageText = $state(settings.newTab ?? '');
  let error = $state('');
  let saved = $state('');

  function useOwn(e: SubmitEvent) {
    e.preventDefault();
    saved = '';
    error = settings.useNewTab(pageText) ?? '';
    if (error) return;
    pageText = settings.newTab ?? '';
    ownPage = settings.newTab !== null;
    saved = settings.newTab ? `New tabs open ${settings.newTab}.` : 'New tabs open the new tab page.';
  }

  function useDefault() {
    settings.useDefaultNewTab();
    ownPage = false;
    pageText = '';
    error = '';
    saved = 'New tabs open the new tab page again.';
  }

  function customize() {
    settings.openCustomize = true;
    browser.go(tab, 'biggle://newtab');
  }
</script>

<div class="settings">
  <div class="inner">
    <h1>Settings</h1>

    <section>
      <h2>New tabs</h2>
      {#if settings.newTab}
        <div class="current">
          <span>New tabs open <strong>{settings.newTab}</strong></span>
          <button class="primary" onclick={useDefault}>Use the default new tab page</button>
        </div>
      {/if}

      <label class="choice">
        <input type="radio" name="newtab" checked={!ownPage} onchange={useDefault} />
        <span><strong>The new tab page</strong> <em>(default)</em><br /><span class="muted">Search, shortcuts and more. You can change how it looks.</span></span>
      </label>
      <label class="choice">
        <input type="radio" name="newtab" checked={ownPage} onchange={() => ((ownPage = true), (saved = ''))} />
        <span><strong>A page of my choice</strong><br /><span class="muted">Any .biggle or .b site, or a built-in page like biggle://nox.</span></span>
      </label>
      {#if ownPage}
        <form class="row" onsubmit={useOwn}>
          <input bind:value={pageText} placeholder="home.biggle" aria-label="Page new tabs open" autocapitalize="off" spellcheck="false" />
          <button class="primary" disabled={!pageText.trim()}>Use it</button>
        </form>
      {/if}
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      {#if saved}<p class="saved" role="status">{saved}</p>{/if}

      <div class="more">
        <button class="ghost" onclick={customize}><Icon name="settings" size={15} /> Customize the new tab page</button>
        <p class="muted small">The new tab page is always at <code>biggle://newtab</code>, whatever new tabs open.</p>
      </div>
    </section>
  </div>
</div>

<style>
  .settings {
    height: 100%;
    overflow: auto;
    background: var(--surface);
  }
  .inner {
    max-width: 640px;
    margin: 0 auto;
    padding: 40px 20px 64px;
  }
  h1 {
    margin: 0 0 24px;
    font-size: 28px;
    letter-spacing: -0.02em;
  }
  h2 {
    margin: 0 0 12px;
    font-size: 17px;
  }
  section {
    padding: 20px;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--card);
  }
  p {
    margin: 0;
  }
  .muted {
    color: var(--muted);
  }
  .small {
    font-size: 13px;
  }
  em {
    color: var(--muted);
    font-style: normal;
  }
  button {
    font: inherit;
    cursor: pointer;
  }
  .primary,
  .ghost {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 36px;
    padding: 0 14px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
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
    background: var(--surface);
    color: var(--text);
  }
  .current {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 14px;
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--accent-soft);
    font-size: 14px;
    overflow-wrap: anywhere;
  }
  .choice {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 0;
    font-size: 14.5px;
    line-height: 1.4;
    cursor: pointer;
  }
  .choice input {
    margin-top: 3px;
  }
  .choice .muted {
    font-size: 13px;
  }
  .row {
    display: flex;
    gap: 8px;
    margin: 4px 0 0 26px;
  }
  .row input {
    flex: 1;
    min-width: 0;
    height: 36px;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 14px;
  }
  .row input:focus {
    outline: 0;
    border-color: var(--accent);
  }
  .error {
    margin-top: 10px;
    color: var(--danger);
    font-size: 13.5px;
  }
  .saved {
    margin-top: 10px;
    color: var(--online);
    font-size: 13.5px;
  }
  .more {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    margin-top: 18px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
  }
  code {
    padding: 1px 6px;
    border-radius: 6px;
    background: var(--hover);
    font-size: 12.5px;
  }
</style>
