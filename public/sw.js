// Compatibility worker for clients that still have /sw.js registered.
// The app now uses /service-worker.js. Retire this duplicate registration
// instead of allowing it to serve stale HTML for missing JavaScript bundles.
//
// ПАТЧ 320 (будильник): файл изменён НАМЕРЕННО. У части давно установленных
// PWA этот воркер остался активным и раздаёт старый кэш, а activate ниже
// не срабатывает, пока файл не изменится (замкнутый круг — «вечно старое
// приложение»). Браузер сверяет файл воркера при каждом запуске: увидев
// новую версию, он переустановит воркер, activate снимет регистрацию
// и вычистит кэши — следующий запуск застрявшего клиента придёт уже за
// свежим приложением. compat-worker revision: 320.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.registration.unregister(),
      caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))),
    ]).then(() => self.clients.claim())
  );
});
