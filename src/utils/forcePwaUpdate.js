// src/utils/forcePwaUpdate.js
// Простой механизм принудительного обновления PWA
// (без лишних проверок — подходит для ранней стадии разработки)

export const forcePwaUpdate = () => {
  if (typeof window === 'undefined') return;

  // 1. Пытаемся unregister все Service Workers
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => {
        registrations.forEach((registration) => {
          registration.unregister();
        });
      })
      .catch(() => {});
  }

  // 2. Жёсткая перезагрузка с игнорированием кэша
  // (true = force reload в старых браузерах)
  window.location.reload(true);
};
