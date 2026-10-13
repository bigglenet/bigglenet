<script lang="ts">
  import { account } from '../lib/account.svelte';
  import { browser, type Tab } from '../lib/browser.svelte';
  import { menu } from '../lib/contextmenu.svelte';
  import { provideFinder, type FindResult } from '../lib/find.svelte';
  import { provideControl } from '../lib/pagecontrol';
  import { perf } from '../lib/perf.svelte';
  import { desktop } from '../lib/platform';
  import { cleanReader } from '../lib/reader';
  import { answerCall, closeScope, newScope, roomSend } from '../lib/frame';
  import { parse } from '../lib/url';
  import { siteSettings } from '../lib/sitesettings.svelte';
  import { frameZoom, zoom } from '../lib/zoom.svelte';

  // A new `view` object means a new load, even if the srcdoc is identical (reload).
  let { tab, view }: { tab: Tab; view: { site: string; srcdoc: string } } = $props();

  let iframe = $state<HTMLIFrameElement>();
  let loaded = $state(0);
  const send = (msg: Record<string, unknown>) => iframe?.contentWindow?.postMessage({ biggle: 1, ...msg }, '*');

  // What the page asks the browser for (storage, rooms, comments…), for this page of its site.
  // A new page (a new `view`) gets a new scope; leaving it leaves its rooms.
  const scope = $derived.by(() => {
    const u = parse(tab.url);
    return newScope(view.site, u?.kind === 'site' ? u.path : '/', send, { private: tab.private, say: (text) => browser.say(text) });
  });
  $effect(() => {
    const s = scope;
    return () => closeScope(s);
  });

  // Questions to the page (find, reader mode, picture-in-picture), answered by id.
  let nextAsk = 0;
  const asking = new Map<number, (msg: Record<string, unknown>) => void>();
  function ask(msg: Record<string, unknown>, ms = 2000): Promise<Record<string, unknown> | null> {
    return new Promise((resolve) => {
      const id = ++nextAsk;
      asking.set(id, resolve);
      send({ ...msg, id });
      // A page busy running a game might not answer.
      setTimeout(() => asking.delete(id) && resolve(null), ms);
    });
  }

  $effect(() => {
    const onmessage = (e: MessageEvent) => {
      if (!iframe || e.source !== iframe.contentWindow) return;
      const msg = e.data;
      if (!msg || typeof msg !== 'object' || msg.biggle !== 1) return;
      if ((msg.type === 'found' || msg.type === 'reader' || msg.type === 'pip') && asking.has(msg.id)) {
        asking.get(msg.id)!(msg);
        asking.delete(msg.id);
        return;
      }
      if (msg.type === 'fps') {
        if (perf.on && browser.isVisible(tab.id)) {
          perf.fps = Number(msg.fps) || 0;
          perf.memory = typeof msg.memory === 'number' ? msg.memory : null;
        }
        return;
      }
      if (msg.type === 'context') return openMenu(msg);
      if (msg.type === 'call') return answerCall(scope, msg, send);
      if (msg.type === 'room-send') return roomSend(scope, msg.id, msg.data);
      browser.onPageMessage(tab, msg, (reply) => send(reply));
    };
    window.addEventListener('message', onmessage);
    return () => window.removeEventListener('message', onmessage);
  });

  $effect(() =>
    provideFinder(tab.id, {
      find: async (text, dir) => {
        const r = await ask({ type: 'find', text, dir });
        const count = Number(r?.count);
        const index = Number(r?.index);
        return r && Number.isFinite(count) && Number.isFinite(index) ? ({ count, index } as FindResult) : null;
      },
      clear: () => send({ type: 'find-clear' }),
    }),
  );

  $effect(() =>
    provideControl(tab.id, {
      print: () => send({ type: 'command', action: 'print' }),
      reader: async () => cleanReader((await ask({ type: 'command', action: 'reader' }, 3000))?.result),
      pip: async () => (await ask({ type: 'command', action: 'pip' }))?.ok === true,
      capture: async (width) => {
        if (!desktop || !iframe) return null;
        const r = iframe.getBoundingClientRect();
        return desktop.window.capture({ x: r.left, y: r.top, width: r.width, height: r.height }, width);
      },
    }),
  );

  // What the page should be doing: muted or not, dark or not, counting frames or not. Sent again
  // after each load.
  $effect(() => {
    void loaded;
    send({ type: 'command', action: 'mute', on: tab.muted });
  });
  $effect(() => {
    void loaded;
    send({ type: 'command', action: 'dark', on: siteSettings.dark(view.site) });
  });
  $effect(() => {
    void loaded;
    send({ type: 'command', action: 'fps', on: perf.on && browser.isVisible(tab.id) });
  });

  /** The browser's menu for a link, picture or selected text in the page. */
  function openMenu(msg: Record<string, unknown>) {
    if (!iframe) return;
    const r = iframe.getBoundingClientRect();
    const z = zoom.of(tab.url);
    menu.forPage(tab, {
      x: r.left + Number(msg.x) * z,
      y: r.top + Number(msg.y) * z,
      link: typeof msg.link === 'string' ? msg.link : null,
      image: typeof msg.image === 'string' ? msg.image : null,
      selection: typeof msg.selection === 'string' ? msg.selection : '',
    });
  }

  // Tell the page when the visitor signs in or out. It got the current user when it loaded.
  let lastUser: string | null | undefined;
  $effect(() => {
    const username = account.user?.username ?? null;
    if (lastUser !== undefined && username !== lastUser) {
      send({ type: 'user', user: username && { username } });
    }
    lastUser = username;
  });
</script>

<!--
  The page gets its own opaque origin: no cookies, no storage, no access to the browser.
  It talks to us only through postMessage (see page-runtime.js).
-->
{#key view}
  <iframe
    bind:this={iframe}
    srcdoc={view.srcdoc}
    title={tab.title}
    sandbox="allow-scripts allow-forms allow-modals allow-downloads"
    allow="fullscreen; autoplay; clipboard-write; picture-in-picture"
    referrerpolicy="no-referrer"
    style={frameZoom(zoom.of(tab.url))}
    onload={() => {
      loaded++;
      browser.frameLoaded(tab);
    }}
  ></iframe>
{/key}

<style>
  iframe {
    display: block;
    width: 100%;
    height: 100%;
    border: 0;
    background: #fff;
  }
</style>
