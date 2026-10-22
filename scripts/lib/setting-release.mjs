// scripts/lib/setting-release.mjs
// Релиз сеттинга: тег, адреса архива и содержимое release.json.
//
// Файл едет в репозиторий сеттинга: там теперь собирается `.trpg` и
// выпускается релиз (scripts/release.mjs). Из смешанного репозитория этими же
// функциями пользуется публикация кода, поэтому правила индекса совпадают.
//
// Чистые функции — проверяются тестами без сети и git.

import { isSemanticVersion } from './semver.mjs';

export const RELEASE_INDEX_FILE = 'release.json';
export const RELEASE_INDEX_SCHEMA_VERSION = 1;

const SETTING_ID_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

export const releaseNotesFile = (settingId) => `release-notes/${settingId}.md`;

/** Тег релиза одного сеттинга: `<id>-v<version>` (например, fallout-v1.0.1). */
export const releaseTag = (settingId, version) => `${settingId}-v${version}`;

/** Тег до-семантической эпохи (`fallout-v1`) — его релиз убирает. */
export const isLegacyReleaseTag = (settingId, tag) => (
  typeof tag === 'string' && new RegExp(`^${settingId}-v\\d+$`).test(tag)
);

/** Адреса скачивания архива релиза. */
export const releaseAssetUrls = ({ repository, tag, asset }) => ({
  assetUrl: `https://github.com/${repository}/releases/download/${tag}/${asset}`,
  latestUrl: `https://github.com/${repository}/releases/latest/download/${asset}`,
});

/**
 * Содержимое release.json: по записи на каждый опубликованный сеттинг.
 * Клиент читает этот файл и решает, обновляться ли (src/engine/settings/
 * settingRelease.js).
 *
 * @param {object} params
 * @param {string} params.repository  owner/name
 * @param {Array<{id: string, manifest: object, asset: string, sha256: string,
 *                bytes: number}>} params.packages
 * @param {string} [params.generatedAt]
 */
export const buildReleaseIndex = ({ repository, packages, generatedAt }) => {
  const settings = {};
  for (const entry of packages) {
    const { id, manifest, asset, sha256, bytes } = entry;
    if (!SETTING_ID_RE.test(id)) throw new Error(`[release] invalid setting id: ${id}`);
    const version = String(manifest.version);
    if (!isSemanticVersion(version)) {
      throw new Error(`[release] ${id}: version must be MAJOR.MINOR.PATCH: ${version}`);
    }
    const tag = releaseTag(id, version);
    const urls = releaseAssetUrls({ repository, tag, asset });
    settings[id] = {
      id,
      name: manifest.name ?? id,
      version,
      packFormat: manifest.packFormat ?? 1,
      requiresCore: manifest.requiresCore ?? '>=0',
      tag,
      asset,
      bytes,
      sha256,
      ...urls,
    };
  }
  return {
    schemaVersion: RELEASE_INDEX_SCHEMA_VERSION,
    generatedAt: generatedAt ?? new Date().toISOString(),
    repository,
    settings,
  };
};
