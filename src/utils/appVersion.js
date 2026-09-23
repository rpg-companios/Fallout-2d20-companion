// src/utils/appVersion.js
// Система обновлений PWA (патч 321, слово владельца): приложение «стучится»
// на сервер за /version.json и, если версия новее запомненной, показывает
// окно «Что нового» с чейнджлогом и галочкой «больше не показывать».
//
// Как это работает (важно понимать честно): сама новая версия СКАЧИВАЕТСЯ
// сама — навигация всегда сетевая (service-worker 265), бандлы с хэшами в
// именах, воркер обновляется по visibilitychange. Пользователь, увидевший
// окно, уже запускает свежую версию; окно объясняет, что изменилось.
// version.json — статичный файл рядом с приложением, обновляется в том же
// патче, что и changelogs (версия = номер последнего патча).
//
// Логика чистая и тестируемая: хранилище и fetch внедряются снаружи.

export const VERSION_URL = '/version.json';
export const ACK_STORAGE_KEY = 'app_version_ack';

/** Прочитать запомненную версию (галочка «больше не показывать»). */
export const readAckedVersion = (storage) => {
  try {
    return storage?.getItem?.(ACK_STORAGE_KEY) ?? null;
  } catch (_) {
    return null;
  }
};

/** Запомнить версию (вызывается при закрытии окна с поставленной галочкой). */
export const writeAckedVersion = (storage, version) => {
  try {
    storage?.setItem?.(ACK_STORAGE_KEY, String(version));
  } catch (_) {
    /* приватный режим и пр. — окно просто будет показываться снова */
  }
};

/**
 * Показывать ли окно: версия известна и не совпадает с запомненной.
 * (Установленных «будущих» версий не бывает: версия только растёт,
 * сравнение строк достаточно — номер патча монотонный.)
 */
export const shouldShowUpdateNotice = (version, ackedVersion) =>
  Boolean(version) && version !== ackedVersion;

/**
 * Свежий /version.json с сервера. Любая неудача (нет файла, сеть, кривой
 * JSON) → null: старые развёртывания без файла живут как раньше.
 */
export const fetchLatestVersion = async (fetchImpl = fetch, url = VERSION_URL) => {
  try {
    const response = await fetchImpl(url, { cache: 'reload' });
    if (!response || !response.ok) return null;
    const data = await response.json();
    const version = data && typeof data.version === 'string' ? data.version : null;
    if (!version) return null;
    return {
      version,
      notes: (data.notes && typeof data.notes === 'object') ? data.notes : {},
    };
  } catch (_) {
    return null;
  }
};

/** Строки чейнджлога на языке приложения (фолбэк на ru — язык владельца). */
export const notesForLocale = (notes, locale) => {
  const lines = notes?.[locale];
  if (Array.isArray(lines) && lines.length > 0) return lines;
  const ru = notes?.['ru-RU'];
  return Array.isArray(ru) ? ru : [];
};
