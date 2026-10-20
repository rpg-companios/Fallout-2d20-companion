import { CryptoDigestAlgorithm, digest } from 'expo-crypto';
import { cacheSettingPackage } from './settingPackageCache';
import { parseSettingPackageArchive } from './settingPackageArchive';

const bytesToHex = (bytes) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

/**
 * Validate a selected `.trpg`, cache its declared wallet files, and return only
 * an install reference. Installation never executes code. A caller may later
 * explicitly activate a manifest-declared runtime bundle through the package
 * runtime; app screen/catalog wiring is a separate step.
 */
export const installSettingPackage = async ({ name, bytes }, { reservedIds = [] } = {}) => {
  if (typeof name !== 'string' || !name.toLowerCase().endsWith('.trpg')) {
    throw new Error('[setting-package] only .trpg archives are accepted');
  }

  const parsed = parseSettingPackageArchive(bytes);
  if (reservedIds.includes(parsed.manifest.id)) {
    throw new Error(`[setting-package] setting id "${parsed.manifest.id}" is already provided by the app`);
  }

  const digestBuffer = await digest(CryptoDigestAlgorithm.SHA256, bytes);
  const digestHex = bytesToHex(new Uint8Array(digestBuffer));
  const cacheKey = await cacheSettingPackage({
    manifest: parsed.manifest,
    digest: digestHex,
    files: parsed.files,
  });

  return {
    id: parsed.manifest.id,
    name: parsed.manifest.name,
    version: parsed.manifest.version,
    packFormat: parsed.manifest.packFormat,
    requiresCore: parsed.manifest.requiresCore,
    locales: [...parsed.manifest.locales],
    runtime: parsed.manifest.runtime ? { ...parsed.manifest.runtime } : null,
    digest: digestHex,
    cacheKey,
    expandedBytes: parsed.expandedBytes,
    sourceFileName: name,
  };
};

export { deleteCachedSettingPackage, readCachedSettingFile } from './settingPackageCache';
export {
  openSettingPackageRuntime,
  SUPPORTED_SETTING_RUNTIME_API_VERSION,
} from './settingPackageRuntime';
export {
  parseSettingPackageArchive,
  SETTING_PACKAGE_MAX_ARCHIVE_BYTES,
  SETTING_PACKAGE_MAX_EXPANDED_BYTES,
  SETTING_PACKAGE_MAX_ENTRIES,
  SETTING_PACKAGE_MAX_FILE_BYTES,
  SUPPORTED_SETTING_PACK_FORMAT,
} from './settingPackageArchive';
