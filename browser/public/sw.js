// Keeps the Biggle browser itself available offline. Sites (/site/), the API (/api/) and
// /version.json always go to the network.
const CACHE = 'bigglenet-shell-v3';
const SHELL = ['/', '/manifest.webmanifest', '/favicon.png', '/mark.png', '/wordmark.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/site/')) return;
  if (url.pathname === '/version.json') return;

  if (request.mode === 'navigate') {
    // The saved copy straight away, so opening the app never waits on the network; a fresh copy
    // is saved alongside for next time. New versions are offered by the app itself
    // (updates.svelte.ts), which clears the saved copy before reloading.
    const fresh = fetch(request).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put('/', copy));
      }
      return res;
    });
    event.waitUntil(fresh.catch(() => {}));
    event.respondWith(caches.match('/').then((hit) => hit || fresh));
    return;
  }

  // Build files have hashed names, so a cached copy is always right.
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return res;
        }),
    ),
  );
});

// A push while Bigglenet is closed (server/src/push.ts): a message, a call or a notification.
self.addEventListener('push', (event) => {
  let m = {};
  try {
    m = event.data ? event.data.json() : {};
  } catch {}
  event.waitUntil(
    self.registration.showNotification(m.title || 'Bigglenet', {
      body: m.body || '',
      tag: m.tag,
      icon: '/mark.png',
      badge: '/favicon.png',
      data: { chatId: m.chatId, href: m.href },
    }),
  );
});

// A notification tapped (see src/lib/notify.svelte.ts, and pushes above): open Bigglenet at that
// chat or page.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { chatId, href } = event.notification.data || {};
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows[0];
      if (!open) {
        if (typeof chatId === 'number') return self.clients.openWindow(`/?chat=${chatId}`);
        return self.clients.openWindow(href ? `/?open=${encodeURIComponent(href)}` : '/');
      }
      if (typeof chatId === 'number') open.postMessage({ type: 'open-chat', chatId });
      else if (href) open.postMessage({ type: 'open', href });
      return open.focus();
    }),
  );
});
