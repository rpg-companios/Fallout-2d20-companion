// Чистая логика обновления сеттинга по сети.
//
// Откуда клиент узнаёт о новой версии: репозиторий сеттинга публикует
// `release.json` в корне (его пишет scripts/publish-repositories.mjs при
// выпуске релиза). Файл лежит рядом с папками сеттингов и содержит по записи
// на каждый кошелёк: версию из манифеста, тег релиза, имя файла `.trpg`,
// размер и sha256.
//
// Почему отдельный файл, а не GitHub API: он отдаётся raw.githubusercontent.com
// с CORS, не требует токена и не упирается в лимит анонимных запросов API
// (60/час на IP), который на общем мобильном операторе легко исчерпать.
//
// Модуль ничего не качает и не ставит — только решает, что делать. Сеть и
// установка внедряются снаружи (settingReleaseClient.js), поэтому правила
// проверяются тестами без сети.

export const RELEASE_INDEX_FILE = 'release.json';
export const RELEASE_INDEX_SCHEMA_VERSION = 1;

const SETTING_ID_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const DIGEST_RE = /^[a-f0-9]{64}$/;

const parseVersionParts = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return [value];
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/^v/i, '');
  if (!/^\d+(?:\.\d+)*$/.test(text)) return null;
  return text.split('.').map((part) => Number(part));
};

/**
 * Сравнить две версии. Возвращает -1 | 0 | 1, либо null, если версия не
 * разбирается (тогда обновление не предлагаем: чужой формат не «подчищаем»).
 */
export const compareVersions = (left, right) => {
  const a = parseVersionParts(left);
  const b = parseVersionParts(right);
  if (!a || !b) return null;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = a[index] ?? 0;
    const rightPart = b[index] ?? 0;
    if (leftPart !== rightPart) return leftPart > rightPart ? 1 : -1;
  }
  return 0;
};

/**
 * Разобрать требование манифеста (`requiresCore`) в оператор и версию.
 * Поддержаны `>=`, `>`, `<=`, `<`, `=`, `^`, `~` и «*» (любая версия).
 * Неизвестная запись → null: движок не угадывает, а сообщает об ошибке.
 */
export const parseVersionRequirement = (requirement) => {
  const text = typeof requirement === 'string' ? requirement.trim() : '';
  if (!text || text === '*') return { operator: '*', version: '0' };
  const match = text.match(/^(>=|<=|>|<|=|\^|~)?\s*v?(\d+(?:\.\d+)*)$/);
  if (!match) return null;
  return { operator: match[1] ?? '=', version: match[2] };
};

/** Удовлетворяет ли версия ядра требованию манифеста. */
export const satisfiesVersionRequirement = (requirement, version) => {
  const parsed = parseVersionRequirement(requirement);
  if (!parsed) return false;
  if (parsed.operator === '*') return true;

  const comparison = compareVersions(version, parsed.version);
  if (comparison === null) return false;

  switch (parsed.operator) {
    case '>=': return comparison >= 0;
    case '>': return comparison > 0;
    case '<=': return comparison <= 0;
    case '<': return comparison < 0;
    case '=': return comparison === 0;
    case '^': {
      // ^1.2.3 — та же мажорная ветка и не ниже указанной версии.
      const actual = parseVersionParts(version);
      const required = parseVersionParts(parsed.version);
      return comparison >= 0 && actual[0] === required[0];
    }
    case '~': {
      // ~1.2.3 — та же минорная ветка и не ниже указанной версии.
      const actual = parseVersionParts(version);
      const required = parseVersionParts(parsed.version);
      return comparison >= 0
        && actual[0] === required[0]
        && (actual[1] ?? 0) === (required[1] ?? 0);
    }
    default:
      return false;
  }
};

/** Валидный ли адрес репозитория вида `owner/name` (латиница, цифры, дефис, точка, подчёркивание). */
export const isRepositorySlug = (value) => (
  typeof value === 'string'
  && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)
);

