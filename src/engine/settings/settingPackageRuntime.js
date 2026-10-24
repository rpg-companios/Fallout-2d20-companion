import { strFromU8 } from 'fflate';
import { Platform } from 'react-native';
import {
  isSafeSettingPackagePath,
  validateSettingPackageManifest,
} from '../contracts/settingManifest';
import {
  SUPPORTED_SETTING_PACK_FORMAT,
} from './settingPackageArchive';
import { getCachedSettingFileUri, readCachedSettingFile } from './settingPackageCache';
import {
  assertSettingCompatibility,
  checkDeclaredServices,
  checkRuntimeApi,
  SettingCompatibilityError,
} from './settingCompatibility';
import {
  normalizeSettingGlobalComponents,
  normalizeSettingScreens,
  normalizeSettingTheme,
} from './settingScreens';

const SETTING_ID_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const DIGEST_RE = /^[a-f0-9]{64}$/;

const parseCacheKey = (cacheKey) => {
  if (typeof cacheKey !== 'string') throw new Error('[setting-runtime] invalid cache key');
  const [settingId, digest, extra] = cacheKey.split('/');
  if (extra !== undefined || !SETTING_ID_RE.test(settingId ?? '') || !DIGEST_RE.test(digest ?? '')) {
    throw new Error('[setting-runtime] invalid cache key');
  }
  return { settingId, digest };
};

// Причина сохраняется в `cause`: в сообщении для человека она лишняя, а при
// разборе «почему пакет не активировался» без неё не видно места в бандле.
const runtimeError = (message, cause) => new Error(
  `[setting-runtime] ${message}`,
  cause === undefined ? undefined : { cause },
);

export const SUPPORTED_SETTING_RUNTIME_API_VERSION = 1;

const SETTING_ASSET_EXTENSIONS = /\.(?:png|jpe?g|webp|gif|ttf|otf)$/i;
const SETTING_ASSET_MIME_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
};
const moduleDisposers = new WeakMap();

const assetMimeType = (path) => {
  const extension = path.match(/\.[^.]+$/)?.[0]?.toLowerCase() ?? '';
  return SETTING_ASSET_MIME_TYPES[extension] ?? 'application/octet-stream';
};

const loadSettingAssetModules = async ({ manifest, cacheKey, readBytes }) => {
  const modules = {};
  const objectUrls = [];
  try {
    for (const path of manifest.files.filter((entry) => SETTING_ASSET_EXTENSIONS.test(entry))) {
      const bytes = await readBytes(path);
      let uri;
      if (Platform.OS === 'web' && typeof URL !== 'undefined'
        && typeof URL.createObjectURL === 'function' && typeof Blob !== 'undefined') {
        uri = URL.createObjectURL(new Blob([bytes], { type: assetMimeType(path) }));
        objectUrls.push(uri);
      } else {
        uri = await getCachedSettingFileUri(cacheKey, path);
      }
      if (!uri) throw runtimeError(`could not create a local URI for setting asset ${path}`);
      modules[`setting-asset:${path}`] = { uri };
    }
  } catch (error) {
    objectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
    throw error;
  }
  return {
    modules,
    dispose: () => objectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl)),
  };
};

export const disposeSettingPackageModule = (settingModule) => {
  if (!settingModule || typeof settingModule !== 'object') return;
  const dispose = moduleDisposers.get(settingModule);
  if (!dispose) return;
  moduleDisposers.delete(settingModule);
  dispose();
};

/**
 * Execute the package's explicitly declared, self-contained CommonJS bundle.
 * This is code execution, not a sandbox: callers should invoke it only when the
 * user activates the selected setting. The bundle receives the host API rather
 * than importing app modules through Metro.
 */
