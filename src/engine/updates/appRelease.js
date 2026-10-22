// src/engine/updates/appRelease.js
// Правила «вышел ли новый APK/сборка движка» по файлу app-release.json,
// который публикация кладёт в корень репозитория движка рядом с release.json
// сеттингов (см. docs/publishing.md).
//
// Почему отдельный файл, а не GitHub API: raw.githubusercontent.com отдаёт
// его с CORS, без токена и лимита анонимных запросов API (60/час на IP).
// Поэтому проверка обновлений работает и в APK, и в PWA одинаково.
//
// Модуль ничего не качает и не показывает: только разбирает индекс и решает,
// что предложить. Сеть — appReleaseClient.js, состояние — appUpdateStore.js,
// окно — components/UpdateNotice/AppUpdateModal.js.

import { compareVersions } from '../settings/settingRelease';

export const APP_RELEASE_FILE = 'app-release.json';
export const APP_RELEASE_SCHEMA_VERSION = 1;

// Движок раздаётся из этого репозитория: адрес файла и страница релизов
// собираются из него, а не из настроек пользователя — обновлять движок
// пользователь не волен, это всегда официальная сборка.
export const ENGINE_REPOSITORY = 'rpg-companios/ttrpg-engine';
export const ENGINE_REPOSITORY_BRANCH = 'main';

// Имя файла релиза постоянное: ссылка «последний релиз» не ломается при
// смене тега engine-v<semver> (docs/publishing.md).
export const APK_ASSET_NAME = 'positronium.apk';

export const APP_RELEASE_URL = `https://raw.githubusercontent.com/${ENGINE_REPOSITORY}/${ENGINE_REPOSITORY_BRANCH}/${APP_RELEASE_FILE}`;
export const APP_RELEASES_PAGE_URL = `https://github.com/${ENGINE_REPOSITORY}/releases`;

const REPOSITORY_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const DIGEST_RE = /^[a-f0-9]{64}$/;

/** Адрес страницы релизов движка (для кнопки «другие версии» и сообщений). */
export const appReleasesPageUrl = (repository = ENGINE_REPOSITORY) => (
  `https://github.com/${repository}/releases`
);

/**
 * Прямая ссылка на последний собранный APK. Имя ассета постоянное, поэтому
 * адрес не меняется от релиза к релизу: его можно давать людям навсегда.
 */
export const appApkUrl = (release) => {
  const repository = release?.repository ?? ENGINE_REPOSITORY;
  const asset = release?.asset ?? APK_ASSET_NAME;
  return `https://github.com/${repository}/releases/latest/download/${asset}`;
};

const normalizeNotes = (notes) => {
  if (!notes || typeof notes !== 'object') return {};
  const result = {};
  for (const [locale, lines] of Object.entries(notes)) {
    if (!Array.isArray(lines)) continue;
    const clean = lines.filter((line) => typeof line === 'string' && line.trim().length > 0);
    if (clean.length > 0) result[locale] = clean;
  }
  return result;
};

/**
 * Разобрать app-release.json. Непонятный файл → null: движок не угадывает
 * версию и не предлагает обновление по чужим данным (как release.json сеттинга).
 *
 * @returns {null | {schemaVersion: number, version: string, tag: string|null,
 *   repository: string, asset: string, bytes: number|null, sha256: string|null,
 *   notes: Record<string, string[]>}}
 */
export const parseAppRelease = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const schemaVersion = Number(payload.schemaVersion ?? APP_RELEASE_SCHEMA_VERSION);
  if (!Number.isInteger(schemaVersion) || schemaVersion < 1) return null;

  const version = typeof payload.version === 'string' ? payload.version.trim().replace(/^v/i, '') : '';
  if (!/^\d+(?:\.\d+)*$/.test(version)) return null;

  const repository = typeof payload.repository === 'string' && payload.repository
    ? payload.repository
    : ENGINE_REPOSITORY;
  if (!REPOSITORY_RE.test(repository)) return null;

  const asset = typeof payload.asset === 'string' && payload.asset ? payload.asset : APK_ASSET_NAME;
  if (asset.includes('/') || asset.includes('\\')) return null;

  const bytes = Number.isInteger(payload.bytes) && payload.bytes > 0 ? payload.bytes : null;
  const sha256 = typeof payload.sha256 === 'string' && DIGEST_RE.test(payload.sha256)
    ? payload.sha256
    : null;
  const tag = typeof payload.tag === 'string' && payload.tag ? payload.tag : null;

  return {
    schemaVersion,
    version,
    tag,
    repository,
    asset,
    bytes,
    sha256,
    notes: normalizeNotes(payload.notes),
  };
};

/**
 * Что показать пользователю.
 *
 * @param {object} params
 * @param {object|null} params.latest           разобранный app-release.json
 * @param {string} params.currentVersion        ENGINE_VERSION установленной сборки
 * @param {string|null} params.dismissedVersion версия, от которой отказались кнопкой «Позже»
 * @returns {{status: 'none'|'current'|'dismissed'|'available', version?: string,
 *   downloadUrl?: string, pageUrl?: string, notes?: Record<string,string[]>}}
 */
export const planAppUpdate = ({ latest, currentVersion, dismissedVersion = null }) => {
  if (!latest) return { status: 'none' };
  const comparison = compareVersions(latest.version, currentVersion);
  // Несравнимые версии — молчим: обновление по неясным данным не предлагаем.
  if (comparison === null) return { status: 'none' };
  if (comparison <= 0) return { status: 'current' };

  // «Позже» помнит конкретную версию: вышедшая следом снова покажется.
  if (dismissedVersion != null && String(dismissedVersion) === latest.version) {
    return { status: 'dismissed', version: latest.version };
  }

  return {
    status: 'available',
    version: latest.version,
    downloadUrl: appApkUrl(latest),
    pageUrl: appReleasesPageUrl(latest.repository),
    notes: latest.notes,
  };
};
