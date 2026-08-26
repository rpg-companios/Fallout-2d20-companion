// Compatibility worker for clients that still have /sw.js registered.
// The app now uses /service-worker.js. Retire this duplicate registration
// instead of allowing it to serve stale HTML for missing JavaScript bundles.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.registration.unregister(),
      caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))),
    ]).then(() => self.clients.claim())
  );
});
