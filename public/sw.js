// PWA service worker with app-shell and runtime caching
const VERSION = 'v3';
const SHELL_CACHE = `semdiff-shell-${VERSION}`;
const RUNTIME_CACHE = `semdiff-runtime-${VERSION}`;
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await cache.addAll(APP_SHELL);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => ![SHELL_CACHE, RUNTIME_CACHE].includes(k)).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// Network-first for API, cache-first for static assets, navigation fallback to app shell
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isSameOrigin = url.origin === location.origin;

  // Navigation requests: serve index.html from cache as app shell
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
        const cached = await cache.match('/index.html');
        try {
          const fresh = await fetch(req);
          // update cache in background
          cache.put('/index.html', fresh.clone()).catch(() => {});
          return fresh;
        } catch (e) {
          return cached || new Response('Offline', { status: 503 });
        }
      })()
    );
    return;
  }

  // Future API runtime caching
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(RUNTIME_CACHE);
        try {
          const fresh = await fetch(req);
          cache.put(req, fresh.clone()).catch(() => {});
          return fresh;
        } catch (e) {
          const cached = await cache.match(req);
          return cached || new Response('Offline', { status: 503 });
        }
      })()
    );
    return;
  }

  // Static assets: cache-first
  if (isSameOrigin) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const fresh = await fetch(req);
          cache.put(req, fresh.clone()).catch(() => {});
          return fresh;
        } catch (e) {
          return cached || new Response('Offline', { status: 503 });
        }
      })()
    );
  }
});
