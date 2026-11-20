const CACHE_VERSION = 'ase-shell-v3';
const SHELL_URLS = ['/', '/offline.html', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith('ase-shell-') && key !== CACHE_VERSION).map((key) => caches.delete(key))
  )).then(() => self.clients.claim()));
});
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) await (await caches.open(CACHE_VERSION)).put('/', response.clone());
        return response;
      } catch {
        return (await caches.match('/')) || (await caches.match('/offline.html'));
      }
    })());
    return;
  }
  if (['script', 'style', 'image', 'font'].includes(request.destination)) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok && response.type === 'basic') await (await caches.open(CACHE_VERSION)).put(request, response.clone());
        return response;
      } catch {
        return new Response('', { status: 504, statusText: 'Offline asset unavailable' });
      }
    })());
  }
});
