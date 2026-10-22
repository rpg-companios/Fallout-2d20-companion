// scripts/lib/semver.mjs
// Семантические версии релизов — общие для движка и сеттингов.
//
// Файл едет в оба целевых репозитория: релизный сценарий движка
// (scripts/release.mjs) и релиз сеттинга пользуются одними правилами.
//
// Старые релизы сеттинга нумеровались целыми (`fallout-v1`): такая версия
// считается до-семантической и не продолжает линию — первый семантический
// выпуск получает номер из манифеста (1.0.0), а старый тег убирается.

export const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

export const isSemanticVersion = (value) => (
  typeof value === 'string' && SEMVER_RE.test(value.trim())
);

/** Разобрать `MAJOR.MINOR.PATCH` в тройку чисел; иначе null. */
export const parseSemver = (value) => {
  if (typeof value !== 'string') return null;
  const match = SEMVER_RE.exec(value.trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
};

/** Сравнить две семантические версии: -1 | 0 | 1. */
export const compareSemver = (left, right) => {
  const a = parseSemver(left);
  const b = parseSemver(right);
  if (!a || !b) return null;
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
};

export const RELEASE_LEVELS = ['patch', 'minor', 'major'];

/** Поднять версию на один уровень; уровень по умолчанию — patch. */
export const bumpVersion = (version, level = 'patch') => {
  const parts = parseSemver(version);
  if (!parts) throw new Error(`[release] not a semantic version: ${version}`);
  if (!RELEASE_LEVELS.includes(level)) {
    throw new Error(`[release] unknown release level: ${level} (expected ${RELEASE_LEVELS.join('|')})`);
  }
  const [major, minor, patch] = parts;
  if (level === 'major') return `${major + 1}.0.0`;
  if (level === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
};

/**
 * Номер следующего релиза.
 *
 * - Манифест поднят вручную выше опубликованного — публикуем его как есть.
 * - Иначе шагаем на `level` от опубликованной версии (по умолчанию patch).
 * - Опубликованной семантической версии нет (первый выпуск или старый
 *   целочисленный тег) — берём версию из манифеста без изменений.
 *
 * @param {object} params
 * @param {string} params.manifestVersion
 * @param {string} [params.publishedVersion]  версия из release.json
 * @param {'patch'|'minor'|'major'} [params.level]
 * @param {string} [params.explicitVersion]   номер, заданный вручную
 */
export const nextReleaseVersion = ({
  manifestVersion,
  publishedVersion,
  level = 'patch',
  explicitVersion,
}) => {
  if (!isSemanticVersion(manifestVersion)) {
    throw new Error(
      `[release] manifest.version must be MAJOR.MINOR.PATCH: ${manifestVersion}`,
    );
  }
  if (explicitVersion !== undefined && explicitVersion !== null && explicitVersion !== '') {
    if (!isSemanticVersion(explicitVersion)) {
      throw new Error(`[release] --version must be MAJOR.MINOR.PATCH: ${explicitVersion}`);
    }
    const comparison = publishedVersion && isSemanticVersion(publishedVersion)
      ? compareSemver(explicitVersion, publishedVersion)
      : 1;
    if (comparison !== null && comparison <= 0) {
      throw new Error(
        `[release] ${explicitVersion} must be greater than the published ${publishedVersion}`,
      );
    }
    if (compareSemver(explicitVersion, manifestVersion) < 0) {
      throw new Error(`[release] ${explicitVersion} is lower than manifest.version ${manifestVersion}`);
    }
    return explicitVersion;
  }

  // Целочисленный или отсутствующий релиз — начало семантической линии.
  if (!publishedVersion || !isSemanticVersion(publishedVersion)) return manifestVersion;

  if (compareSemver(manifestVersion, publishedVersion) > 0) return manifestVersion;
  return bumpVersion(publishedVersion, level);
};
