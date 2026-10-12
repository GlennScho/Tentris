const CACHE_PREFIX = 'tentris-pwa-';
const CACHE_NAME = `${CACHE_PREFIX}2026-10-12-v3`;

const REQUIRED_ASSETS = [
  './',
  './index.html'
];

const OPTIONAL_ASSETS = [
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './favicon-32.png'
];

async function cacheAsset(cache, path) {
  try {
    const request = new Request(path, { cache: 'reload' });
    const response = await fetch(request);

    if (response.ok) {
      await cache.put(request, response);
    }
  } catch (error) {
    // A missing optional file should not prevent the app from installing.
  }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    await Promise.all(
      REQUIRED_ASSETS.map(path => cacheAsset(cache, path))
    );

    await Promise.allSettled(
      OPTIONAL_ASSETS.map(path => cacheAsset(cache, path))
    );

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();

    await Promise.all(
      keys
        .filter(
          key =>
            key.startsWith(CACHE_PREFIX) &&
            key !== CACHE_NAME
        )
        .map(key => caches.delete(key))
    );

    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  // Pages: try the latest online version first,
  // with the cached game as an offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);

        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put('./index.html', response.clone());
        }

        return response;
      } catch (error) {
        return (
          await caches.match('./index.html') ||
          await caches.match('./') ||
          Response.error()
        );
      }
    })());

    return;
  }

  // Other files: show the cached version immediately,
  // then refresh it from the network.
  event.respondWith((async () => {
    const cached = await caches.match(request);

    const networkPromise = fetch(request)
      .then(async response => {
        if (response?.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }

        return response;
      })
      .catch(() => null);

    if (cached) {
      event.waitUntil(networkPromise);
      return cached;
    }

    return (await networkPromise) || Response.error();
  })());
});
