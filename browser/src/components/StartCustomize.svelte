<script lang="ts">
  // The start page's Customize panel: what new tabs open, what the page shows, shortcuts and
  // a background. Everything is kept in this browser as soon as it changes.
  import { BACKDROPS, MAX_SHORTCUTS, SECTIONS, startSettings as settings, toAddress } from '../lib/startpage.svelte';
  import Icon from './Icon.svelte';

  let { onclose }: { onclose: () => void } = $props();

  // New tabs: the start page, or a page of your choice.
  let ownPage = $state(settings.newTab !== null);
  let pageText = $state(settings.newTab ?? '');
  let pageError = $state('');

  function setNewTab() {
    pageError = '';
    if (!ownPage) {
      settings.newTab = null;
    } else {
      const address = toAddress(pageText);
      if (!address) {
        pageError = "That isn't a Bigglenet address. Try something like home.biggle.";
        return;
      }
      settings.newTab = address;
      pageText = address;
    }
    settings.save();
  }

  // Shortcuts.
  let shortcutText = $state('');
  let shortcutName = $state('');
  let shortcutError = $state('');

  const nameFor = (address: string) => address.replace(/^biggle:\/\//, '').replace(/\.biggle\/?.*$/, '').replace(/\/$/, '');

  function addShortcut(e: SubmitEvent) {
    e.preventDefault();
    shortcutError = '';
    const url = toAddress(shortcutText);
    if (!url) {
      shortcutError = "That isn't a Bigglenet address.";
      return;
    }
    if (settings.shortcuts.length >= MAX_SHORTCUTS) {
      shortcutError = `You can have up to ${MAX_SHORTCUTS} shortcuts.`;
      return;
    }
    settings.shortcuts.push({ name: shortcutName.trim().slice(0, 30) || nameFor(url), url });
    settings.save();
    shortcutText = shortcutName = '';
  }

  function removeShortcut(i: number) {
    settings.shortcuts.splice(i, 1);
    settings.save();
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<aside class="panel" aria-label="Customize the new tab page">
  <header>
    <h2>Customize</h2>
    <button class="icon" aria-label="Close" onclick={onclose}><Icon name="close" /></button>
  </header>

  <section>
    <h3>New tabs open</h3>
    <label class="choice">
      <input type="radio" name="newtab" checked={!ownPage} onchange={() => ((ownPage = false), setNewTab())} />
      This start page
    </label>
    <label class="choice">
      <input type="radio" name="newtab" checked={ownPage} onchange={() => (ownPage = true)} />
      A page of my choice
    </label>
    {#if ownPage}
      <form
        class="row"
        onsubmit={(e) => {
          e.preventDefault();
          setNewTab();
        }}
      >
        <input bind:value={pageText} placeholder="home.biggle" aria-label="Page new tabs open" autocapitalize="off" spellcheck="false" />
        <button class="small">Use it</button>
      </form>
      {#if pageError}<p class="error">{pageError}</p>{/if}
      {#if settings.newTab}<p class="hint">New tabs open {settings.newTab}. This page is always at biggle://start.</p>{/if}
    {/if}
  </section>

  <section>
    <h3>Show on this page</h3>
    {#each SECTIONS as section (section.id)}
      <label class="choice">
        <input type="checkbox" bind:checked={settings.shown[section.id]} onchange={() => settings.save()} />
        {section.label}
      </label>
    {/each}
  </section>

  <section>
    <h3>My shortcuts</h3>
    {#if settings.shortcuts.length}
      <ul class="shortcuts">
        {#each settings.shortcuts as shortcut, i (shortcut.url + i)}
          <li>
            <span class="text">
              <strong>{shortcut.name}</strong>
              <span>{shortcut.url}</span>
            </span>
            <button class="icon" aria-label="Remove {shortcut.name}" onclick={() => removeShortcut(i)}><Icon name="trash" size={15} /></button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="hint">Add sites you visit a lot. They show as tiles on this page.</p>
    {/if}
    <form class="add" onsubmit={addShortcut}>
      <input bind:value={shortcutText} placeholder="Address, like stix.biggle" aria-label="Shortcut address" autocapitalize="off" spellcheck="false" required />
      <input bind:value={shortcutName} placeholder="Name (optional)" aria-label="Shortcut name" maxlength="30" />
      <button class="small">Add shortcut</button>
    </form>
    {#if shortcutError}<p class="error">{shortcutError}</p>{/if}
  </section>

  <section>
    <h3>Background</h3>
    <div class="swatches">
      {#each BACKDROPS as backdrop (backdrop.id)}
        <button
          class="swatch"
          class:picked={settings.backdrop === backdrop.id}
          style:--swatch={backdrop.color ?? 'var(--surface)'}
          aria-label={backdrop.name}
          aria-pressed={settings.backdrop === backdrop.id}
          title={backdrop.name}
          onclick={() => {
            settings.backdrop = backdrop.id;
            settings.save();
          }}
        ></button>
      {/each}
    </div>
  </section>

  <button
    class="reset"
    onclick={() => {
      settings.reset();
      ownPage = false;
      pageText = '';
    }}>Reset to default</button
  >
</aside>

<style>
  .panel {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 5;
    width: min(360px, 100%);
    overflow: auto;
    padding: 18px 20px 28px;
    border-left: 1px solid var(--border);
    background: var(--card);
    box-shadow: -20px 0 50px -30px rgb(0 0 0 / 0.4);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  h2 {
    margin: 0;
    font-size: 19px;
  }
  section {
    margin-top: 22px;
  }
  h3 {
    margin: 0 0 8px;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .choice {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 32px;
    font-size: 14.5px;
  }
  .choice input {
    margin: 0;
    accent-color: var(--accent);
  }
  input:not([type]) {
    min-width: 0;
    height: 36px;
    padding: 0 10px;
    border: 1px solid var(--border);
    border-radius: 9px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 14px;
  }
  .row {
    display: flex;
    gap: 8px;
    margin-top: 6px;
  }
  .row input {
    flex: 1;
  }
  .add {
    display: grid;
    gap: 8px;
    margin-top: 10px;
  }
  button {
    font: inherit;
    cursor: pointer;
  }
  .small {
    height: 36px;
    padding: 0 14px;
    border: 0;
    border-radius: 9px;
    background: var(--accent);
    color: var(--on-accent);
    font-weight: 600;
    font-size: 14px;
  }
  .icon {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: 8px;
    background: none;
    color: var(--muted);
  }
  .icon:hover {
    background: var(--hover);
    color: var(--text);
  }
  .hint {
    margin: 6px 0 0;
    color: var(--muted);
    font-size: 13px;
    overflow-wrap: anywhere;
  }
  .error {
    margin: 6px 0 0;
    color: var(--danger);
    font-size: 13px;
  }
  .shortcuts {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .shortcuts li {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 0;
    border-bottom: 1px solid var(--border);
  }
  .text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    font-size: 14px;
  }
  .text span {
    color: var(--muted);
    font-size: 12.5px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .swatch {
    width: 36px;
    height: 36px;
    border: 1px solid var(--border);
    border-radius: 50%;
    background: var(--swatch);
  }
  .swatch.picked {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .reset {
    margin-top: 26px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--muted);
    font-size: 13.5px;
    text-decoration: underline;
  }
</style>
