// NEXVO Service Worker v31
// - Fixes "Loading chunk XXXX failed" by wiping caches + forcing reload on _next/static 404
// - Removes stale `caches.match('/')` navigation fallback (root cause of stale HTML referencing old chunk hashes)
// - Keeps network-first for _next/static (good for normal case) + 404-aware recovery
const CACHE_NAME = 'nexvo-v31';

// Core PWA assets to pre-cache for installability
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
        console.warn('[SW v31] Pre-cache failed for some URLs:', err);
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

// Tell every controlled client to do a hard, cache-busted reload.
// Used when we detect the app is running stale chunks (a _next/static 404).
async function forceClientsReload() {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) {
    try {
      await client.navigate(client.url);
    } catch (e) {
      // navigate() may not be supported — fall back to posting a message
      // that the page can act on.
    }
    client.postMessage({ type: 'NEXVO_STALE_APP_RELOAD' });
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  // Navigation requests — network first. NO stale-HTML fallback.
  // (v30 used `caches.match('/')` on failure, which served OLD HTML
  //  referencing OLD chunk hashes → "Loading chunk XXXX failed" loop.)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then((response) => {
        // Cache a fresh copy of the navigated document so a true offline
        // case (network down) has something to show — but only if the
        // response is OK and NOT a server error.
        if (response && response.ok && response.status < 500) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => {});
        }
        return response;
      }).catch(() => {
        // Genuine offline only. Use the cached navigation response for THIS
        // exact URL if we have one — never fall back to '/'.
        return caches.match(request).then((cached) => cached || Response.error());
      })
    );
    return;
  }

  // PWA critical assets (manifest, icons, sw) — cache first for installability
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

  // Next.js static chunks — NETWORK FIRST with 404-aware recovery.
  // A 404 here means the chunk file no longer exists on the server, i.e.
  // a new deploy changed the chunk hashes. Recovery: wipe ALL caches (so
  // no stale chunks/scripts linger) and force every client to reload.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        }
        if (response.status === 404) {
          console.warn('[SW v31] Stale chunk 404 — purging caches + reloading clients:', url.pathname);
          // Wipe everything; a new deploy happened.
          caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n)))).then(() => {
            forceClientsReload();
          });
        }
        return response;
      }).catch(() => caches.match(request).then((cached) => cached || Response.error()))
    );
    return;
  }

  // API requests — network only (no caching)
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Everything else — network first, cache fallback
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

// Allow pages to manually request a cache purge + reload (used by the
// global chunk-error catcher as a belt-and-braces recovery path).
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'NEXVO_PURGE_AND_RELOAD') {
    console.warn('[SW v31] Manual purge + reload requested.');
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
      // If there's already an open window, focus it and navigate
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      // Otherwise open a new window
      return self.clients.openWindow(targetUrl);
    })
  );
});
