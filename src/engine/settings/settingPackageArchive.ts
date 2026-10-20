import { strFromU8, unzipSync } from 'fflate';
import {
  isSafeSettingPackagePath,
  validateSettingPackageManifest,
  type SettingPackageManifest,
} from '../contracts/settingManifest';

export const SETTING_PACKAGE_MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
export const SETTING_PACKAGE_MAX_EXPANDED_BYTES = 50 * 1024 * 1024;
export const SETTING_PACKAGE_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const SETTING_PACKAGE_MAX_ENTRIES = 2_000;
export const SUPPORTED_SETTING_PACK_FORMAT = 1;

export interface ParsedSettingPackageFile {
  /** Path relative to the setting wallet root, e.g. `data/weapons.json`. */
  path: string;
  bytes: Uint8Array;
}

export interface ParsedSettingPackage {
  manifest: SettingPackageManifest;
  /** The one root folder inside the zip; must equal `manifest.id`. */
  rootFolder: string;
  expandedBytes: number;
  files: readonly ParsedSettingPackageFile[];
}

interface ArchiveEntryInfo {
  directory: boolean;
  originalSize: number;
  compressedSize: number;
  compression: number;
}

const packageError = (message: string) => new Error(`[setting-package] ${message}`);

const normalizedEntryName = (rawName: string) => {
  const directory = rawName.endsWith('/');
  const name = directory ? rawName.slice(0, -1) : rawName;
  if (!isSafeSettingPackagePath(name)) {
    throw packageError(`unsafe archive path: ${rawName}`);
  }
  return { name, directory };
};

const explain = (error: unknown) => (
  error instanceof Error ? error.message : String(error)
);

/**
 * Inspect and unpack a `.trpg` zip without executing any file from the archive.
 *
 * The first pass reads only the single root manifest and checks central-directory
 * sizes before inflation. The second pass inflates only files named by the
 * manifest allowlist. Setting-owned JS/source files are returned as bytes just
 * like other files; this function never imports or evaluates them.
 */
export const parseSettingPackageArchive = (input: Uint8Array): ParsedSettingPackage => {
  if (!(input instanceof Uint8Array)) {
    throw packageError('archive content must be a Uint8Array');
  }
  if (input.byteLength === 0) throw packageError('archive is empty');
  if (input.byteLength > SETTING_PACKAGE_MAX_ARCHIVE_BYTES) {
    throw packageError(`archive exceeds ${SETTING_PACKAGE_MAX_ARCHIVE_BYTES} bytes`);
  }

  const entries = new Map<string, ArchiveEntryInfo>();
  const manifestPaths: string[] = [];
  let entryCount = 0;
  let expandedBytes = 0;
  let compressedBytes = 0;

  let firstPass: Record<string, Uint8Array>;
  try {
    firstPass = unzipSync(input, {
      filter: (info) => {
        entryCount += 1;
        if (entryCount > SETTING_PACKAGE_MAX_ENTRIES) {
          throw packageError(`archive contains more than ${SETTING_PACKAGE_MAX_ENTRIES} entries`);
        }

        const { name, directory } = normalizedEntryName(info.name);
        if (entries.has(name)) throw packageError(`duplicate archive path: ${name}`);
        if (!Number.isSafeInteger(info.originalSize) || info.originalSize < 0
          || !Number.isSafeInteger(info.size) || info.size < 0) {
          throw packageError(`invalid ZIP size metadata for ${name}`);
        }
        if (!directory) {
          if (info.originalSize > SETTING_PACKAGE_MAX_FILE_BYTES) {
            throw packageError(`file exceeds ${SETTING_PACKAGE_MAX_FILE_BYTES} bytes: ${name}`);
          }
          expandedBytes += info.originalSize;
          compressedBytes += info.size;
          if (expandedBytes > SETTING_PACKAGE_MAX_EXPANDED_BYTES) {
            throw packageError(`expanded archive exceeds ${SETTING_PACKAGE_MAX_EXPANDED_BYTES} bytes`);
          }
          if (compressedBytes > input.byteLength) {
            throw packageError('ZIP compressed-size metadata exceeds archive size');
          }
          if (info.compression !== 0 && info.compression !== 8) {
            throw packageError(`unsupported ZIP compression method ${info.compression}: ${name}`);
          }
        }

        entries.set(name, {
          directory,
          originalSize: info.originalSize,
          compressedSize: info.size,
          compression: info.compression,
        });

        const segments = name.split('/');
        if (!directory && segments.length === 2 && segments[1] === 'manifest.json') {
          manifestPaths.push(name);
          return true;
        }
        return false;
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('[setting-package]')) throw error;
    throw packageError(`invalid ZIP archive: ${explain(error)}`);
  }

  if (manifestPaths.length !== 1) {
    throw packageError('archive must contain exactly one <settingId>/manifest.json at its root');
  }

  const manifestPath = manifestPaths[0];
  const rootFolder = manifestPath.split('/')[0];
  const manifestBytes = firstPass[manifestPath];
  if (!manifestBytes) throw packageError(`could not read ${manifestPath}`);

  let rawManifest: unknown;
  try {
    rawManifest = JSON.parse(strFromU8(manifestBytes));
  } catch (error) {
    throw packageError(`invalid ${manifestPath}: ${explain(error)}`);
  }

  let manifest: SettingPackageManifest;
  try {
    manifest = validateSettingPackageManifest(rawManifest);
  } catch (error) {
    throw packageError(explain(error).replace(/^\[setting-manifest\]\s*/, ''));
  }

  if (manifest.id !== rootFolder) {
    throw packageError(`manifest.id "${manifest.id}" does not match archive folder "${rootFolder}"`);
  }
  if (manifest.files.length > SETTING_PACKAGE_MAX_ENTRIES) {
    throw packageError(`manifest declares more than ${SETTING_PACKAGE_MAX_ENTRIES} files`);
  }
  if (manifest.packFormat !== SUPPORTED_SETTING_PACK_FORMAT) {
    throw packageError(`unsupported packFormat ${manifest.packFormat}; this engine supports ${SUPPORTED_SETTING_PACK_FORMAT}`);
  }

  const allowedArchivePaths = new Set<string>();
  for (const relativePath of manifest.files) {
    const fullPath = `${rootFolder}/${relativePath}`;
    const info = entries.get(fullPath);
    if (!info || info.directory) {
      throw packageError(`declared file is missing from archive: ${relativePath}`);
    }
    allowedArchivePaths.add(fullPath);
  }

  // Do not inflate unlisted archive members. Their declared sizes were still
  // included in the limits above, so an oversized hidden payload is rejected.
  let extracted: Record<string, Uint8Array>;
  try {
    extracted = unzipSync(input, {
      filter: (info) => allowedArchivePaths.has(info.name),
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('[setting-package]')) throw error;
    throw packageError(`could not extract declared files: ${explain(error)}`);
  }

  const files: ParsedSettingPackageFile[] = [];
  for (const relativePath of manifest.files) {
    const fullPath = `${rootFolder}/${relativePath}`;
    const bytes = extracted[fullPath];
    if (!bytes) throw packageError(`could not extract declared file: ${relativePath}`);
    files.push({ path: relativePath, bytes });
  }

  return {
    manifest,
    rootFolder,
    expandedBytes,
    files,
  };
};
