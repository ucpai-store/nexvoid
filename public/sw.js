// NEXVO Service Worker v33 — SELF-DESTRUCT
// SW has caused 3 different production bugs (v30/v31/v32). Removing it entirely.
// This SW unregisters itself + wipes all caches. Browser returns to normal HTTP.
// File kept so old SWs can update to v33 and self-destruct.

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      self.skipWaiting(),
      caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n)))),
    ])
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.registration.unregister(),
      caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n)))),
      self.clients.claim(),
    ]).then(() => {
      console.log('[SW v33] Unregistered + caches wiped. Browser back to normal HTTP.');
    })
  );
});

self.addEventListener('fetch', () => {
  // SW is dead — let browser handle all requests normally.
  return;
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'NEXVO_PURGE') {
    caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n))));
  }
});

// Push notifications still work (no caching involved)
self.addEventListener('push', (event) => {
  let data = { title: 'NEXVO', body: 'Notifikasi baru', data: {} };
  if (event.data) {
    try { data = { ...data, ...event.data.json() }; }
    catch { data.body = event.data.text() || data.body; }
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192x192.png',
      badge: '/icon-72x72.png',
      vibrate: [100, 50, 100],
      data: { url: data.data?.url || '/', ...data.data },
      tag: 'nexvo-' + Date.now(),
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'close') return;
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes(self.location.origin) && 'focus' in c) {
          c.navigate(targetUrl);
          return c.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
