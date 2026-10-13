// Runs inside every BHTML page, before the page's own scripts.
// The browser sets window.__BIGGLE_INIT__ = { url, site, base, server, search, hash, user, local, app, dark } right before
// this, and puts createFinder() (find-core.js) and readerExtract() (reader-core.js) in scope.
(() => {
  'use strict';

  const init = window.__BIGGLE_INIT__;
  delete window.__BIGGLE_INIT__;
  const sitePrefix = init.server + '/site/';
  let user = init.user;

  const post = (msg) => parent.postMessage({ biggle: 1, ...msg }, '*');

  // Addresses starting with "/" mean the top of this site, not of the Bigglenet server.
  const serverOrigin = new URL(init.server).origin;
  function inSite(href) {
    try {
      const u = new URL(href, document.baseURI);
      if (u.origin !== serverOrigin || /^\/(site|preview)\//.test(u.pathname)) return href;
      return init.base + u.pathname.slice(1) + u.search + u.hash;
    } catch {
      return href;
    }
  }
  const realFetch = window.fetch;
  window.fetch = function (input, options) {
    if (typeof input === 'string' || input instanceof URL) input = inSite(String(input));
    else if (input instanceof Request && inSite(input.url) !== input.url) input = new Request(inSite(input.url), input);
    return realFetch.call(this, input, options);
  };
  const realOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    return realOpen.call(this, method, inSite(String(url)), ...rest);
  };

  // Same as fromGateway() in src/lib/url.ts. `init.base` is where this site's files come
  // from: its normal gateway folder, or a signed preview folder.
  function toBiggle(href) {
    if (href.startsWith(init.base)) return `biggle://${init.host}/${href.slice(init.base.length)}`;
    if (!href.startsWith(sitePrefix)) return null;
    const rest = href.slice(sitePrefix.length);
    const i = rest.search(/[/?#]/);
    const name = i === -1 ? rest : rest.slice(0, i);
    let tail = i === -1 ? '/' : rest.slice(i);
    if (!tail.startsWith('/')) tail = '/' + tail;
    return `biggle://${name.endsWith('.b') ? name : `${name}.biggle`}${tail}`;
  }

  function go(href, newTab = false, background = false) {
    href = String(href).trim();
    if (/^biggle:\/\//i.test(href)) return post({ type: 'navigate', url: href, newTab, background });
    let abs;
    try {
      abs = new URL(inSite(href), document.baseURI).href;
    } catch {
      return;
    }
    const biggle = toBiggle(abs);
    if (biggle) post({ type: 'navigate', url: biggle, newTab, background });
    else if (/^(https?|mailto|tel):/i.test(abs)) post({ type: 'external', url: abs });
  }

  function scrollToHash(hash) {
    const id = decodeURIComponent(hash.replace(/^#/, ''));
    const el = id && (document.getElementById(id) || document.getElementsByName(id)[0]);
    if (el) el.scrollIntoView();
    else if (!id || id.toLowerCase() === 'top') scrollTo(0, 0);
  }

  // --- Asking the browser for things: storage, the site directory ---

  let nextCall = 0;
  const pending = new Map();

  function call(method, ...args) {
    return new Promise((resolve, reject) => {
      const id = ++nextCall;
      pending.set(id, { resolve, reject });
      post({ type: 'call', id, method, args });
    });
  }

  // For the Bigglenet tags (page-widgets.js, in the same closure, out of the page's reach).
  const pushes = new Set();
  __kit.call = call;
  __kit.post = post;
  __kit.init = init;
  __kit.user = () => user;
  __kit.onPush = (fn) => pushes.add(fn);

  // biggle.storage: kept by the browser, one store per site.
  const storage = Object.freeze({
    async get(key) {
      const json = await call('storage.get', String(key));
      return json === undefined ? undefined : JSON.parse(json);
    },
    async set(key, value) {
      const json = JSON.stringify(value);
      if (json === undefined) throw new TypeError('biggle.storage can only store JSON values');
      await call('storage.set', String(key), json);
    },
    remove: (key) => call('storage.remove', String(key)).then(() => {}),
    keys: () => call('storage.keys'),
    clear: () => call('storage.clear').then(() => {}),
  });

  // --- localStorage, sessionStorage and cookies ---
  // Pages run sandboxed, with no storage of their own, which breaks lots of sites and games.
  // These stand-ins keep it per site: localStorage is saved by the browser as it changes,
  // sessionStorage and cookies last for the visit.

  function standInStorage(initial, onChange) {
    const data = new Map(Object.entries(initial || {}));
    const changed = () => onChange && onChange(data);
    const api = {
      get length() {
        return data.size;
      },
      key: (i) => [...data.keys()][i] ?? null,
      getItem: (k) => (data.has(String(k)) ? data.get(String(k)) : null),
      setItem: (k, v) => {
        data.set(String(k), String(v));
        changed();
      },
      removeItem: (k) => {
        data.delete(String(k));
        changed();
      },
      clear: () => {
        data.clear();
        changed();
      },
    };
    // Also allow localStorage.foo = "bar" and Object.keys(localStorage), like the real thing.
    return new Proxy(api, {
      get: (t, p) => (p in t ? t[p] : typeof p === 'string' && data.has(p) ? data.get(p) : undefined),
      set: (t, p, v) => {
        if (p in t) return false;
        data.set(String(p), String(v));
        changed();
        return true;
      },
      deleteProperty: (t, p) => {
        data.delete(String(p));
        changed();
        return true;
      },
      has: (t, p) => p in t || data.has(p),
      ownKeys: () => [...data.keys()],
      getOwnPropertyDescriptor: (t, p) =>
        data.has(p) ? { value: data.get(p), writable: true, enumerable: true, configurable: true } : undefined,
    });
  }

  const works = (name) => {
    try {
      return window[name].length >= 0;
    } catch {
      return false;
    }
  };
  let saveTimer = 0;
  let unsaved = null;
  const saveLocal = () => {
    clearTimeout(saveTimer);
    if (unsaved) post({ type: 'local', entries: Object.fromEntries(unsaved) });
    unsaved = null;
  };
  if (!works('localStorage')) {
    const local = standInStorage(init.local, (data) => {
      unsaved = data;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveLocal, 250);
    });
    Object.defineProperty(window, 'localStorage', { configurable: true, enumerable: true, value: local });
    addEventListener('pagehide', saveLocal);
  }
  if (!works('sessionStorage')) {
    Object.defineProperty(window, 'sessionStorage', { configurable: true, enumerable: true, value: standInStorage({}) });
  }
  try {
    void document.cookie;
  } catch {
    const jar = new Map();
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
      set: (value) => {
        const [pair] = String(value).split(';');
        const i = pair.indexOf('=');
        if (i < 0) return;
        const key = pair.slice(0, i).trim();
        if (/;\s*(max-age=0|expires=[^;]*1970)/i.test(value)) jar.delete(key);
        else jar.set(key, pair.slice(i + 1).trim());
      },
    });
  }

  // --- Biggle tags ---

  const userElements = new Set();
  const renderUserElements = () => userElements.forEach((el) => el.render());

  class UserElement extends HTMLElement {
    connectedCallback() {
      userElements.add(this);
      // While the parser is still adding children, wait for DOMContentLoaded.
      if (document.readyState !== 'loading') this.render();
    }
    disconnectedCallback() {
      userElements.delete(this);
    }
  }
  customElements.define('biggle-me', class extends UserElement {
    render() {
      this.textContent = user ? user.username : 'guest';
    }
  });
  customElements.define('biggle-signed-in', class extends UserElement {
    render() {
      this.hidden = !user;
    }
  });
  customElements.define('biggle-signed-out', class extends UserElement {
    render() {
      this.hidden = !!user;
    }
  });

  // How many visits this site has had (one per person per day), shown by <biggle-visits>:
  // kind="visits" (the default), "visitors" (different people), "today" or "week".
  let visitCounts = null;
  const getVisits = () => (visitCounts ??= call('visits').catch((e) => ((visitCounts = null), Promise.reject(e))));
  customElements.define('biggle-visits', class extends HTMLElement {
    connectedCallback() {
      const kind = ['visits', 'visitors', 'today', 'week'].includes(this.getAttribute('kind')) ? this.getAttribute('kind') : 'visits';
      getVisits().then(
        (counts) => (this.textContent = Number(counts?.[kind] ?? 0).toLocaleString()),
        () => {},
      );
    }
  });

  // <biggle-guestbook>: notes visitors leave on this site. Signing opens a box in the browser
  // itself, so a page can't sign anything for you. Style it with ::part(note), ::part(author),
  // ::part(date), ::part(body), ::part(button) and ::part(title); it picks up the page's --accent.
  const GUESTBOOK_CSS = `
:host{display:block;margin:24px 0}
.head{display:flex;align-items:center;gap:12px;margin-bottom:14px}
h2{flex:1;margin:0;font-size:1.3em}
.total{font-weight:400;opacity:.6;font-size:.8em}
button{font:inherit;cursor:pointer}
.sign{padding:.55em 1.1em;border:0;border-radius:999px;background:var(--accent,#2563eb);color:#fff;font-weight:700}
ol{list-style:none;margin:0;padding:0;display:grid;gap:10px}
li{padding:12px 14px;border-radius:14px;background:color-mix(in srgb,currentColor 5%,transparent);border:1px solid color-mix(in srgb,currentColor 12%,transparent)}
.meta{display:flex;align-items:baseline;gap:8px;margin-bottom:3px;font-size:.85em}
.author{font-weight:700}
.date{opacity:.6}
.remove{margin-left:auto;padding:0 4px;border:0;background:none;color:inherit;opacity:.5;font-size:1.1em;line-height:1}
.remove:hover{opacity:1}
.body{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
.empty{margin:0;opacity:.7}
.more{margin-top:12px;padding:.4em 1em;border:1px solid color-mix(in srgb,currentColor 25%,transparent);border-radius:999px;background:none;color:inherit}
.error{margin:8px 0 0;color:#d93025;font-size:.9em}
`;
  customElements.define('biggle-guestbook', class extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return;
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>${GUESTBOOK_CSS}</style>
<div class="head"><h2 part="title"><span class="title"></span> <span class="total"></span></h2><button class="sign" part="button">Sign the guestbook</button></div>
<ol></ol><p class="empty" hidden>Nobody has signed it yet. Be the first!</p>
<button class="more" part="button" hidden>Show older notes</button><p class="error" role="alert" hidden></p>`;
      const $ = (sel) => root.querySelector(sel);
      $('.title').textContent = this.getAttribute('heading') || 'Guestbook';
      const list = $('ol');
      let total = 0;
      let oldest = null;
      const showError = (e) => {
        $('.error').textContent = e?.message || String(e);
        $('.error').hidden = false;
      };
      const update = () => {
        $('.total').textContent = total ? `· ${total.toLocaleString()}` : '';
        $('.empty').hidden = list.children.length > 0;
      };
      const noteEl = (n) => {
        const li = document.createElement('li');
        li.setAttribute('part', 'note');
        const meta = document.createElement('div');
        meta.className = 'meta';
        const author = document.createElement('span');
        author.className = 'author';
        author.setAttribute('part', 'author');
        author.textContent = n.author;
        const date = document.createElement('time');
        date.className = 'date';
        date.setAttribute('part', 'date');
        const d = new Date(n.at * 1000);
        date.dateTime = d.toISOString();
        date.textContent = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
        meta.append(author, date);
        if (n.canDelete) {
          const remove = document.createElement('button');
          remove.className = 'remove';
          remove.title = 'Take this note down';
          remove.setAttribute('aria-label', 'Take this note down');
          remove.textContent = '×';
          remove.onclick = () =>
            call('guestbook.delete', n.id).then(() => {
              li.remove();
              total = Math.max(0, total - 1);
              update();
            }, showError);
          meta.append(remove);
        }
        const body = document.createElement('p');
        body.className = 'body';
        body.setAttribute('part', 'body');
        body.textContent = n.body;
        li.append(meta, body);
        return li;
      };
      const load = () =>
        call('guestbook.list', oldest).then((r) => {
          for (const n of r.notes) list.append(noteEl(n));
          if (r.notes.length) oldest = r.notes[r.notes.length - 1].id;
          total = r.total;
          $('.more').hidden = !r.more;
          update();
        }, showError);
      $('.sign').onclick = () =>
        call('guestbook.sign').then((n) => {
          if (!n) return;
          list.prepend(noteEl(n));
          total++;
          update();
        }, showError);
      $('.more').onclick = load;
      load();
    }
  });

  // --- Sound: tell the browser when the page makes some (the speaker on its tab), and mute it ---

  let muted = false;
  const contexts = new Set();
  const media = () => [...document.querySelectorAll('audio, video')];
  let audible = false;
  const checkAudio = () => {
    const now = media().some((m) => !m.paused && !m.muted && m.volume > 0) || [...contexts].some((c) => c.state === 'running' && c.__biggleSound);
    if (now !== audible) post({ type: 'audio', audible: (audible = now) });
  };
  addEventListener('play', checkAudio, true);
  addEventListener('pause', checkAudio, true);
  addEventListener('ended', checkAudio, true);
  addEventListener('volumechange', checkAudio, true);
  addEventListener(
    'play',
    (e) => {
      if (muted && e.target instanceof HTMLMediaElement) e.target.muted = true;
    },
    true,
  );
  for (const name of ['AudioContext', 'webkitAudioContext']) {
    const Real = window[name];
    if (!Real) continue;
    window[name] = class extends Real {
      constructor(...args) {
        super(...args);
        contexts.add(this);
        this.addEventListener('statechange', checkAudio);
        if (muted) this.suspend().catch(() => {});
      }
      createBufferSource(...args) {
        this.__biggleSound = true;
        setTimeout(checkAudio);
        return super.createBufferSource(...args);
      }
      createOscillator(...args) {
        this.__biggleSound = true;
        setTimeout(checkAudio);
        return super.createOscillator(...args);
      }
    };
  }
  function setMuted(on) {
    muted = on;
    for (const m of media()) m.muted = on;
    for (const c of contexts) (on ? c.suspend() : c.resume()).catch(() => {});
    checkAudio();
  }

  // --- Dark mode, for pages that don't have one ---

  let darkStyle = null;
  function setDark(on) {
    if (on && !darkStyle) {
      darkStyle = document.createElement('style');
      darkStyle.textContent =
        'html{filter:invert(1) hue-rotate(180deg)!important;background:#fff!important}' +
        'img,video,picture,canvas,iframe,svg image,[style*="background-image"]{filter:invert(1) hue-rotate(180deg)!important}';
      document.documentElement.append(darkStyle);
    } else if (!on && darkStyle) {
      darkStyle.remove();
      darkStyle = null;
    }
  }
  if (init.dark) setDark(true);

  // --- The performance overlay: frames per second, and memory used ---

  let fpsTimer = 0;
  function setFps(on) {
    clearInterval(fpsTimer);
    if (!on) return;
    let frames = 0;
    let at = performance.now();
    const count = () => {
      frames++;
      if (fpsTimer) requestAnimationFrame(count);
    };
    fpsTimer = setInterval(() => {
      const now = performance.now();
      post({ type: 'fps', fps: (frames * 1000) / (now - at), memory: performance.memory ? performance.memory.usedJSHeapSize : null });
      frames = 0;
      at = now;
    }, 1000);
    requestAnimationFrame(count);
  }

  /** The browser's toolbar buttons for this page. */
  function command(msg) {
    if (msg.action === 'mute') setMuted(!!msg.on);
    else if (msg.action === 'dark') setDark(!!msg.on);
    else if (msg.action === 'fps') setFps(!!msg.on);
    else if (msg.action === 'print') print();
    else if (msg.action === 'reader') post({ type: 'reader', id: msg.id, result: readerExtract() });
    else if (msg.action === 'pip') {
      const v = media()
        .filter((m) => m instanceof HTMLVideoElement && m.readyState > 0)
        .sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
      const done = (ok) => post({ type: 'pip', id: msg.id, ok });
      if (!v || !document.pictureInPictureEnabled) return done(false);
      (document.pictureInPictureElement === v ? document.exitPictureInPicture() : v.requestPictureInPicture()).then(
        () => done(true),
        () => done(false),
      );
    }
  }

  // --- Messages from the browser ---

  addEventListener('message', (e) => {
    if (e.source !== parent) return;
    const msg = e.data;
    if (!msg || msg.biggle !== 1) return;
    if (msg.type === 'result') {
      const call = pending.get(msg.id);
      if (!call) return;
      pending.delete(msg.id);
      if (msg.error) call.reject(new Error(msg.error));
      else call.resolve(msg.value);
    } else if (msg.type === 'user') {
      user = msg.user;
      renderUserElements();
      dispatchEvent(new CustomEvent('biggle:user', { detail: user && { ...user } }));
    } else if (msg.type === 'find') {
      // The browser's find bar (⌘F).
      const result = typeof msg.text === 'string' ? finder.find(msg.text, msg.dir) : { count: 0, index: -1 };
      post({ type: 'found', id: msg.id, ...result });
    } else if (msg.type === 'find-clear') {
      finder.clear();
    } else if (msg.type === 'command') {
      command(msg);
    } else if (msg.type === 'room') {
      for (const fn of pushes) fn(msg);
    }
  });
  const finder = createFinder(() => document.body);

  // --- Links, forms and pop-ups go through the browser ---

  function onClick(e) {
    if (e.defaultPrevented) return;
    if (e.type === 'click' ? e.button !== 0 : e.button !== 1) return;
    const a = e.composedPath().find(
      (n) => n instanceof Element && (n.localName === 'a' || n.localName === 'area') && n.hasAttribute('href'),
    );
    if (!a || a.hasAttribute('download')) return;
    const raw = a.getAttribute('href').trim();
    if (/^javascript:/i.test(raw)) return;
    e.preventDefault();
    if (raw.startsWith('#')) {
      scrollToHash(raw);
      post({ type: 'hash', hash: raw === '#' ? '' : raw });
      return;
    }
    const blank = a.getAttribute('target') === '_blank';
    const background = e.button === 1 || e.metaKey || e.ctrlKey;
    go(raw, blank || background, background);
  }
  addEventListener('click', onClick);
  addEventListener('auxclick', onClick);

  addEventListener('submit', (e) => {
    if (e.defaultPrevented) return;
    const form = e.target;
    const submitter = e.submitter;
    const method = (submitter?.getAttribute('formmethod') || form.getAttribute('method') || 'get').toLowerCase();
    if (method === 'dialog') return;
    e.preventDefault();
    if (method !== 'get') {
      console.warn('Biggle only supports GET forms. Handle POST forms with JavaScript.');
      return;
    }
    const action = submitter?.getAttribute('formaction') || form.getAttribute('action') || '';
    const url = new URL(action, document.baseURI);
    url.search = new URLSearchParams(new FormData(form, submitter)).toString();
    url.hash = '';
    go(url.href, (submitter?.getAttribute('formtarget') || form.getAttribute('target')) === '_blank');
  });

  window.open = (href) => {
    if (href) go(href, true);
    return null;
  };

  // --- Browser shortcuts and back/forward still work while the page has focus ---

  // By the same names the browser uses (src/lib/keys.ts). History is ⌘Y on a Mac, Ctrl+H elsewhere.
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  const SHORTCUTS = new Set([
    't', 'shift+t', 'w', 'l', 'r', '[', ']', '1', '2', '3', '4', '5', '6', '7', '8', '9',
    'd', 'shift+b', 'f', 'g', 'shift+g', '=', '-', '0', mac ? 'y' : 'h', mac ? 'shift+j' : 'j',
    'k', 'shift+a', 'shift+n', 'p', 'shift+s', 'shift+r', 'shift+f',
  ]);
  function shortcutName(e) {
    let key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (key === '+') key = '=';
    if (key === '_') key = '-';
    if (key === '=' || key === '-') return key;
    return e.shiftKey ? `shift+${key}` : key;
  }

  const editing = (el) => el instanceof Element && el.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])');

  addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'F5') {
        e.preventDefault();
        post({ type: 'key', key: 'r' });
        return;
      }
      if ((e.altKey || e.metaKey) && !e.ctrlKey && !e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        if (editing(e.target)) return;
        e.preventDefault();
        post({ type: 'nav', dir: e.key === 'ArrowLeft' ? 'back' : 'forward' });
        return;
      }
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const key = shortcutName(e);
      if (!SHORTCUTS.has(key)) return;
      e.preventDefault();
      post({ type: 'key', key });
    },
    true,
  );

  // Right-click on a link, a picture or selected text: the browser's own menu (open in a new
  // tab, copy…). In the desktop app there's no other menu (the webview's own would offer to
  // reload the whole browser), except in text fields.
  addEventListener('contextmenu', (e) => {
    if (e.defaultPrevented || editing(e.target)) return;
    const path = e.composedPath();
    const a = path.find((n) => n instanceof Element && n.localName === 'a' && n.hasAttribute('href'));
    const img = path.find((n) => n instanceof HTMLImageElement);
    const selection = String(getSelection() || '').trim();
    let link = null;
    if (a) {
      try {
        const abs = new URL(inSite(a.getAttribute('href')), document.baseURI).href;
        link = /^biggle:\/\//i.test(abs) ? abs : toBiggle(abs) || (/^(https?|mailto):/i.test(abs) ? abs : null);
      } catch {}
    }
    if (link || img || selection) {
      e.preventDefault();
      post({ type: 'context', x: e.clientX, y: e.clientY, link, text: a ? a.textContent.trim().slice(0, 200) : '', image: img ? img.currentSrc || img.src : null, selection: selection.slice(0, 500) });
    } else if (init.app) {
      e.preventDefault();
    }
  });

  // Where a link goes, while the mouse is over it (shown at the bottom of the browser).
  let hovered = '';
  addEventListener('mouseover', (e) => {
    const a = e.composedPath().find((n) => n instanceof Element && n.localName === 'a' && n.hasAttribute('href'));
    let url = '';
    if (a) {
      try {
        const abs = new URL(inSite(a.getAttribute('href')), document.baseURI).href;
        url = toBiggle(abs) || abs;
      } catch {}
    }
    if (url !== hovered) post({ type: 'hover', url: (hovered = url) });
  });

  // Ctrl or ⌘ and the wheel, or a pinch on a trackpad: zoom, the browser's way.
  addEventListener(
    'wheel',
    (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      if (Math.abs(e.deltaY) < 4) return;
      post({ type: 'zoom', by: e.deltaY < 0 ? 1 : -1 });
    },
    { passive: false },
  );

  // Phones: swipe in from the left edge to go back, from the right to go forward, and pull down
  // at the top to reload.
  let touch = null;
  addEventListener(
    'touchstart',
    (e) => {
      const t = e.touches[0];
      touch = e.touches.length === 1 ? { x: t.clientX, y: t.clientY, top: scrollY <= 0 } : null;
    },
    { passive: true },
  );
  addEventListener(
    'touchend',
    (e) => {
      const t = e.changedTouches[0];
      if (!touch || !t) return;
      const dx = t.clientX - touch.x;
      const dy = t.clientY - touch.y;
      if (Math.abs(dx) > 90 && Math.abs(dy) < 60) {
        if (dx > 0 && touch.x < 24) post({ type: 'nav', dir: 'back' });
        else if (dx < 0 && touch.x > innerWidth - 24) post({ type: 'nav', dir: 'forward' });
      } else if (touch.top && dy > 120 && Math.abs(dx) < 60 && scrollY <= 0) {
        post({ type: 'nav', dir: 'reload' });
      }
      touch = null;
    },
    { passive: true },
  );

  // Mouse back/forward buttons.
  addEventListener('mouseup', (e) => {
    if (e.button !== 3 && e.button !== 4) return;
    e.preventDefault();
    post({ type: 'nav', dir: e.button === 3 ? 'back' : 'forward' });
  });
  addEventListener('mousedown', (e) => {
    if (e.button === 3 || e.button === 4) e.preventDefault();
  });

  // --- Title and icon ---

  let lastMeta = '';
  function sendMeta() {
    const icon = document.querySelector('link[rel~="icon" i][href]');
    const meta = { type: 'meta', title: document.title, icon: icon ? icon.href : null };
    const key = JSON.stringify(meta);
    if (key !== lastMeta) {
      lastMeta = key;
      post(meta);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    renderUserElements();
    sendMeta();
    new MutationObserver(sendMeta).observe(document.head, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
    if (init.hash) scrollToHash(init.hash);
  });
  addEventListener('load', () => {
    if (init.hash) scrollToHash(init.hash);
  });

  Object.defineProperty(window, 'biggle', {
    enumerable: true,
    value: Object.freeze({
      url: init.url,
      site: init.site,
      params: new URLSearchParams(init.search),
      me: async () => user && { ...user },
      go: (href) => go(href),
      sites: () => call('sites'),
      copy: (text) => call('copy', String(text)).then(() => {}),
      // A token this site's own server can check with the Bigglenet (GET /api/identity/verify)
      // to know who is signed in. null when nobody is.
      idToken: () => call('idToken'),
      // This site's visit counts: { visits, visitors, today, week }.
      visits: () => getVisits().then((c) => ({ ...c })),
      storage,
      // A live room with everyone else on this site in it (multiplayer games, chat rooms).
      room: (name) => __kit.room(String(name)),
      // Game leaderboards: each person's best score on each board.
      scores: Object.freeze({
        submit: (board, score, opts = {}) =>
          call('scores.submit', String(board), Number(score), { order: opts.order === 'asc' ? 'asc' : 'desc' }).then((r) => {
            // <biggle-leaderboard>s on the page catch up straight away.
            dispatchEvent(new CustomEvent('biggle:scores', { detail: { board: String(board) } }));
            return r;
          }),
        top: (board, opts = {}) => call('scores.top', String(board), { order: opts.order === 'asc' ? 'asc' : 'desc', limit: opts.limit }),
      }),
      // Give the visitor an achievement (shown on their profile). Resolves { new }.
      achieve: (key, title, description) => call('achieve', String(key), String(title ?? ''), description == null ? null : String(description)),
      // How many people are on the Bigglenet right now.
      online: () => call('online').then((r) => r.online),
    }),
  });
})();
