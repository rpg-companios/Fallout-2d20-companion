// Сетевой слой обновления сеттинга: скачать release.json, скачать `.trpg`,
// проверить размер и sha256. Правила «нужно ли обновляться» — в
// settingRelease.js (чистые), установка пакета — в settingPackageInstaller.js.
//
// Всё, что ходит в сеть, принимает fetchImpl: тесты подставляют свой fetch,
// приложение — глобальный fetch.

import { CryptoDigestAlgorithm, digest } from 'expo-crypto';
import {
  parseReleaseIndex,
  releaseIndexUrl,
} from './settingRelease';

export const SETTING_RELEASE_TIMEOUT_MS = 30_000;
export const SETTING_RELEASE_MAX_BYTES = 50 * 1024 * 1024;

const bytesToHex = (bytes) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

const withTimeout = async (fetchImpl, url, options = {}, timeoutMs = SETTING_RELEASE_TIMEOUT_MS) => {
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

/** Скачать и разобрать release.json репозитория сеттинга. */
export const fetchSettingReleaseIndex = async ({ source, fetchImpl = fetch }) => {
  const url = releaseIndexUrl(source);
  const response = await withTimeout(fetchImpl, url, { cache: 'no-cache' });
  if (!response || !response.ok) {
    throw new Error(`[setting-release] could not load ${url} (HTTP ${response?.status ?? 'n/a'})`);
  }
  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error(`[setting-release] release index is not valid JSON: ${error?.message ?? error}`);
  }
  const index = parseReleaseIndex(payload);
  return { index, url };
};

const readBytes = async (response) => {
  if (typeof response.arrayBuffer === 'function') {
    return new Uint8Array(await response.arrayBuffer());
  }
  if (typeof response.blob === 'function') {
    return new Uint8Array(await (await response.blob()).arrayBuffer());
  }
  throw new Error('[setting-release] response has no body reader');
};

/**
 * Скачать файл `.trpg` релиза. Сначала — адрес релиза, затем (если он не
 * ответил) ссылка «последний релиз» и, если объявлена, резервная ссылка.
 * Размер проверяется до чтения тела по заголовку и после чтения по факту.
 */
export const downloadSettingRelease = async ({ release, fetchImpl = fetch, maxBytes = SETTING_RELEASE_MAX_BYTES }) => {
  const candidates = [release.assetUrl, release.latestUrl, release.rawUrl].filter(
    (url, index, list) => typeof url === 'string' && url && list.indexOf(url) === index,
  );
  const errors = [];

  for (const url of candidates) {
    try {
      const response = await withTimeout(fetchImpl, url, { cache: 'no-cache' });
      if (!response || !response.ok) {
        errors.push(`${url}: HTTP ${response?.status ?? 'n/a'}`);
        continue;
      }
      const declaredLength = Number(response.headers?.get?.('content-length'));
      if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
        throw new Error(`[setting-release] archive is ${declaredLength} bytes; limit is ${maxBytes}`);
      }
      const bytes = await readBytes(response);
      if (bytes.byteLength === 0) {
        errors.push(`${url}: empty body`);
        continue;
      }
      if (bytes.byteLength > maxBytes) {
        throw new Error(`[setting-release] archive is ${bytes.byteLength} bytes; limit is ${maxBytes}`);
      }
      if (release.bytes && bytes.byteLength !== release.bytes) {
        throw new Error(
          `[setting-release] archive size ${bytes.byteLength} does not match released ${release.bytes}`,
        );
      }
      return { bytes, url, name: release.asset };
    } catch (error) {
      errors.push(`${url}: ${error?.message ?? error}`);
    }
  }

  throw new Error(`[setting-release] could not download ${release.asset}: ${errors.join('; ')}`);
};

/** sha256 скачанного архива. Возвращает null, если релиз не объявил сумму. */
export const settingReleaseDigest = async (bytes) => {
  const buffer = await digest(CryptoDigestAlgorithm.SHA256, bytes);
  return bytesToHex(new Uint8Array(buffer));
};

/**
 * Проверить, что скачанные байты — ровно тот архив, который выпустили.
 * Суммы нет в релизе → проверка невозможна; это не ошибка (первая версия
 * контракта живёт без подписи), но и не «успех»: возвращаем 'unverified'.
 */
export const verifySettingRelease = async (bytes, release) => {
  if (!release?.sha256) return 'unverified';
  const actual = await settingReleaseDigest(bytes);
  if (actual !== release.sha256) {
    throw new Error(`[setting-release] checksum mismatch: expected ${release.sha256}, got ${actual}`);
  }
  return 'verified';
};