/**
 * Разобрать ссылку, которую пользователь вставил в настройках.
 *
 * Приложение не знает ни одного сеттинга заранее: адрес всегда вводит
 * пользователь. Поддерживаются:
 *  - `owner/repo` и `https://github.com/owner/repo[/tree/<branch>]` — репозиторий
 *    сеттинга с `release.json` в корне;
 *  - `https://raw.githubusercontent.com/owner/repo/<branch>/release.json`;
 *  - прямая ссылка на архив `.trpg` (в том числе release-asset GitHub).
 *
 * @returns {{repository: string, branch: string}|{assetUrl: string}}
 */
export const parseSettingLink = (input) => {
  const text = typeof input === 'string' ? input.trim() : '';
  if (!text) throw new Error('[setting-release] empty setting link');

  if (!/^https?:\/\//i.test(text)) {
    if (isRepositorySlug(text)) return { repository: text, branch: 'main' };
    throw new Error(`[setting-release] unsupported setting link: ${text}`);
  }

  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`[setting-release] unsupported setting link: ${text}`);
  }
  if (url.protocol !== 'https:') {
    throw new Error(`[setting-release] unsupported setting link: ${text}`);
  }
  if (/\.trpg$/i.test(url.pathname)) return { assetUrl: text };

  const parts = url.pathname.split('/').filter(Boolean);
  if (url.hostname === 'raw.githubusercontent.com' && parts.length >= 3) {
    const repository = `${parts[0]}/${parts[1]}`;
    if (isRepositorySlug(repository)) return { repository, branch: parts[2] };
  }
  if (url.hostname === 'github.com' && parts.length >= 2) {
    const repository = `${parts[0]}/${parts[1]}`;
    if (!isRepositorySlug(repository)) {
      throw new Error(`[setting-release] unsupported setting link: ${text}`);
    }
    const branch = parts[2] === 'tree' && parts[3] ? parts[3] : 'main';
    return { repository, branch };
  }

  throw new Error(`[setting-release] unsupported setting link: ${text}`);
};

/** Репозиторий, из которого скачан релиз: нужен, чтобы проверять обновления дальше. */
export const repositoryFromAssetUrl = (input) => {
  try {
    const url = new URL(String(input));
    const parts = url.pathname.split('/').filter(Boolean);
    if (url.hostname !== 'github.com' || parts.length < 4 || parts[2] !== 'releases') return null;
    const repository = `${parts[0]}/${parts[1]}`;
    return isRepositorySlug(repository) ? repository : null;
  } catch {
    return null;
  }
};

/**
 * Привести запись источника обновлений к строгому виду.
 * Источник либо объявлен в settings/release-sources.json, либо добавлен пользователем ссылкой.
 */
export const normalizeReleaseSource = (settingId, raw) => {
  if (!SETTING_ID_RE.test(settingId ?? '')) {
    throw new Error(`[setting-release] invalid setting id: ${settingId}`);
  }
  if (!raw || typeof raw !== 'object') {
    throw new Error(`[setting-release] setting "${settingId}" has no release source`);
  }
  if (!isRepositorySlug(raw.repository)) {
    throw new Error(`[setting-release] setting "${settingId}" has an invalid repository`);
  }
  const branch = typeof raw.branch === 'string' && raw.branch ? raw.branch : 'main';
  return {
    id: settingId,
    repository: raw.repository,
    branch,
    autoInstall: raw.autoInstall === true,
  };
};

/** Адрес release.json в репозитории сеттинга. */
export const releaseIndexUrl = (source) => (
  `https://raw.githubusercontent.com/${source.repository}/${source.branch}/${RELEASE_INDEX_FILE}`
);

/** Адрес страницы релизов (для сообщений об ошибках и ручной проверки). */
export const releasePageUrl = (source) => `https://github.com/${source.repository}/releases`;

