// Service worker приложения.
//
// ИСТОРИЯ ДЕФЕКТА (белый экран в установленном PWA на Android):
// прежняя версия принципиально не кэшировала документы и скрипты — чтобы
// свежий index.html не спарился со старым бандлом. Фоллбэком служило
// `.catch(() => caches.match(event.request))`, но раз index.html в кэш
// никогда не попадал, caches.match возвращал undefined, а respondWith(undefined)
// обрывает навигацию — окно остаётся пустым.
// Установленное PWA стартует холодно (система усыпляет процесс при сворачивании),
// и первый сетевой запрос часто не успевает пройти: отсюда «переустановил —
// работает, свернул и вернулся — белый экран», при том что во вкладке браузера
// всё нормально.
//
// РЕШЕНИЕ: index.html кэшируется и служит фоллбэком для любых навигаций.
// Проблема «новый html + старый бандл» закрывается не отказом от кэша, а тем,
// что имена бандлов у Expo содержат хэш: старый файл просто не запрашивается.
const CACHE_NAME = 'rpg-companion-v11';
const APP_SHELL_URL = '/index.html';
const APP_SHELL = [APP_SHELL_URL, '/manifest.json'];

// Последний рубеж: показывается, только если нет ни сети, ни закэшированной
// оболочки. Пустой экран не даёт пользователю никакой информации, поэтому
// respondWith НИКОГДА не должен получить undefined.
const OFFLINE_FALLBACK_HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Positronium</title>
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#0f0f0f; color:#f0e68c; font-family:system-ui,-apple-system,sans-serif; padding:24px; }
  .box { max-width:320px; text-align:center; }
  h1 { font-size:18px; margin:0 0 12px; }
  p { font-size:14px; color:#d1d5db; margin:0 0 20px; line-height:1.5; }
  button { background:#d4af37; color:#111827; border:0; border-radius:8px;
           padding:12px 24px; font-size:15px; font-weight:700; cursor:pointer; }
</style></head>
<body><div class="box">
  <h1>Positronium</h1>
  <p>Не удалось загрузить приложение. Проверьте подключение к сети.<br><br>
     Could not load the app. Please check your connection.</p>
  <button onclick="location.reload()">Обновить / Reload</button>
</div></body></html>`;

const offlineResponse = () => new Response(OFFLINE_FALLBACK_HTML, {
  status: 200,
  headers: { 'Content-Type': 'text/html; charset=utf-8' },
});

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      // reload обходит HTTP-кэш: в оболочку должна попасть свежая версия,
      // а не то, что браузер держит с прошлого визита.
      .then((cache) => cache.addAll(APP_SHELL.map((url) => new Request(url, { cache: 'reload' }))))
      .catch(() => undefined)
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
      .then(() => self.clients.claim())
  );
});

// Навигация: сеть первой с обходом HTTP-кэша браузера (cache: 'no-cache'),
// чтобы новая сборка или правка UI в Metro доезжала сразу по обычному F5,
// а кэш вступал в дело только при реальном отсутствии сети.
const handleNavigation = async (request) => {
  try {
    const networkResponse = await fetch(new Request(request, { cache: 'no-cache' }));
    if (
      networkResponse &&
      networkResponse.status === 200 &&
      !networkResponse.headers.get('x-positronium-boot')
    ) {
      const toCache = networkResponse.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(APP_SHELL_URL, toCache)).catch(() => undefined);
    }
    return networkResponse;
  } catch (_) {
    const cache = await caches.open(CACHE_NAME);
    // Именно оболочка, а не request: у навигации может быть любой путь
    // (/settings, /?_swr=abc), а SPA всё равно обслуживается одним index.html.
    const cached = await cache.match(APP_SHELL_URL);
    return cached || offlineResponse();
  }
};

const FONT_EXT_RE = /\.(ttf|woff2?|otf)$/i;
const HASHED_ASSET_RE = /[-.][0-9a-f]{20,}\.(js|css|png|jpg|jpeg|webp|gif|svg|ico|ttf|woff2?|otf)$/i;

const isImmutableOrFontRequest = (request, requestUrl) => {
  if (request.destination === 'font') return true;
  if (FONT_EXT_RE.test(requestUrl.pathname)) return true;
  if (HASHED_ASSET_RE.test(requestUrl.pathname)) return true;
  if (requestUrl.pathname.startsWith('/assets/') && requestUrl.search) {
    try {
      const decoded = decodeURIComponent(requestUrl.search);
      if (/\.(ttf|woff2?|otf)(?:&|$)/i.test(decoded)) return true;
    } catch (_) {
      // Некорректный query — оставляем стандартную сетевую ветку.
    }
  }
  return false;
};

// Иконочные шрифты (.ttf/.woff2) и файлы сборки с контент-хэшем неизменяемы:
// отдаём их мгновенно из Cache Storage (cache-first), не гоняя мегабайты по сети
// на каждый запуск. При обновлении сборки хэш в имени файла меняется сам.
const handleImmutableAsset = async (request) => {
  const cached = await caches.match(request);
  if (cached) return cached;

  const networkResponse = await fetch(request);
  const contentType = networkResponse.headers.get('content-type') || '';
  if (request.destination === 'script' && contentType.includes('text/html')) {
    return new Response('', {
      status: 503,
      statusText: 'JavaScript asset unavailable',
      headers: { 'Content-Type': 'text/plain' },
    });
  }
  if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
    const toCache = networkResponse.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(request, toCache)).catch(() => undefined);
  }
  return networkResponse;
};

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith(handleNavigation(event.request));
    return;
  }

  if (isImmutableOrFontRequest(event.request, requestUrl)) {
    event.respondWith(
      handleImmutableAsset(event.request).catch(() => {
        if (event.request.destination === 'script') {
          return new Response('', {
            status: 503,
            statusText: 'Offline',
            headers: { 'Content-Type': 'text/plain' },
          });
        }
        return Response.error();
      })
    );
    return;
  }

  const isDevBundle =
    requestUrl.pathname.endsWith('.bundle') || requestUrl.searchParams.get('dev') === 'true';
  const isBootEndpoint =
    requestUrl.pathname === '/__boot-status' || requestUrl.pathname === '/__boot-rebuild';

  // Служебные запросы сборки и тяжёлый dev-бандл Metro не пропускаем через SW:
  // браузер качает их напрямую по HTTP без таймаутов и сериализации воркера.
  if (isBootEndpoint || isDevBundle) return;

  event.respondWith(
    // Для нехэшированных ресурсов (/version.json, /manifest.json, dev index.bundle)
    // обходим эвристический HTTP-кэш браузера через cache: 'no-cache'.
    fetch(new Request(event.request, { cache: 'no-cache' }))
      .then((networkResponse) => {
        const contentType = networkResponse.headers.get('content-type') || '';
        const isScript = event.request.destination === 'script';

        // serve -s может отдать index.html с кодом 200 вместо отсутствующего
        // .js. Такой HTML нельзя передавать парсеру JavaScript.
        if (isScript && contentType.includes('text/html')) {
          return new Response('', {
            status: 503,
            statusText: 'JavaScript asset unavailable',
            headers: { 'Content-Type': 'text/plain' },
          });
        }

        if (
          !networkResponse ||
          networkResponse.status !== 200 ||
          networkResponse.type !== 'basic' ||
          isDevBundle
        ) {
          return networkResponse;
        }

        // Кэшируем клон статики (кроме dev-бандла Metro без хэша в имени).
        const toCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, toCache)).catch(() => undefined);
        return networkResponse;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        // Для скриптов пустой ответ лучше, чем undefined: страница получит
        // внятную ошибку загрузки, а не оборванный запрос.
        if (cached) return cached;
        if (event.request.destination === 'script') {
          return new Response('', {
            status: 503,
            statusText: 'Offline',
            headers: { 'Content-Type': 'text/plain' },
          });
        }
        return Response.error();
      })
  );
});
