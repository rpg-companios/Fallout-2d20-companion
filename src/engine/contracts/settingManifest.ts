/**
 * Runtime-independent contract for a setting package manifest.
 *
 * This file deliberately depends only on JavaScript primitives: the engine may
 * validate metadata from a bundled setting or from a downloaded .trpg archive
 * without importing that setting's implementation.
 */
export interface SettingManifest {
  id: string;
  name: string;
  version: string | number;
  requiresCore: string;
  defaultLocale: string;
  locales: readonly string[];
  packFormat?: number;
  files?: readonly string[];
  runtime?: SettingRuntimeManifest;
  /** Диапазон версий движка, на котором пакет работает. */
  compatibility?: SettingCompatibilityRange;
  /** Host-модули, без которых пакет не запустится (`engine:*` и npm-пакеты). */
  hostModules?: readonly string[];
  /** Возможности движка, которые пакет использует (см. settingCapabilities.js). */
  capabilities?: readonly string[];
  [extensionField: string]: unknown;
}

/**
 * Жёсткая привязка пакета к версии движка. Оба поля необязательны, но если
 * указаны — проверяются до исполнения кода пакета и несовместимость означает
 * отказ в установке и активации.
 */
export interface SettingCompatibilityRange {
  minimum?: string;
  maximum?: string;
}

/** Manifest fields required after opening a packaged .trpg archive. */
export interface SettingRuntimeManifest {
  /** Runtime contract version understood by the host application. */
  apiVersion: number;
  /** Optional wallet source module compiled by the setting packer. */
  source?: string;
  /** Single self-contained CommonJS bundle entry point inside the wallet. */
  entry: string;
}

export interface SettingPackageManifest extends SettingManifest {
  packFormat: number;
  files: readonly string[];
  runtime?: SettingRuntimeManifest;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const isValidSettingId = (value: unknown): value is string => (
  typeof value === 'string' && /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(value)
);

/**
 * True when a path is a canonical relative path inside a setting wallet.
 * Paths use POSIX separators in manifests regardless of host platform.
 */
export const isSafeSettingPackagePath = (path: unknown): path is string => {
  if (typeof path !== 'string' || path.length === 0 || path.length > 512) return false;
  if (path.startsWith('/') || path.includes('\\') || path.includes('\0')) return false;
  if (/^[A-Za-z]:/.test(path)) return false;

  const segments = path.split('/');
  return segments.every((segment) => (
    segment.length > 0 && segment !== '.' && segment !== '..'
  ));
};

const VERSION_TEXT_RE = /^v?\d+(?:\.\d+){0,2}$/;
const CAPABILITY_ID_RE = /^[a-z][a-z0-9-]{0,63}$/;
const HOST_MODULE_RE = /^(?:engine:[A-Za-z0-9_@./-]+|[a-z0-9@][A-Za-z0-9@._/-]*)$/;

const validateCompatibility = (value: unknown): SettingCompatibilityRange | undefined => {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new Error('[setting-manifest] compatibility must be an object');
  }
  for (const field of ['minimum', 'maximum'] as const) {
    const entry = value[field];
    if (entry === undefined) continue;
    if (typeof entry !== 'string' || !VERSION_TEXT_RE.test(entry.trim())) {
      throw new Error(`[setting-manifest] compatibility.${field} must be a version like "1.0.0"`);
    }
  }
  if (value.minimum === undefined && value.maximum === undefined) {
    throw new Error('[setting-manifest] compatibility must declare minimum or maximum');
  }
  return Object.freeze({
    ...(value.minimum === undefined ? {} : { minimum: String(value.minimum).trim() }),
    ...(value.maximum === undefined ? {} : { maximum: String(value.maximum).trim() }),
  });
};

const validateStringList = (value: unknown, field: string, pattern: RegExp, hint: string): readonly string[] | undefined => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`[setting-manifest] ${field} must be a non-empty array ${hint}`);
  }
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string' || !pattern.test(entry)) {
      throw new Error(`[setting-manifest] ${field} has an invalid entry: ${String(entry)} (${hint})`);
    }
    if (seen.has(entry)) {
      throw new Error(`[setting-manifest] ${field} must not contain duplicates: ${entry}`);
    }
    seen.add(entry);
  }
  return Object.freeze([...seen]);
};

const validateRuntime = (value: unknown): SettingRuntimeManifest | undefined => {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new Error('[setting-manifest] runtime must be an object');
  }

  const { apiVersion, source, entry } = value;
  if (!Number.isInteger(apiVersion) || (apiVersion as number) < 1) {
    throw new Error('[setting-manifest] runtime.apiVersion must be a positive integer');
  }
  if (source !== undefined && !isSafeSettingPackagePath(source)) {
    throw new Error('[setting-manifest] runtime.source must be a safe relative package path');
  }
  if (!isSafeSettingPackagePath(entry)) {
    throw new Error('[setting-manifest] runtime.entry must be a safe relative package path');
  }

  return Object.freeze({
    apiVersion: apiVersion as number,
    ...(source === undefined ? {} : { source }),
    entry,
  });
};

