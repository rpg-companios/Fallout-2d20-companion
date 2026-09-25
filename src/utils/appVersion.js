// src/utils/appVersion.js
// Система обновлений PWA (патч 321; переосмыслена патчем 335 по слову
// владельца): приложение «стучится» на сервер за /version.json и показывает
// окно «Что нового» ОДИН РАЗ НА РЕЛИЗ. Галочки «больше не показывать» нет:
// увидел окно — релиз запомнен, до следующего релиза окно не беспокоит.
//
// Релиз ≠ патч: релиз состоит из кучи патчей. version.json несёт
//   version — номер последнего патча (правило 321, обновляется каждым патчем);
//   release — номер релиза (поднимает ВЛАДЕЛЕЦ, слово «делай релиз»);
//   notes  — описание РЕЛИЗА на обоих языках (не «каждый чих»).
// Патчи между релизами окно не показывают. В старых развёртываниях поля
// release нет — фолбэк: релиз = номер патча (ведёт себя как 321).
//
// Как это работает (важно понимать честно): сама новая версия СКАЧИВАЕТСЯ
// сама — навигация всегда сетевая (service-worker 265), бандлы с хэшами в
// именах, воркер обновляется по visibilitychange. Пользователь, увидевший
// окно, уже запускает свежую версию; окно объясняет, что изменилось.
// version.json — статичный файл рядом с приложением.
//
// Логика чистая и тестируемая: хранилище и fetch внедряются снаружи.

export const VERSION_URL = '/version.json';
export const ACK_STORAGE_KEY = 'app_version_ack';

/** Прочитать запомненный релиз (окно уже показывали). */
export const readAckedVersion = (storage) => {
  try {
    return storage?.getItem?.(ACK_STORAGE_KEY) ?? null;
  } catch (_) {
    return null;
  }
};

/** Запомнить релиз (вызывается автоматически при закрытии окна, 335). */
export const writeAckedVersion = (storage, release) => {
  try {
    storage?.setItem?.(ACK_STORAGE_KEY, String(release));
  } catch (_) {
    /* приватный режим и пр. — окно просто будет показываться снова */
  }
};

/**
 * Показывать ли окно: релиз известен и не совпадает с запомненным.
 * (Релизы только растут — сравнение строк достаточно.)
 */
export const shouldShowUpdateNotice = (release, ackedRelease) =>
  Boolean(release) && release !== ackedRelease;

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
    // Релиз (335): поле может отсутствовать в старом развёртывании —
    // тогда релиз = номер патча (поведение как в 321).
    const release = data.release != null ? String(data.release) : version;
    return {
      version,
      release,
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
