const CACHE_VERSION = 'listtube-pwa-v1';
const SUBSCRIBED_COVER_CACHE = 'listtube-subscribed-covers-v1';
const STATIC_ASSETS = ['/site.webmanifest', '/favicon.svg', '/'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(STATIC_ASSETS).catch(() => undefined))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  const keep = new Set([CACHE_VERSION, SUBSCRIBED_COVER_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) {
    // Cache-first for already-cached subscribed anime/manga covers (0ms poster paint on slow data/offline)
    if (req.destination === 'image' || /\.(?:png|jpe?g|webp)$/i.test(url.pathname)) {
      event.respondWith(
        caches.open(SUBSCRIBED_COVER_CACHE).then((cache) =>
          cache
            .match(req.url)
            .then((hit) => hit || cache.match(req))
            .then((cached) => {
              if (cached) return cached;
              return fetch(req).catch(() => undefined);
            })
        )
      );
    }
    return;
  }
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return;
  if (url.pathname.startsWith('/api/') || url.searchParams.has('code') || url.searchParams.has('state')) {
    return;
  }

  // Network-first for SPA HTML navigations so new Vercel deploys activate immediately
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match('/index.html').then((r) => r || caches.match('/')))
    );
    return;
  }

  // Cache-first with background refresh for hashed Vite JS/CSS bundles and icons
  if (
    url.pathname.startsWith('/assets/') ||
    /\.(?:js|css|svg|png|jpg|webp|woff2?)$/i.test(url.pathname)
  ) {
    event.respondWith(
      caches.match(req).then((hit) => {
        const net = fetch(req)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE_VERSION).then((c) => c.put(req, copy)).catch(() => {});
            }
            return res;
          })
          .catch(() => hit);
        return hit || net;
      })
    );
  }
});
