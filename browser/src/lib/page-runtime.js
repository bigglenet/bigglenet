// Runs inside every BHTML page, before the page's own scripts.
// The browser sets window.__BIGGLE_INIT__ = { url, site, base, server, search, hash, user, local, app } right before this.
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
    return `biggle://${name}.biggle${tail}`;
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
    }
  });

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
      if (!/^([twlr[\]1-9])$/i.test(e.key)) return;
      e.preventDefault();
      post({ type: 'key', key: e.key });
    },
    true,
  );

  // In the desktop app, no right-click menu of the webview's own (its Refresh would reload the
  // whole browser) unless the page shows its own or it's a text field.
  if (init.app) {
    addEventListener('contextmenu', (e) => {
      if (!e.defaultPrevented && !editing(e.target)) e.preventDefault();
    });
  }

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
      storage,
    }),
  });
})();
