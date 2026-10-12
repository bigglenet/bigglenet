<script lang="ts">
  // The tab bar: pinned tabs first (just their icons), then tabs, in groups if you've made any.
  // Drag a tab to move it, or out of the bar to give it a window of its own. Right-click for
  // more. Hover for a preview.
  import { browser, type Tab, type TabGroup } from '../lib/browser.svelte';
  import { menu } from '../lib/contextmenu.svelte';
  import { t } from '../lib/i18n.svelte';
  import { isApp, ownWindowButtons } from '../lib/platform';
  import { START } from '../lib/url';
  import Icon from './Icon.svelte';
  import WindowControls from './WindowControls.svelte';

  function newTab() {
    browser.newTab();
    browser.focusAddress();
  }

  // With lots of tabs the strip scrolls sideways, so the new-tab and window buttons stay put.
  let strip = $state<HTMLElement>();
  $effect(() => {
    void browser.activeId;
    void browser.tabs.length;
    strip?.querySelector('.tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });

  function onwheel(e: WheelEvent) {
    if (!strip || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    strip.scrollLeft += e.deltaY;
  }

  /** What the strip shows: tabs, with a group's name before its first tab, and closed groups as just their names. */
  type Item = { kind: 'tab'; tab: Tab } | { kind: 'group'; group: TabGroup };
  const items = $derived.by(() => {
    const out: Item[] = [];
    let last: number | null = null;
    for (const tab of browser.tabs) {
      const group = browser.groupOf(tab);
      if (group && group.id !== last) out.push({ kind: 'group', group });
      last = group?.id ?? null;
      if (!group?.collapsed) out.push({ kind: 'tab', tab });
    }
    return out;
  });

  // --- Dragging ---

  let dragging = $state<{ id: number; x: number; y: number; moved: boolean; out: boolean } | null>(null);
  function onpointerdown(e: PointerEvent, tab: Tab) {
    if (e.button !== 0) return;
    dragging = { id: tab.id, x: e.clientX, y: e.clientY, moved: false, out: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onpointermove(e: PointerEvent) {
    if (!dragging || !strip) return;
    if (!dragging.moved && Math.hypot(e.clientX - dragging.x, e.clientY - dragging.y) < 6) return;
    dragging.moved = true;
    preview = null;
    const bar = strip.getBoundingClientRect();
    // Well below the bar: it'll get a window of its own.
    dragging.out = e.clientY > bar.bottom + 50 || e.clientY < bar.top - 30;
    if (dragging.out) return;
    // Over another tab: take its place.
    const els = [...strip.querySelectorAll<HTMLElement>('.tab[data-id]')];
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right) {
        const target = Number(el.dataset.id);
        if (target !== dragging.id) browser.moveTab(dragging.id, browser.tabs.findIndex((x) => x.id === target));
        break;
      }
    }
  }
  function onpointerup(e: PointerEvent) {
    const d = dragging;
    dragging = null;
    if (!d) return;
    const tab = browser.tabs.find((x) => x.id === d.id);
    if (!d.moved) {
      if (tab) browser.activate(tab.id);
      return;
    }
    if (d.out && tab && (browser.tabs.length > 1 || !isApp)) browser.moveToNewWindow(tab, { x: e.screenX - 100, y: e.screenY - 20 });
  }

  // --- Previews on hover ---

  let preview = $state<{ tab: Tab; x: number; y: number } | null>(null);
  let hoverTimer: ReturnType<typeof setTimeout>;
  function onenter(e: PointerEvent, tab: Tab) {
    if (e.pointerType !== 'mouse' || dragging) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => (preview = { tab, x: Math.min(r.left, innerWidth - 300), y: r.bottom + 6 }), preview ? 80 : 650);
  }
  function onleave() {
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => (preview = null), 120);
  }

  let groupName = $state('');
  $effect(() => {
    const id = menu.renamingGroup;
    if (id !== null) groupName = browser.groups.find((g) => g.id === id)?.name ?? '';
  });
  function saveGroupName(group: TabGroup) {
    group.name = groupName.trim().slice(0, 40);
    menu.renamingGroup = null;
  }

  const host = (url: string) => (url === START ? '' : url.replace(/^biggle:\/\//, ''));
</script>

<div class="tabbar" class:dragging={dragging?.moved}>
  <div class="tabs" role="tablist" aria-label={t('Tabs')} bind:this={strip} {onwheel}>
    {#each items as item (item.kind === 'tab' ? `t${item.tab.id}` : `g${item.group.id}`)}
      {#if item.kind === 'group'}
        {@const g = item.group}
        {#if menu.renamingGroup === g.id}
          <!-- svelte-ignore a11y_autofocus -->
          <input
            class="group-name group-{g.color}"
            bind:value={groupName}
            autofocus
            maxlength="40"
            placeholder={t('Name this group')}
            onkeydown={(e) => (e.key === 'Enter' || e.key === 'Escape') && saveGroupName(g)}
            onblur={() => saveGroupName(g)}
          />
        {:else}
          <button
            class="group group-{g.color}"
            class:collapsed={g.collapsed}
            title={g.collapsed ? t('Show this group’s tabs') : t('Hide this group’s tabs')}
            onclick={() => (g.collapsed = !g.collapsed)}
            ondblclick={() => (menu.renamingGroup = g.id)}
            oncontextmenu={(e) => (e.preventDefault(), menu.forGroup(g, e.clientX, e.clientY))}
          >
            {g.name || ''}{#if g.collapsed}<span class="count">{browser.tabs.filter((x) => x.groupId === g.id).length}</span>{/if}
          </button>
        {/if}
      {:else}
        {@const tab = item.tab}
        {@const group = browser.groupOf(tab)}
        <div
          class="tab {group ? `group-${group.color}` : ''}"
          class:active={tab.id === browser.activeId}
          class:pinned={tab.pinned}
          class:private={tab.private}
          class:asleep={tab.view.type === 'asleep'}
          class:grouped={!!group}
          class:split={browser.inSplit(tab.id)}
          class:lifted={dragging?.moved && dragging.id === tab.id}
          data-id={tab.id}
          role="presentation"
          onauxclick={(e) => e.button === 1 && browser.closeTab(tab.id, { force: true })}
          oncontextmenu={(e) => (e.preventDefault(), (preview = null), menu.forTab(tab, e.clientX, e.clientY))}
          onpointerenter={(e) => onenter(e, tab)}
          onpointerleave={onleave}
        >
          <button
            class="tab-main"
            role="tab"
            aria-selected={tab.id === browser.activeId}
            aria-label={tab.pinned ? tab.title : undefined}
            onpointerdown={(e) => onpointerdown(e, tab)}
            {onpointermove}
            {onpointerup}
            onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && browser.activate(tab.id)}
          >
            <span class="tab-icon">
              {#if tab.loading}
                <span class="spinner"></span>
              {:else if tab.private}
                <Icon name="incognito" size={14} />
              {:else if tab.icon}
                <img src={tab.icon} alt="" />
              {:else}
                <Icon name="globe" size={14} />
              {/if}
            </span>
            {#if !tab.pinned}<span class="tab-title">{tab.title}</span>{/if}
          </button>
          {#if tab.audible || tab.muted}
            <button
              class="sound"
              aria-label={tab.muted ? t('Unmute this tab') : t('Mute this tab')}
              title={tab.muted ? t('Unmute') : t('Mute')}
              onclick={() => browser.mute(tab)}
            >
              <Icon name={tab.muted ? 'mute' : 'volume'} size={13} />
            </button>
          {/if}
          {#if !tab.pinned}
            <button class="tab-close" aria-label={t('Close {title}', { title: tab.title })} onclick={() => browser.closeTab(tab.id)}>
              <Icon name="close" size={13} />
            </button>
          {/if}
        </div>
      {/if}
    {/each}
  </div>
  <button class="new-tab" aria-label={t('New tab')} title={t('New tab')} onclick={newTab} oncontextmenu={(e) => (e.preventDefault(), menu.show(e.clientX, e.clientY, [{ label: t('New tab'), icon: 'plus', action: newTab }, { label: t('New private tab'), icon: 'incognito', action: () => browser.shortcut('shift+n') }]))}>
    <Icon name="plus" size={16} />
  </button>
  {#if ownWindowButtons}
    <WindowControls />
  {/if}
</div>

{#if preview && !dragging}
  {@const p = preview.tab}
  <div class="preview" style:left="{Math.max(8, preview.x)}px" style:top="{preview.y}px" role="tooltip">
    <strong>{p.title}</strong>
    {#if host(p.url)}<span class="url">{host(p.url)}</span>{/if}
    {#if p.view.type === 'asleep'}<span class="note">{t('Asleep, to save memory. It wakes when you open it.')}</span>{/if}
    {#if p.private}<span class="note">{t('Private tab')}</span>{/if}
    {#if p.thumbnail && p.id !== browser.activeId}<img src={p.thumbnail} alt="" />{/if}
  </div>
{/if}

<style>
  .tabbar {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    padding: 6px 8px 0;
    background: var(--chrome);
    min-width: 0;
  }
  /* In the desktop app the tab bar is the title bar: its empty parts move the window. */
  :global([data-titlebar]) .tabbar {
    -webkit-app-region: drag;
  }
  :global([data-titlebar]) .tab,
  :global([data-titlebar]) .group,
  :global([data-titlebar]) .group-name,
  :global([data-titlebar]) .new-tab {
    -webkit-app-region: no-drag;
  }
  /* Desktop app on macOS: leave room for the window buttons. */
  :global([data-titlebar='overlay']) .tabbar {
    padding-left: 88px;
    padding-top: 8px;
  }
  /* Desktop app on Windows and Linux: the window buttons go at the far right, full height. */
  :global([data-titlebar='custom']) .tabbar {
    height: 40px;
    padding: 0 0 0 8px;
  }
  /* On phones the tabs live in the tab switcher instead. In the desktop app this bar is also
     the title bar, so it stays. */
  @media (max-width: 699px) {
    :global(html:not([data-titlebar])) .tabbar {
      display: none;
    }
  }

  .tabs {
    flex: 0 1 auto;
    min-width: 0;
    display: flex;
    align-items: flex-end;
    gap: 2px;
    align-self: stretch;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
  }
  .tabs::-webkit-scrollbar {
    display: none;
  }

  .tab {
    position: relative;
    /* A set width rather than a flex-basis: browsers then measure the strip by the tabs, not by
       their titles (WebKit left a gap before the + button when a title was long). */
    flex: 0 1 auto;
    width: 220px;
    min-width: 44px;
    display: flex;
    align-items: center;
    height: 34px;
    border-radius: 10px 10px 0 0;
    color: var(--muted);
  }
  .tab.pinned {
    flex: none;
    width: 44px;
    min-width: 44px;
  }
  .tab:hover:not(.active) {
    background: var(--hover);
  }
  .tab.active {
    background: var(--toolbar);
    color: var(--text);
  }
  .tab.private.active {
    background: color-mix(in srgb, var(--private) 16%, var(--toolbar));
  }
  .tab.private .tab-icon {
    color: var(--private);
  }
  .tab.asleep .tab-main {
    opacity: 0.55;
  }
  .tab.grouped::before {
    content: '';
    position: absolute;
    left: 6px;
    right: 6px;
    bottom: 0;
    height: 2px;
    border-radius: 2px;
    background: var(--group);
  }
  .tab.split:not(.active) {
    box-shadow: inset 0 -2px 0 var(--accent-soft);
  }
  .tab.lifted {
    opacity: 0.7;
    background: var(--toolbar);
  }
  .tabbar.dragging .tab {
    transition: transform 0.12s;
  }

  .tab-main {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    height: 100%;
    padding: 0 4px 0 12px;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    font-size: 12.5px;
    text-align: left;
    cursor: default;
    touch-action: none;
  }
  .pinned .tab-main {
    justify-content: center;
    padding: 0;
  }

  .tab-icon {
    flex: none;
    display: grid;
    place-items: center;
    width: 16px;
    height: 16px;
  }
  .tab-icon img {
    width: 16px;
    height: 16px;
    border-radius: 4px;
  }

  .tab-title {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .sound,
  .tab-close {
    flex: none;
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border: 0;
    border-radius: 6px;
    background: none;
    color: inherit;
  }
  .sound:hover,
  .tab-close:hover {
    background: var(--hover);
  }
  .pinned .sound {
    position: absolute;
    top: 1px;
    right: 1px;
    width: 16px;
    height: 16px;
  }
  .tab-close {
    margin-right: 6px;
    opacity: 0;
  }
  .tab:hover .tab-close,
  .tab.active .tab-close,
  .tab-close:focus-visible {
    opacity: 1;
  }
  .tab:not(.active):not(.grouped):has(+ .tab:not(.active):not(.grouped))::after {
    content: '';
    position: absolute;
    right: -1px;
    top: 9px;
    bottom: 9px;
    width: 1px;
    background: var(--border);
  }

  .group,
  .group-name {
    flex: none;
    align-self: center;
    display: flex;
    align-items: center;
    gap: 5px;
    height: 22px;
    max-width: 140px;
    margin: 0 2px 4px 4px;
    padding: 0 9px;
    border: 0;
    border-radius: 7px;
    background: var(--group);
    color: #fff;
    font: inherit;
    font-size: 12px;
    font-weight: 700;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .group:empty {
    width: 14px;
    padding: 0;
  }
  .group.collapsed {
    opacity: 0.85;
  }
  .count {
    padding: 0 5px;
    border-radius: 6px;
    background: rgb(255 255 255 / 0.25);
    font-size: 11px;
  }
  .group-name {
    width: 140px;
    outline: 0;
  }
  .group-name::placeholder {
    color: rgb(255 255 255 / 0.75);
  }

  .new-tab {
    flex: none;
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    margin: 0 0 2px 4px;
    border: 0;
    border-radius: 8px;
    background: none;
    color: var(--muted);
  }
  .new-tab:hover {
    background: var(--hover);
    color: var(--text);
  }

  .spinner {
    width: 13px;
    height: 13px;
    border: 2px solid var(--accent-soft);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .preview {
    position: fixed;
    z-index: 60;
    width: 280px;
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--card);
    box-shadow: 0 14px 36px -14px rgb(0 0 0 / 0.45);
    pointer-events: none;
  }
  .preview strong {
    font-size: 13px;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .preview .url,
  .preview .note {
    color: var(--muted);
    font-size: 12px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .preview img {
    width: 100%;
    margin-top: 6px;
    border-radius: 8px;
    border: 1px solid var(--border);
  }
</style>