const validateFiles = (value: unknown, required: boolean): readonly string[] | undefined => {
  if (value === undefined && !required) return undefined;
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('[setting-manifest] files must be a non-empty array of relative paths');
  }

  const seen = new Set<string>();
  const files: string[] = [];
  for (const entry of value) {
    if (!isSafeSettingPackagePath(entry)) {
      throw new Error(`[setting-manifest] unsafe package path: ${String(entry)}`);
    }
    if (seen.has(entry)) {
      throw new Error(`[setting-manifest] duplicate package path: ${entry}`);
    }
    seen.add(entry);
    files.push(entry);
  }

  if (required && !seen.has('manifest.json')) {
    throw new Error('[setting-manifest] package files must include manifest.json');
  }

  // Refuse file/directory collisions such as "data" together with "data/items.json".
  for (const path of files) {
    const segments = path.split('/');
    for (let index = 1; index < segments.length; index += 1) {
      const prefix = segments.slice(0, index).join('/');
      if (seen.has(prefix)) {
        throw new Error(`[setting-manifest] file path is also used as a directory: ${prefix}`);
      }
    }
  }

  return Object.freeze(files);
};

/**
 * Validate the manifest metadata shared by bundled settings and .trpg packages.
 * Unknown extension fields are preserved so future package contracts can add
 * declared data categories, screens, and engine-brick references without the
 * core validator silently dropping them.
 */
export const validateSettingManifest = (input: unknown): SettingManifest => {
  if (!isRecord(input)) {
    throw new Error('[setting-manifest] manifest must be a JSON object');
  }

  const errors: string[] = [];
  const { id, name, version, requiresCore, defaultLocale, locales } = input;

  if (!isValidSettingId(id)) {
    errors.push('id must be an ASCII identifier (letters, digits, underscore; max 64 characters)');
  }
  if (typeof name !== 'string' || name.trim().length === 0) {
    errors.push('name must be a non-empty string');
  }
  if (!(
    (typeof version === 'string' && version.trim().length > 0)
    || (typeof version === 'number' && Number.isFinite(version) && version >= 0)
  )) {
    errors.push('version must be a non-empty string or a finite non-negative number');
  }
  if (typeof requiresCore !== 'string' || requiresCore.trim().length === 0) {
    errors.push('requiresCore must be a non-empty string');
  }
  if (typeof defaultLocale !== 'string' || defaultLocale.trim().length === 0) {
    errors.push('defaultLocale must be a non-empty string');
  }
  if (!Array.isArray(locales) || locales.length === 0
    || !locales.every((locale) => typeof locale === 'string' && locale.trim().length > 0)) {
    errors.push('locales must be a non-empty array of non-empty strings');
  } else {
    if (new Set(locales).size !== locales.length) {
      errors.push('locales must not contain duplicates');
    }
    if (typeof defaultLocale === 'string' && !locales.includes(defaultLocale)) {
      errors.push('defaultLocale must be included in locales');
    }
  }

  if (input.packFormat !== undefined
    && (!Number.isInteger(input.packFormat) || (input.packFormat as number) < 1)) {
    errors.push('packFormat must be a positive integer when provided');
  }

  if (errors.length > 0) {
    throw new Error(`[setting-manifest] ${errors.join('; ')}`);
  }

  const files = validateFiles(input.files, false);
  const runtime = validateRuntime(input.runtime);
  const compatibility = validateCompatibility(input.compatibility);
  const hostModules = validateStringList(input.hostModules, 'hostModules', HOST_MODULE_RE, 'module id like "engine:domain/perks"');
  const capabilities = validateStringList(input.capabilities, 'capabilities', CAPABILITY_ID_RE, 'capability id like "inventory"');
  return Object.freeze({
    ...input,
    id: id as string,
    name: name as string,
    version: version as string | number,
    requiresCore: requiresCore as string,
    defaultLocale: defaultLocale as string,
    locales: Object.freeze([...(locales as string[])]),
    ...(input.packFormat === undefined ? {} : { packFormat: input.packFormat as number }),
    ...(files === undefined ? {} : { files }),
    ...(runtime === undefined ? {} : { runtime }),
    ...(compatibility === undefined ? {} : { compatibility }),
    ...(hostModules === undefined ? {} : { hostModules }),
    ...(capabilities === undefined ? {} : { capabilities }),
  }) as SettingManifest;
};

/** Validate the complete manifest embedded in an already-opened .trpg file. */
export const validateSettingPackageManifest = (input: unknown): SettingPackageManifest => {
  const manifest = validateSettingManifest(input);
  if (!Number.isInteger(manifest.packFormat) || (manifest.packFormat as number) < 1) {
    throw new Error('[setting-manifest] packaged manifest requires a positive integer packFormat');
  }
  const files = validateFiles(manifest.files, true);
  if (manifest.runtime && !files?.includes(manifest.runtime.entry)) {
    throw new Error('[setting-manifest] runtime.entry must be declared in manifest.files');
  }
  if (manifest.runtime?.source && !files?.includes(manifest.runtime.source)) {
    throw new Error('[setting-manifest] runtime.source must be declared in manifest.files');
  }
  return Object.freeze({
    ...manifest,
    packFormat: manifest.packFormat as number,
    files: files as readonly string[],
  }) as SettingPackageManifest;
};
