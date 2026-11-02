/* WA Scoring 0.6.4.3 — piloto Firebase, sin alterar IndexedDB */
const CACHE = 'wa-scoring-shell-v20';
const FILES = [
  './', './index.html', './app.css?v=0.6.4.3', './app.js?v=0.6.4.3',
  './cloud.js?v=0.6.4.3', './eliminations.js?v=0.6.4.3', './qr.js?v=0.6.4.3', './firebase-config.js?v=0.6.4.3',
  './manifest.webmanifest', './icon-192.png', './icon-512.png'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('wa-scoring-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request).then(response => {
      if (response.ok) {
        const savedResponse = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, savedResponse)).catch(() => {});
      }
      return response;
    }).catch(async () => {
      const saved = await caches.match(event.request);
      if (saved) return saved;
      if (event.request.mode === 'navigate') {
        return caches.match('./index.html');
      }
      return Response.error();
    })
  );
});
