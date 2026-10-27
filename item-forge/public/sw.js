// Кузница предметов — минимальный service worker (offline-first для статики).
// Без зависимостей: precache корня + stale-while-revalidate для same-origin GET.
// Справочники сеттинга уже в бандле (сборка из репозитория) — офлайн-режим
// переживает пропадание сети, но НЕ обновляет каталоги: обновление = пересборка
// и задеплой (наш принцип «синхрон на сборке», а не тихий устаревший слепок).
const CACHE = 'item-forge-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(['./']))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(request, { ignoreSearch: request.mode === 'navigate' });
      const fetching = fetch(request)
        .then((res) => {
          if (res.ok) cache.put(request, res.clone());
          return res;
        })
        .catch(() => hit);
      return hit ?? fetching;
    }),
  );
});
