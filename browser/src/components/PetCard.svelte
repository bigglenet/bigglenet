<script lang="ts">
  // Your pet on the new tab page: adopting one, how it's doing, and changing its look.
  import { errorText } from '../lib/api';
  import { browser, type Tab } from '../lib/browser.svelte';
  import { plural, t } from '../lib/i18n.svelte';
  import { PET_COLOURS, PET_KINDS, pets, STAGE_NAMES, type PetKind, type PetStage } from '../lib/pet.svelte';
  import { siteHome, siteHost } from '../lib/url';
  import Pet from './Pet.svelte';

  let { tab }: { tab: Tab } = $props();

  // Snacks it takes to reach each stage (as in server/src/pets.ts).
  const STARTS: Record<PetStage, number> = { egg: 0, baby: 1, kid: 10, grown: 30, legend: 100 };

  $effect(() => {
    pets.refresh();
  });

  let editing = $state(false);
  let letting = $state(false);
  let name = $state('');
  let kind = $state<PetKind>('blob');
  let colour = $state(PET_COLOURS[0]);
  let busy = $state(false);
  let error = $state('');

  function edit() {
    const pet = pets.mine;
    name = pet?.name ?? '';
    kind = pet?.kind ?? 'blob';
    colour = pet?.colour ?? PET_COLOURS[Math.floor(Math.random() * PET_COLOURS.length)];
    error = '';
    editing = true;
  }

  async function save(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    error = '';
    try {
      await pets.save(name, kind, colour);
      editing = false;
    } catch (err) {
      error = errorText(err);
    } finally {
      busy = false;
    }
  }

  async function letGo() {
    busy = true;
    try {
      await pets.letGo();
      letting = false;
    } catch (err) {
      error = errorText(err);
    } finally {
      busy = false;
    }
  }

  const pet = $derived(pets.mine);
  const progress = $derived(pet && pet.next !== null ? (pet.snacks - STARTS[pet.stage]) / (pet.snacks + pet.next - STARTS[pet.stage]) : 1);
  const moodLine = $derived.by(() => {
    if (!pet) return '';
    const n = pet.today;
    if (pet.mood === 'egg') return t('{name} is still an egg. Visit any site to hatch it!', { name: pet.name });
    if (pet.mood === 'hungry') return t('{name} is hungry. Visit a site to give them a snack!', { name: pet.name });
    if (pet.mood === 'lonely') return t('{name} missed you! Visit a few sites to cheer them up.', { name: pet.name });
    if (pet.mood === 'stuffed') return t('{name} is full: {n} snacks today!', { name: pet.name, n });
    return n === 1 ? t('{name} had a snack today. Yum!', { name: pet.name }) : t('{name} had {n} snacks today. Yum!', { name: pet.name, n });
  });
</script>

