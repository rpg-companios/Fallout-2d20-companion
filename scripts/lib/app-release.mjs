// scripts/lib/app-release.mjs
// Релиз движка: версия, тег, текст для GitHub Release и индекс обновлений
// app-release.json, по которому приложение узнаёт о новой сборке.
//
// Файл едет в репозиторий движка: релиз выпускается там же, где собирается
// APK (scripts/release.mjs). Из смешанного репозитория этими же функциями
// пользуется публикация — правила про версию и заметки должны совпадать.
//
// Чистые функции — проверяются тестами без сети, git и EAS.

import fs from 'node:fs';
import path from 'node:path';

import { isSemanticVersion } from './semver.mjs';

export const APP_RELEASE_FILE = 'app-release.json';
export const APP_RELEASE_SCHEMA_VERSION = 1;

// Постоянные имена ассетов: адрес /releases/latest/download/positronium.apk
// не меняется от релиза к релизу, его можно давать людям навсегда.
export const ENGINE_APK_ASSET = 'positronium.apk';
export const ENGINE_AAB_ASSET = 'positronium.aab';

export const ENGINE_RELEASE_NOTES = 'release-notes/engine.md';

/** Версия движка из app.json (`expo.version`) — то же число, что ENGINE_VERSION. */
export const readEngineVersion = (root) => {
  const file = path.join(root, 'app.json');
  const app = JSON.parse(fs.readFileSync(file, 'utf8'));
  const version = app?.expo?.version;
  if (!isSemanticVersion(version)) {
    throw new Error(`[release] app.json expo.version must be MAJOR.MINOR.PATCH: ${version}`);
  }
  return version.trim();
};

/** Тег релиза движка: `engine-v1.0.0`. */
export const engineReleaseTag = (version) => `engine-v${version}`;

/**
 * Текст GitHub Release: заголовок секции заметок и её тело.
 * Один и тот же текст видят и в релизе, и в приложении (через заметки).
 */
export const renderReleaseBody = (notes) => {
  const heading = notes?.title ? `## ${notes.version} — ${notes.title}` : `## ${notes.version}`;
  return [heading, '', notes?.body ?? ''].join('\n').trim();
};

/**
 * Заметки для окна «Доступна новая версия»: клиент рисует строки списком,
 * поэтому отдаём пункты, а не переносы markdown. Абзац склеивается в одну
 * строку (иначе окно покажет обрывки фраз), маркеры списка снимаются.
 */
export const releaseNotesLines = (notes) => {
  const lines = [];
  if (notes?.title) lines.push(notes.title);

  const paragraphs = [];
  let current = [];
  const flush = () => {
    if (current.length > 0) {
      paragraphs.push(current.join(' '));
      current = [];
    }
  };
  for (const raw of String(notes?.body ?? '').split('\n')) {
    const line = raw.replace(/^\s*[-*]\s+/, '').trim();
    if (!line) { flush(); continue; }
    if (line.startsWith('#')) continue;
    current.push(line);
  }
  flush();

  for (const paragraph of paragraphs) {
    if (paragraph) lines.push(paragraph);
  }
  return { 'ru-RU': lines };
};

/**
 * Содержимое app-release.json: одна запись про последний релиз с APK.
 *
 * @param {object} params
 * @param {string} params.repository owner/name движка
 * @param {string} params.version    semver из app.json
 * @param {object} params.notes      верхняя секция release-notes/engine.md
 * @param {string} [params.asset]    имя файла APK в релизе (постоянное)
 * @param {number} params.bytes      размер APK
 * @param {string} params.sha256     sha256 APK
 * @param {string} [params.publishedAt]
 */
export const buildAppReleaseIndex = ({
  repository,
  version,
  notes,
  asset = ENGINE_APK_ASSET,
  bytes,
  sha256,
  publishedAt,
}) => {
  if (!isSemanticVersion(version)) {
    throw new Error(`[release] app-release: версия должна быть MAJOR.MINOR.PATCH, получено "${version}"`);
  }
  if (!repository || !repository.includes('/')) {
    throw new Error(`[release] app-release: нужен репозиторий owner/name, получено "${repository}"`);
  }
  if (!asset || asset.includes('/') || asset.includes('\\')) {
    throw new Error(`[release] app-release: недопустимое имя ассета "${asset}"`);
  }
  if (!Number.isInteger(bytes) || bytes <= 0) {
    throw new Error('[release] app-release: нужен размер APK в байтах');
  }
  if (!/^[a-f0-9]{64}$/.test(String(sha256 ?? ''))) {
    throw new Error('[release] app-release: нужен sha256 APK');
  }
  return {
    schemaVersion: APP_RELEASE_SCHEMA_VERSION,
    version,
    tag: engineReleaseTag(version),
    repository,
    asset,
    bytes,
    sha256,
    downloadUrl: `https://github.com/${repository}/releases/latest/download/${asset}`,
    pageUrl: `https://github.com/${repository}/releases`,
    notes: notes ? releaseNotesLines(notes) : {},
    publishedAt: publishedAt ?? new Date().toISOString(),
  };
};

/** Сериализация индекса: одинаковый вид файла в репозитории и в тестах. */
export const renderAppReleaseIndex = (index) => `${JSON.stringify(index, null, 2)}\n`;