const normalizeReleaseEntry = (settingId, entry) => {
  if (!entry || typeof entry !== 'object') return null;
  if (entry.id !== settingId) return null;
  if (typeof entry.version === 'undefined' || entry.version === null) return null;
  if (typeof entry.asset !== 'string' || !entry.asset.toLowerCase().endsWith('.trpg')) return null;
  if (typeof entry.assetUrl !== 'string' || !/^https:\/\//.test(entry.assetUrl)) return null;
  const digest = typeof entry.sha256 === 'string' && DIGEST_RE.test(entry.sha256)
    ? entry.sha256
    : null;
  return {
    id: settingId,
    name: typeof entry.name === 'string' && entry.name ? entry.name : settingId,
    version: entry.version,
    packFormat: entry.packFormat ?? null,
    requiresCore: typeof entry.requiresCore === 'string' ? entry.requiresCore : '>=0',
    tag: typeof entry.tag === 'string' ? entry.tag : null,
    asset: entry.asset,
    assetUrl: entry.assetUrl,
    latestUrl: typeof entry.latestUrl === 'string' ? entry.latestUrl : null,
    bytes: Number.isFinite(entry.bytes) ? entry.bytes : null,
    sha256: digest,
  };
};

/**
 * Разобрать release.json. Битый или чужой формат — ошибка с причиной:
 * молча «обновлений нет» означало бы, что сеттинг не обновится никогда.
 */
export const parseReleaseIndex = (raw) => {
  if (!raw || typeof raw !== 'object') {
    throw new Error('[setting-release] release index must be an object');
  }
  if (raw.schemaVersion !== RELEASE_INDEX_SCHEMA_VERSION) {
    throw new Error(`[setting-release] unsupported release index schema: ${raw.schemaVersion}`);
  }
  const settings = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
  return { schemaVersion: RELEASE_INDEX_SCHEMA_VERSION, settings };
};

/**
 * Решение по одному сеттингу.
 *
 * @param {object} params
 * @param {string} params.settingId
 * @param {object} params.source           normalized release source
 * @param {object} params.index            parseReleaseIndex(...)
 * @param {number|string|null} params.installedVersion  версия из установленного манифеста
 * @param {string} params.coreVersion      ENGINE_VERSION
 * @returns {{status: string, reason?: string, settingId: string,
 *            fromVersion: (number|string|null), toVersion: (number|string|null),
 *            release: object|null}}
 */
export const planSettingUpdate = ({
  settingId,
  source,
  index,
  installedVersion,
  coreVersion,
}) => {
  const rawEntry = index?.settings?.[settingId] ?? null;
  const release = rawEntry ? normalizeReleaseEntry(settingId, rawEntry) : null;

  if (!release) {
    return {
      status: 'not-released',
      reason: 'release index has no valid entry for this setting',
      settingId,
      fromVersion: installedVersion ?? null,
      toVersion: null,
      release: null,
    };
  }

  const comparison = compareVersions(release.version, installedVersion ?? 0);
  if (comparison === null) {
    return {
      status: 'not-released',
      reason: 'release or installed version is not comparable',
      settingId,
      fromVersion: installedVersion ?? null,
      toVersion: release.version,
      release,
    };
  }
  if (comparison <= 0) {
    return {
      status: 'up-to-date',
      settingId,
      fromVersion: installedVersion ?? null,
      toVersion: release.version,
      release,
    };
  }

  if (!satisfiesVersionRequirement(release.requiresCore, coreVersion)) {
    return {
      status: 'incompatible-core',
      reason: `release requires core ${release.requiresCore}`,
      settingId,
      fromVersion: installedVersion ?? null,
      toVersion: release.version,
      release,
    };
  }

  return {
    status: 'update-available',
    settingId,
    fromVersion: installedVersion ?? null,
    toVersion: release.version,
    release,
    source,
  };
};

/**
 * Пора ли проверять обновления: не чаще `intervalHours` с прошлой проверки.
 * `force` — ручная кнопка «Проверить обновления» в окне сеттинга.
 */
export const shouldCheckRelease = ({ lastCheckedAt, now = Date.now(), intervalHours = 6, force = false }) => {
  if (force) return true;
  if (!Number.isFinite(lastCheckedAt) || lastCheckedAt <= 0) return true;
  const intervalMs = Math.max(0, Number(intervalHours) || 0) * 60 * 60 * 1000;
  return now - lastCheckedAt >= intervalMs;
};
