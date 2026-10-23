// Проверка совместимости пакета сеттинга с этим движком.
//
// Правило жёсткое, как у Foundry: несовместимый пакет не устанавливается и не
// активируется. Проверка идёт ДО исполнения кода пакета — поэтому сообщение
// получает человек, а не экран ошибки.
//
// Что проверяется:
//   1. диапазон версий движка (`compatibility.minimum` / `compatibility.maximum`);
//   2. версия runtime-API (`runtime.apiVersion`);
//   3. host-модули, которые пакет требует (`hostModules`) — все должны быть у движка;
//   4. объявленные возможности (`capabilities`) — движок должен их знать;
//   5. после запуска пакета — что объявленные возможности действительно
//      реализованы в `services` (проверяется отдельно, см. checkDeclaredServices).
import { ENGINE_VERSION } from '../version.js';
import {
  isKnownSettingCapability,
  settingCapabilityService,
} from './settingCapabilities.js';

// Стенд совместимости (scripts/check-setting-package.mjs) печатает ту же
// версию, против которой проверял, — иначе отчёт нельзя сверить с телефоном.
export { ENGINE_VERSION };

export const SETTING_COMPATIBILITY_CODES = Object.freeze({
  ENGINE_TOO_OLD: 'engine-too-old',
  ENGINE_TOO_NEW: 'engine-too-new',
  UNKNOWN_CAPABILITIES: 'unknown-capabilities',
  MISSING_HOST_MODULES: 'missing-host-modules',
  MISSING_SERVICES: 'missing-services',
  INVALID_COMPATIBILITY: 'invalid-compatibility',
  UNSUPPORTED_RUNTIME_API: 'unsupported-runtime-api',
});

/** Разобрать `MAJOR.MINOR.PATCH` (достаточно и `MAJOR.MINOR`). */
export const parseEngineVersion = (value) => {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)];
};

/** Сравнить версии: -1 | 0 | 1, либо null для нечитаемой версии. */
export const compareEngineVersions = (left, right) => {
  const a = parseEngineVersion(left);
  const b = parseEngineVersion(right);
  if (!a || !b) return null;
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
};

export class SettingCompatibilityError extends Error {
  constructor(problems) {
    const [first] = problems;
    super(`[setting-compat] ${first.code}: ${JSON.stringify(first.params)}`);
    this.name = 'SettingCompatibilityError';
    this.code = first.code;
    this.problems = problems;
  }
}

const compatibilityBlock = (manifest) => {
  const block = manifest?.compatibility;
  return block && typeof block === 'object' ? block : {};
};

/** Версия runtime-API пакета должна совпадать с той, что понимает движок. */
export const checkRuntimeApi = (manifest, supportedApiVersion) => {
  const apiVersion = manifest?.runtime?.apiVersion;
  if (apiVersion === undefined) return [];
  if (apiVersion === supportedApiVersion) return [];
  return [{
    code: SETTING_COMPATIBILITY_CODES.UNSUPPORTED_RUNTIME_API,
    params: { required: String(apiVersion), supported: String(supportedApiVersion) },
  }];
};

/**
 * Проверить пакет до исполнения его кода.
 *
 * @param {object} params
 * @param {object} params.manifest         манифест пакета
 * @param {string} [params.engineVersion]  версия движка (по умолчанию — текущая)
 * @param {Iterable<string>} [params.hostModuleIds] доступные host-модули
 * @returns {Array<{code: string, params: object}>} список проблем (пусто — совместим)
 */
export const checkSettingCompatibility = ({
  manifest,
  engineVersion = ENGINE_VERSION,
  hostModuleIds,
} = {}) => {
  const problems = [];
  const { minimum, maximum } = compatibilityBlock(manifest);

  // Нечитаемый диапазон — отдельная причина: человек должен понимать, что дело
  // в испорченном манифесте, а не в старой или слишком новой версии приложения.
  const unreadable = ['minimum', 'maximum'].filter(
    (field) => compatibilityBlock(manifest)[field] !== undefined
      && parseEngineVersion(String(compatibilityBlock(manifest)[field])) === null,
  );
  if (unreadable.length > 0) {
    problems.push({
      code: SETTING_COMPATIBILITY_CODES.INVALID_COMPATIBILITY,
      params: { fields: unreadable.map((field) => `compatibility.${field}`) },
    });
  }

  if (minimum !== undefined && !unreadable.includes('minimum')) {
    const comparison = compareEngineVersions(engineVersion, String(minimum));
    if (comparison === null || comparison < 0) {
      problems.push({ code: SETTING_COMPATIBILITY_CODES.ENGINE_TOO_OLD, params: { required: String(minimum), actual: engineVersion } });
    }
  }

  if (maximum !== undefined && !unreadable.includes('maximum')) {
    const comparison = compareEngineVersions(engineVersion, String(maximum));
    if (comparison === null || comparison > 0) {
      problems.push({ code: SETTING_COMPATIBILITY_CODES.ENGINE_TOO_NEW, params: { required: String(maximum), actual: engineVersion } });
    }
  }

  const unknown = (manifest?.capabilities ?? []).filter((id) => !isKnownSettingCapability(id));
  if (unknown.length > 0) {
    problems.push({
      code: SETTING_COMPATIBILITY_CODES.UNKNOWN_CAPABILITIES,
      params: { capabilities: unknown },
    });
  }

  if (hostModuleIds !== undefined) {
    const available = new Set(hostModuleIds);
    const missing = (manifest?.hostModules ?? []).filter((id) => !available.has(id));
    if (missing.length > 0) {
      problems.push({
        code: SETTING_COMPATIBILITY_CODES.MISSING_HOST_MODULES,
        params: { modules: missing },
      });
    }
  }

  return problems;
};

/**
 * После запуска пакета: объявленные возможности должны быть реализованы.
 * `services` — объект, который вернул runtime сеттинга.
 */
export const checkDeclaredServices = ({ manifest, services } = {}) => {
  const declared = Array.isArray(manifest?.capabilities) ? manifest.capabilities : [];
  const provided = services && typeof services === 'object' ? services : {};
  const missing = [];
  for (const capability of declared) {
    const service = settingCapabilityService(capability);
    if (!service) continue;
    // Сервис бывает и объектом, и функцией (например, готовый резолвер) —
    // проверяем именно наличие, а не форму.
    const value = provided[service];
    const present = value !== null && value !== undefined
      && (typeof value === 'object' || typeof value === 'function');
    if (!present) missing.push(service);
  }
  if (missing.length === 0) return [];
  return [{
    code: SETTING_COMPATIBILITY_CODES.MISSING_SERVICES,
    params: { services: missing },
  }];
};

/** Бросить SettingCompatibilityError, если пакет несовместим. */
export const assertSettingCompatibility = (params, extraProblems = []) => {
  const problems = [...checkSettingCompatibility(params), ...extraProblems];
  if (problems.length > 0) throw new SettingCompatibilityError(problems);
  return true;
};