const executeSettingBundle = async ({ manifest, cacheKey, readBytes }, engineApi) => {
  const descriptor = manifest.runtime;
  if (!descriptor) throw runtimeError(`setting "${manifest.id}" has no runtime entry`);
  if (!engineApi || typeof engineApi !== 'object') {
    throw runtimeError('an engine API object is required to activate the setting');
  }

  // Контракт проверяется до загрузки ассетов и до исполнения кода пакета:
  // несовместимый пакет не должен ни разу коснуться диска, а пользователь
  // получает причину отказа, а не экран ошибки.
  const declaredHostModules = Object.keys(
    engineApi.modules && typeof engineApi.modules === 'object' ? engineApi.modules : {},
  );
  // Версия runtime-API — та же проверка, что при установке: пакет, собранный под
  // другой контракт, обязан отказать с причиной, а не падать внутри бандла.
  assertSettingCompatibility(
    { manifest, hostModuleIds: declaredHostModules },
    checkRuntimeApi(manifest, SUPPORTED_SETTING_RUNTIME_API_VERSION),
  );

  const { modules: settingAssetModules, dispose } = await loadSettingAssetModules({
    manifest,
    cacheKey,
    readBytes,
  });
  const hostModules = engineApi.modules && typeof engineApi.modules === 'object'
    ? engineApi.modules
    : {};
  const runtimeEngineApi = Object.freeze({
    ...engineApi,
    settingId: engineApi.settingId ?? manifest.id,
    apiVersion: engineApi.apiVersion ?? SUPPORTED_SETTING_RUNTIME_API_VERSION,
    modules: Object.freeze({ ...hostModules, ...settingAssetModules }),
  });
  let source;
  try {
    source = strFromU8(await readBytes(descriptor.entry));
  } catch (error) {
    dispose();
    throw error;
  }
  const module = { exports: {} };
  const requireModule = (moduleId) => {
    if (Object.prototype.hasOwnProperty.call(runtimeEngineApi.modules, moduleId)) {
      return runtimeEngineApi.modules[moduleId];
    }
    throw runtimeError(`runtime requested unavailable host module: ${String(moduleId)}`);
  };

  try {
    const evaluateBundle = new Function(
      'module',
      'exports',
      'engineApi',
      'require',
      `${source}\n//# sourceURL=setting://${manifest.id}/${descriptor.entry}`,
    );
    evaluateBundle(module, module.exports, runtimeEngineApi, requireModule);
  } catch (error) {
    dispose();
    const detail = error instanceof Error ? error.message : String(error);
    throw runtimeError(`could not evaluate runtime entry ${descriptor.entry}: ${detail}`, error);
  }

  const factory = typeof module.exports === 'function'
    ? module.exports
    : module.exports?.default;
  if (typeof factory !== 'function') {
    dispose();
    throw runtimeError(`runtime entry ${descriptor.entry} must export a setting factory`);
  }

  let settingRuntime;
  try {
    settingRuntime = await factory(runtimeEngineApi);
  } catch (error) {
    dispose();
    const detail = error instanceof Error ? error.message : String(error);
    throw runtimeError(`setting factory failed for "${manifest.id}": ${detail}`, error);
  }
  if (!settingRuntime || typeof settingRuntime !== 'object' || Array.isArray(settingRuntime)) {
    dispose();
    throw runtimeError(`setting factory for "${manifest.id}" must return an object`);
  }
  if (settingRuntime.id !== manifest.id) {
    dispose();
    throw runtimeError(
      `runtime id "${String(settingRuntime.id)}" does not match manifest id "${manifest.id}"`,
    );
  }
  if (settingRuntime.manifest && settingRuntime.manifest.id !== manifest.id) {
    dispose();
    throw runtimeError(
      `runtime manifest id "${String(settingRuntime.manifest.id)}" does not match package id "${manifest.id}"`,
    );
  }
  // Объявленные возможности должны быть реально реализованы: «заявил inventory,
  // а services.inventory нет» — это несовместимость, а не сюрприз при торговле.
  const missingServices = checkDeclaredServices({ manifest, services: settingRuntime.services });
  if (missingServices.length > 0) {
    dispose();
    throw new SettingCompatibilityError(missingServices);
  }
  // Экраны сеттинга раскладываются по слотам движка здесь, до рендера:
  // у App не должно быть шанса получить экран без компонента или восьмой экран.
  let screens;
  let theme;
  let globalComponents;
  try {
    screens = normalizeSettingScreens(settingRuntime.screens);
    theme = normalizeSettingTheme(settingRuntime.theme);
    globalComponents = normalizeSettingGlobalComponents(settingRuntime.globalComponents);
  } catch (error) {
    dispose();
    throw error;
  }
  const activeRuntime = { ...settingRuntime, manifest, screens, theme, globalComponents };
  moduleDisposers.set(activeRuntime, () => {
    try {
      if (typeof settingRuntime.dispose === 'function') settingRuntime.dispose();
    } finally {
      dispose();
    }
  });
  return activeRuntime;
};

/**
 * Open an already-cached setting as an allowlisted source. Reading bytes/JSON
 * never evaluates package code; the manifest-declared bundle can be executed
 * only by explicitly calling loadModule(). The factory runs in the app's JS
 * context and is not a security sandbox.
 */
export const openSettingPackageRuntime = async (cacheKey) => {
  const { settingId } = parseCacheKey(cacheKey);
  const manifestBytes = await readCachedSettingFile(cacheKey, 'manifest.json');
  if (!manifestBytes) throw runtimeError(`cached manifest is missing for "${settingId}"`);

  let rawManifest;
  try {
    rawManifest = JSON.parse(strFromU8(manifestBytes));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw runtimeError(`invalid cached manifest.json: ${detail}`);
  }

  let manifest;
  try {
    manifest = validateSettingPackageManifest(rawManifest);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw runtimeError(`invalid cached manifest.json: ${detail}`);
  }
  if (manifest.id !== settingId) {
    throw runtimeError(`manifest.id "${manifest.id}" does not match cache key "${settingId}"`);
  }
  if (manifest.packFormat !== SUPPORTED_SETTING_PACK_FORMAT) {
    throw runtimeError(`unsupported packFormat ${manifest.packFormat}`);
  }

  const allowlist = new Set(manifest.files);
  const assertAllowedPath = (relativePath) => {
    if (!isSafeSettingPackagePath(relativePath)) {
      throw runtimeError(`unsafe package path: ${String(relativePath)}`);
    }
    if (!allowlist.has(relativePath)) {
      throw runtimeError(`file is not declared in manifest.files: ${relativePath}`);
    }
  };

  const readBytes = async (relativePath) => {
    assertAllowedPath(relativePath);
    const bytes = await readCachedSettingFile(cacheKey, relativePath);
    if (!bytes) throw runtimeError(`cached file is missing: ${relativePath}`);
    return bytes;
  };

  const readJson = async (relativePath) => {
    assertAllowedPath(relativePath);
    if (!relativePath.toLowerCase().endsWith('.json')) {
      throw runtimeError(`JSON access requires a .json file: ${relativePath}`);
    }
    const bytes = await readBytes(relativePath);
    try {
      return JSON.parse(strFromU8(bytes));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw runtimeError(`invalid JSON at ${relativePath}: ${detail}`);
    }
  };

  return Object.freeze({
    manifest,
    cacheKey,
    readBytes,
    readJson,
    loadModule: (engineApi) => executeSettingBundle({ manifest, cacheKey, readBytes }, engineApi),
  });
};
