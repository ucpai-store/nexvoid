// NEXVO Service Worker v31 - Fix "Loading chunk XXXX failed" loop
// Root cause: v30 navigation fallback `caches.match('/')` served STALE HTML
// that referenced OLD chunk hashes → chunk 404 → infinite error loop.
// Fix: (1) NO stale-HTML navigation fallback. (2) On _next/static 404, wipe
// all caches + force-reload clients (new deploy happened, app is stale).
const CACHE_NAME = 'nexvo-v31';

const PRECACHE_URLS = [
  '/manifest.webmanifest',
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/icon-maskable-512x512.png',
  '/apple-touch-icon.png',
  '/favicon.ico',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch((err) => {
        console.warn('[SW v31] Pre-cache failed:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

// Tell every controlled client to hard-reload (cache-busted).
async function forceClientsReload() {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) {
    try {
      await client.navigate(client.url);
    } catch (e) {
      client.postMessage({ type: 'NEXVO_STALE_APP_RELOAD' });
    }
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  // Navigation requests — network first. NO stale-HTML fallback (v30 bug).
  // Only fall back to cache if it's the EXACT same URL (genuine offline case).
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then((response) => {
        if (response && response.ok && response.status < 500) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => {});
        }
        return response;
      }).catch(() => caches.match(request).then((cached) => cached || Response.error()))
    );
    return;
  }

  // PWA critical assets — cache first
  if (url.pathname.match(/\/icon-|manifest\.webmanifest|apple-touch|favicon|nexvo-logo|sw\.js/)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // _next/static/ chunks — network first + 404 recovery.
  // A 404 here means a new deploy changed chunk hashes → wipe caches + reload.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        }
        if (response.status === 404) {
          console.warn('[SW v31] Stale chunk 404 — purging + reloading:', url.pathname);
          caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n)))).then(() => {
            forceClientsReload();
          });
        }
        return response;
      }).catch(() => caches.match(request).then((cached) => cached || Response.error()))
    );
    return;
  }

  // API requests — network only
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Everything else — network first
  event.respondWith(
    fetch(request).then((response) => {
      if (response && response.ok) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
      }
      return response;
    }).catch(() => caches.match(request).then((cached) => cached || Response.error()))
  );
});

// Manual purge trigger (from page if needed)
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'NEXVO_PURGE_AND_RELOAD') {
    caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n)))).then(() => {
      forceClientsReload();
    });
  }
  if (data.type === 'NEXVO_SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ──────────── Push Notification Handlers ────────────
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received:', event);

  let data = {
    title: 'NEXVO',
    body: 'Anda memiliki notifikasi baru',
    data: {}
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    } catch (e) {
      data.body = event.data.text() || data.body;
    }
  }

  const options = {
    body: data.body,
    icon: '/icon-192x192.png',
    badge: '/icon-72x72.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.data?.url || '/',
      ...data.data
    },
    actions: [
      { action: 'open', title: 'Buka' },
      { action: 'close', title: 'Tutup' }
    ],
    tag: 'nexvo-notification-' + Date.now(),
    requireInteraction: false,
    silent: false
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification click:', event);

  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
