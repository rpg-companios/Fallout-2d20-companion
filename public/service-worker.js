const CACHE_NAME = 'rpg-companion-v10';
const APP_SHELL = ['/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  // Network-first for non-document resources. HTML and JavaScript are not
  // cached so a new index cannot be paired with an old or missing bundle.
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        const contentType = networkResponse.headers.get('content-type') || '';
        const isScript = event.request.destination === 'script';

        // serve -s may return index.html with HTTP 200 for a missing .js file.
        // Never pass that HTML response to the JavaScript parser.
        if (isScript && contentType.includes('text/html')) {
          return new Response('', {
            status: 503,
            statusText: 'JavaScript asset unavailable',
            headers: { 'Content-Type': 'text/plain' },
          });
        }

        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        // Кэшируем ТОЛЬКО клон, а сам ответ отдаём как есть. Здесь критично
        // взять clone() до того, как тело ответа будет прочитано (put/чтение
        // потребляет body) — иначе будет "Response body is already used".
        if (event.request.destination !== 'document' && !isScript) {
          const toCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, toCache)).catch(() => undefined);
        }
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});
