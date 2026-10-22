// src/engine/updates/appReleaseClient.js
// Сетевой слой проверки обновлений движка: скачать app-release.json и
// разобрать его. Всё, что ходит в сеть, принимает fetchImpl — тесты
// подставляют свой fetch, приложение — глобальный.
//
// Проверка обновлений — не повод мешать запуску: любая ошибка возвращается
// вызывающему коду, а тот решает, что показать (обычно — ничего).

import { APP_RELEASE_URL, parseAppRelease } from './appRelease';

export const APP_RELEASE_TIMEOUT_MS = 15_000;

const withTimeout = async (fetchImpl, url, options = {}, timeoutMs = APP_RELEASE_TIMEOUT_MS) => {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    return await fetchImpl(url, {
      ...options,
      ...(controller ? { signal: controller.signal } : {}),
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
};

/**
 * Скачать и разобрать app-release.json движка.
 *
 * @returns {Promise<{release: object, url: string}>}
 * @throws  если сети нет, файл не найден или формат незнакомый
 */
export const fetchAppRelease = async ({ fetchImpl = fetch, url = APP_RELEASE_URL, timeoutMs } = {}) => {
  const response = await withTimeout(fetchImpl, url, { cache: 'no-cache' }, timeoutMs);
  // 404 — нормальное состояние репозитория до первого релиза; отличаем его
  // от сетевой ошибки, чтобы при разборе логов было видно причину.
  if (!response || !response.ok) {
    throw new Error(`[app-update] could not load ${url} (HTTP ${response?.status ?? 'n/a'})`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error(`[app-update] release index is not valid JSON: ${error?.message ?? error}`);
  }

  const release = parseAppRelease(payload);
  if (!release) {
    throw new Error(`[app-update] ${url} is not a recognized app-release index`);
  }
  return { release, url };
};
