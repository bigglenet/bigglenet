// The browser's own right-click menus: for links, pictures and selected text in pages, for tabs,
// and for tab groups. ContextMenu.svelte draws whichever is open.
import type { IconName } from '../components/Icon.svelte';
import { bookmarks } from './bookmarks.svelte';
import { browser, GROUP_COLORS, type GroupColor, type Tab, type TabGroup } from './browser.svelte';
import { t } from './i18n.svelte';
import { desktop, isApp } from './platform';
import { fromGateway, noxSearch, START } from './url';

export type MenuItem =
  | { separator: true }
  | {
      separator?: false;
      label: string;
      icon?: IconName;
      action?: () => void;
      danger?: boolean;
      disabled?: boolean;
      checked?: boolean;
      /** A row of colour dots instead of a label (tab groups). */
      colors?: { value: GroupColor; current: boolean; pick: () => void }[];
      submenu?: MenuItem[];
    };

const sep = { separator: true } as const;

class ContextMenu {
  open = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);
  /** The tab group whose name is being edited (TabBar). */
  renamingGroup = $state<number | null>(null);

  show(x: number, y: number, items: MenuItem[]) {
    this.open = { x, y, items };
  }

  close() {
    this.open = null;
  }

  /** Right-click on a link, a picture or selected text in a page. */
  forPage(tab: Tab, at: { x: number; y: number; link: string | null; image: string | null; selection: string }) {
    const items: MenuItem[] = [];
    const link = at.link;
    if (link?.startsWith('biggle://')) {
      items.push(
        { label: t('Open link in new tab'), icon: 'plus', action: () => browser.newTab(link, { after: tab.id, activate: false }) },
        { label: t('Open link in new private tab'), icon: 'shield', action: () => browser.newTab(link, { after: tab.id, private: true }) },
        { label: t('Open link side by side'), icon: 'tabs', action: () => browser.splitWith(tab.id, browser.newTab(link, { after: tab.id, activate: false }).id) },
        { label: t('Bookmark link'), icon: 'star', action: () => bookmarks.add(link, link.replace(/^biggle:\/\//, ''), null) },
        { label: t('Copy link'), icon: 'copy', action: () => copy(link) },
      );
    } else if (link) {
      items.push({ label: t('Open link'), icon: 'external', action: () => (browser.external = link) }, { label: t('Copy link'), icon: 'copy', action: () => copy(link) });
    }
    if (at.image) {
      const image = at.image;
      const address = fromGateway(image);
      if (items.length) items.push(sep);
      if (address) items.push({ label: t('Open picture in new tab'), icon: 'plus', action: () => browser.newTab(address, { after: tab.id }) });
      items.push({ label: t('Copy picture address'), icon: 'copy', action: () => copy(address ?? image) });
      if (isApp && /^https?:/i.test(image)) items.push({ label: t('Save picture'), icon: 'download', action: () => desktop?.downloads.start(image) });
    }
    if (at.selection) {
      const text = at.selection;
      if (items.length) items.push(sep);
      items.push(
        { label: t('Copy'), icon: 'copy', action: () => copy(text) },
        { label: t('Search Nox for “{text}”', { text: text.length > 24 ? text.slice(0, 24) + '…' : text }), icon: 'search', action: () => browser.newTab(noxSearch(text), { after: tab.id }) },
      );
    }
    if (items.length) this.show(at.x, at.y, items);
  }

  /** Right-click on a tab. */
  forTab(tab: Tab, x: number, y: number) {
    const others = browser.tabs.filter((o) => o.id !== tab.id && !o.pinned);
    const i = browser.tabs.indexOf(tab);
    const groups = browser.groups.filter((g) => g.id !== tab.groupId);
    const items: MenuItem[] = [
      { label: t('New tab to the right'), icon: 'plus', action: () => browser.newTab(undefined, { after: tab.id }) },
      { label: t('Reload'), icon: 'reload', action: () => browser.reload(tab), disabled: tab.url === START },
      { label: t('Duplicate'), icon: 'copy', action: () => browser.duplicate(tab) },
      { label: tab.pinned ? t('Unpin') : t('Pin'), icon: 'pin', action: () => browser.pin(tab, !tab.pinned) },
      { label: tab.muted ? t('Unmute site') : t('Mute site'), icon: tab.muted ? 'volume' : 'mute', action: () => browser.mute(tab) },
      sep,
    ];
    if (!tab.pinned) {
      items.push({
        label: t('Add to group'),
        icon: 'tabs',
        submenu: [
          { label: t('New group'), icon: 'plus', action: () => (this.renamingGroup = browser.group([tab.id]).id) },
          ...(groups.length ? [sep] : []),
          ...groups.map((g): MenuItem => ({ label: g.name || t('Unnamed group'), icon: 'tabs', action: () => browser.addToGroup([tab.id], g.id) })),
        ],
      });
      if (tab.groupId !== null) items.push({ label: t('Remove from group'), icon: 'close', action: () => browser.ungroup(tab) });
    }
    if (others.length) {
      items.push({
        label: browser.inSplit(tab.id) ? t('Stop side by side') : t('Side by side with…'),
        icon: 'split',
        ...(browser.inSplit(tab.id)
          ? { action: () => (browser.split = null) }
          : { submenu: others.slice(0, 15).map((o): MenuItem => ({ label: o.title, action: () => browser.splitWith(tab.id, o.id) })) }),
      });
    }
    items.push(
      { label: t('Move to new window'), icon: 'external', action: () => browser.moveToNewWindow(tab) },
      { label: t('Put to sleep'), icon: 'moon', action: () => browser.sleep(tab), disabled: tab.id === browser.activeId || tab.view.type === 'asleep' },
      sep,
      { label: t('Close'), icon: 'close', action: () => browser.closeTab(tab.id, { force: true }) },
      { label: t('Close other tabs'), action: () => browser.closeOthers(tab.id), disabled: !others.length },
      { label: t('Close tabs to the right'), action: () => browser.closeToTheRight(tab.id), disabled: !browser.tabs.slice(i + 1).some((o) => !o.pinned) },
      { label: t('Reopen closed tab'), icon: 'reload', action: () => browser.reopenClosed(), disabled: !browser.closed.length },
    );
    this.show(x, y, items);
  }

  /** Right-click on a tab group's name. */
  forGroup(group: TabGroup, x: number, y: number) {
    this.show(x, y, [
      { label: t('Rename'), icon: 'edit', action: () => (this.renamingGroup = group.id) },
      { label: '', colors: GROUP_COLORS.map((c) => ({ value: c, current: c === group.color, pick: () => (group.color = c) })) },
      { label: group.collapsed ? t('Expand') : t('Collapse'), icon: group.collapsed ? 'down' : 'up', action: () => (group.collapsed = !group.collapsed) },
      { label: t('New tab in group'), icon: 'plus', action: () => browser.newTab(undefined, { after: browser.tabs.findLast((x) => x.groupId === group.id)?.id, groupId: group.id }) },
      sep,
      { label: t('Ungroup'), action: () => browser.removeGroup(group.id, false) },
      { label: t('Close group'), icon: 'close', danger: true, action: () => browser.removeGroup(group.id, true) },
    ]);
  }
}

function copy(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

export const menu = new ContextMenu();