{#if pets.loaded}
  <section class="pet-card" aria-label={t('My pet')}>
    {#if editing || !pet}
      <form onsubmit={save}>
        {#if !pet}
          <h2>{t('Adopt a pet')}</h2>
          <p class="muted">{t('It eats a snack for every different site you visit each day, and grows as it eats. Friends see it on your profile.')}</p>
        {/if}
        <div class="kinds" role="radiogroup" aria-label={t('Pet')}>
          {#each PET_KINDS as k (k.id)}
            <button type="button" role="radio" aria-checked={kind === k.id} class:on={kind === k.id} onclick={() => (kind = k.id)} title={t(k.name)}>
              <Pet kind={k.id} {colour} stage="kid" size={52} />
              <span>{t(k.name)}</span>
            </button>
          {/each}
        </div>
        <div class="colours" role="radiogroup" aria-label={t('Colour')}>
          {#each PET_COLOURS as c (c)}
            <button type="button" role="radio" aria-checked={colour === c} aria-label={c} class:on={colour === c} style:background={c} onclick={() => (colour = c)}></button>
          {/each}
        </div>
        <div class="row">
          <input bind:value={name} maxlength="20" required placeholder={t('Name')} aria-label={t('Name')} />
          {#if pet}<button type="button" class="ghost" onclick={() => (editing = false)}>{t('Cancel')}</button>{/if}
          <button class="primary" disabled={busy || !name.trim()}>{pet ? t('Save') : t('Adopt')}</button>
        </div>
        {#if error}<p class="error" role="alert">{error}</p>{/if}
      </form>
    {:else}
      <div class="home">
        <Pet kind={pet.kind} colour={pet.colour} stage={pet.stage} mood={pet.mood} name={pet.name} size={112} />
        <div class="about">
          <h2>{pet.name} <span class="muted small">{t(STAGE_NAMES[pet.stage])} · {plural(pet.snacks, '{n} snack', '{n} snacks')}</span></h2>
          <p>{moodLine}</p>
          {#if pet.next !== null}
            <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(progress * 100)}>
              <span style:width="{Math.max(4, progress * 100)}%"></span>
            </div>
            <p class="muted small">
              {pet.stage === 'egg' ? t('One snack to hatch') : plural(pet.next, '{n} more snack to grow', '{n} more snacks to grow')}
            </p>
          {:else}
            <p class="muted small">{t('A legend. It can’t grow any more!')}</p>
          {/if}
          {#if pet.lastSite}
            <p class="muted small">
              {t('Last snack:')} <button class="link" onclick={() => browser.go(tab, siteHome(pet.lastSite!))}>{siteHost(pet.lastSite)}</button>
            </p>
          {/if}
        </div>
      </div>
      <div class="tools">
        {#if letting}
          <span>{t('Let {name} go? You can’t get them back.', { name: pet.name })}</span>
          <button class="danger" disabled={busy} onclick={letGo}>{t('Let go')}</button>
          <button class="ghost" onclick={() => (letting = false)}>{t('Keep')}</button>
        {:else}
          <button class="ghost" onclick={edit}>{t('Change name or look')}</button>
          <button class="ghost quiet" onclick={() => (letting = true)}>{t('Let go')}</button>
        {/if}
        {#if error}<p class="error" role="alert">{error}</p>{/if}
      </div>
    {/if}
  </section>
{/if}

<style>
  .pet-card {
    margin-top: 22px;
    padding: 16px 18px;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--card);
  }
  h2 {
    margin: 0;
    font-size: 17px;
  }
  p {
    margin: 4px 0 0;
  }
  .muted {
    color: var(--muted);
  }
  .small {
    font-size: 13px;
    font-weight: 500;
  }
  .home {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .about {
    flex: 1;
    min-width: 0;
  }
  .bar {
    height: 8px;
    margin-top: 10px;
    border-radius: 999px;
    background: var(--border);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--accent);
  }
  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    font: inherit;
    cursor: pointer;
  }
  .tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
    font-size: 13.5px;
  }
  .kinds {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
  }
  .kinds button {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 6px 8px 8px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: none;
    color: var(--text);
    font: inherit;
    font-size: 12.5px;
  }
  .kinds button.on {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }
  .colours {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
  }
  .colours button {
    width: 26px;
    height: 26px;
    padding: 0;
    border: 2px solid var(--card);
    border-radius: 50%;
    box-shadow: 0 0 0 1px var(--border);
  }
  .colours button.on {
    box-shadow: 0 0 0 2px var(--accent);
  }
  .row {
    display: flex;
    gap: 8px;
    margin-top: 12px;
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
  }
  .primary,
  .ghost,
  .danger {
    height: 36px;
    padding: 0 14px;
    border-radius: 10px;
    font: inherit;
    font-size: 13.5px;
    font-weight: 600;
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
    background: none;
    color: var(--text);
  }
  .ghost.quiet {
    border-color: transparent;
    color: var(--muted);
  }
  .danger {
    border: 0;
    background: var(--danger, #d64545);
    color: #fff;
  }
  .error {
    width: 100%;
    color: var(--danger, #d64545);
    font-size: 13.5px;
  }
</style>
