// src/utils/forcePwaUpdate.js
// Принудительное обновление PWA: снять service worker, вычистить Cache Storage
// и перезагрузиться в обход HTTP-кэша.
//
// ВАЖНО про то, чего здесь НЕТ и не должно быть: функция НЕ трогает IndexedDB
// и localStorage — там лежат персонажи. Очищается только Cache Storage
// (файлы приложения: бандл, иконки, manifest).
//
// История дефекта: прежняя версия вызывала unregister() без await и сразу
// window.location.reload(true). Из-за этого
//   1) reload срабатывал до фактического снятия воркера (unregister
//      асинхронный) — кнопку приходилось жать по несколько раз;
//   2) Cache Storage не очищался вовсе, поэтому снятие воркера ничего не
//      меняло: перезагрузка снова поднимала старый бандл из кэша;
//   3) аргумент reload(true) («force reload») игнорируется современными
//      браузерами — спецификация его убрала.

import { debugLog } from '../debug/falloutDebug';

export const forcePwaUpdate = async () => {
  if (typeof window === 'undefined') return;

  debugLog('pwa.update:start', {});

  try {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      // Ждём КАЖДЫЙ unregister: без await перезагрузка обгоняет снятие.
      await Promise.all(registrations.map((registration) => registration.unregister()));
      debugLog('pwa.update:swUnregistered', { count: registrations.length });
    }
  } catch (error) {
    debugLog('pwa.update:swFailed', { message: error?.message || String(error) });
  }

  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      debugLog('pwa.update:cachesCleared', { keys });
    }
  } catch (error) {
    debugLog('pwa.update:cachesFailed', { message: error?.message || String(error) });
  }

  // reload(true) больше не работает, поэтому обходим HTTP-кэш уникальным
  // параметром. replace(), а не assign(), чтобы не плодить записи в истории:
  // иначе кнопка «назад» вернёт пользователя на устаревший документ.
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('_swr', Date.now().toString(36));
    window.location.replace(url.toString());
  } catch (_) {
    window.location.reload();
  }
};
