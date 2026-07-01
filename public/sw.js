// NEXVO Service Worker v32 — PASSIVE (no auto-reload)
// v31 had forceClientsReload() which caused infinite refresh storm.
// v32 fix: NEVER auto-reload. Just wipe caches silently on chunk 404.
// User can manually refresh / click "Try Again" — no more refresh loops.
const CACHE_NAME = 'nexvo-v32';

const PRECACHE_URLS = [
  '/manifest.webmanifest',
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/icon-maskable-512x512.png',
  '/apple-touch-icon.png',
  '/favicon.ico',
];

// One-shot flag: prevent multiple cache wipes from concurrent chunk-404s
let _purging = false;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch((err) => {
        console.warn('[SW v32] Pre-cache failed:', err);
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

// Silent cache purge — NO client reload (v31 bug fix)
function purgeCachesSilently() {
  if (_purging) return;
  _purging = true;
  caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n)))).then(() => {
    console.log('[SW v32] Caches purged (stale chunks). User can hard-refresh manually.');
    _purging = false;
  });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  // Navigation requests — network first. Cache fallback ONLY for exact URL (genuine offline).
  // NO stale-HTML fallback (v30 bug that started all this).
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

  // _next/static/ chunks — network first. On 404, silently purge caches.
  // NO force-reload (v31 bug). Page will show error boundary; user refreshes manually.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        }
        if (response.status === 404) {
          console.warn('[SW v32] Stale chunk 404 — purging caches silently:', url.pathname);
          purgeCachesSilently();
        }
        return response;
      }).catch(() => caches.match(request).then((cached) => cached || Response.error()))
    );
    return;
  }

  // API requests — network only (no cache)
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

// Manual purge trigger (from page if needed) — NO auto-reload
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'NEXVO_PURGE') {
    purgeCachesSilently();
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
