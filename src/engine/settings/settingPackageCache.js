import { Platform } from 'react-native';
import { isSafeSettingPackagePath } from '../contracts/settingManifest';

const DB_NAME = 'positronium-setting-wallets';
const DB_VERSION = 1;
const DB_STORE = 'wallets';
const SETTING_ID_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const DIGEST_RE = /^[a-f0-9]{64}$/;

const validateCacheKey = (cacheKey) => {
  if (typeof cacheKey !== 'string') throw new Error('[setting-cache] invalid cache key');
  const [settingId, digest, extra] = cacheKey.split('/');
  if (extra !== undefined || !SETTING_ID_RE.test(settingId ?? '') || !DIGEST_RE.test(digest ?? '')) {
    throw new Error('[setting-cache] invalid cache key');
  }
  return { settingId, digest };
};

const database = () => new Promise((resolve, reject) => {
  if (typeof indexedDB === 'undefined') {
    reject(new Error('[setting-cache] IndexedDB is unavailable'));
    return;
  }
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(DB_STORE)) {
      db.createObjectStore(DB_STORE, { keyPath: 'cacheKey' });
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error('[setting-cache] could not open IndexedDB'));
});

const runIndexedDbTransaction = async (mode, run) => {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(DB_STORE, mode);
      const store = transaction.objectStore(DB_STORE);
      let result;
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error ?? new Error('[setting-cache] IndexedDB transaction failed'));
      transaction.onabort = () => reject(transaction.error ?? new Error('[setting-cache] IndexedDB transaction aborted'));
      try {
        result = run(store);
      } catch (error) {
        transaction.abort();
        reject(error);
      }
    });
  } finally {
    db.close();
  }
};

const validateCachePayload = ({ manifest, digest, files }) => {
  if (!manifest || !SETTING_ID_RE.test(manifest.id ?? '') || !DIGEST_RE.test(digest ?? '')) {
    throw new Error('[setting-cache] invalid package identity');
  }
  if (!Array.isArray(manifest.files) || !Array.isArray(files) || files.length !== manifest.files.length) {
    throw new Error('[setting-cache] file list does not match the manifest allowlist');
  }
  const expectedPaths = new Set(manifest.files);
  if (!expectedPaths.has('manifest.json')) {
    throw new Error('[setting-cache] manifest allowlist must include manifest.json');
  }
  const actualPaths = new Set();
  if (expectedPaths.size !== manifest.files.length) {
    throw new Error('[setting-cache] manifest allowlist contains duplicate paths');
  }
  for (const file of files) {
    if (!file || !isSafeSettingPackagePath(file.path) || !(file.bytes instanceof Uint8Array)
      || actualPaths.has(file.path) || !expectedPaths.has(file.path)) {
      throw new Error('[setting-cache] invalid or duplicate wallet file');
    }
    actualPaths.add(file.path);
  }
  if (manifest.files.some((path) => !isSafeSettingPackagePath(path)) || actualPaths.size !== expectedPaths.size) {
    throw new Error('[setting-cache] file list does not match the manifest allowlist');
  }
};

const writeWebCache = ({ cacheKey, manifest, files, digest }) => runIndexedDbTransaction(
  'readwrite',
  (store) => store.put({
    cacheKey,
    settingId: manifest.id,
    version: manifest.version,
    digest,
    manifest,
    files: files.map(({ path, bytes }) => ({ path, bytes: bytes.slice() })),
    cachedAt: Date.now(),
  }),
);

const readWebRecord = async (cacheKey) => {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(DB_STORE, 'readonly');
      const request = transaction.objectStore(DB_STORE).get(cacheKey);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error ?? new Error('[setting-cache] could not read package cache'));
    });
  } finally {
    db.close();
  }
};

const deleteWebCache = (cacheKey) => runIndexedDbTransaction('readwrite', (store) => {
  store.delete(cacheKey);
  return undefined;
});

const writeNativeCache = async ({ cacheKey, files, digest }) => {
  const { Directory, File, Paths } = await import('expo-file-system');
  const { settingId } = validateCacheKey(cacheKey);
  const settingRoot = new Directory(Paths.document, 'setting-packs', settingId);
  settingRoot.create({ intermediates: true, idempotent: true });

  const finalDirectory = new Directory(settingRoot, digest);
  if (finalDirectory.exists) return;

  const stageDirectory = new Directory(settingRoot, `.stage-${digest}`);
  if (stageDirectory.exists) stageDirectory.delete();
  stageDirectory.create();

  try {
    for (const { path, bytes } of files) {
      const parts = path.split('/');
      const file = new File(stageDirectory, ...parts);
      file.create({ intermediates: true, overwrite: true });
      file.write(bytes);
    }

    await stageDirectory.move(finalDirectory);
  } catch (error) {
    if (stageDirectory.exists) stageDirectory.delete();
    if (finalDirectory.exists) return;
    throw error;
  }
};

const readNativeFile = async (cacheKey, relativePath) => {
  const { Directory, File, Paths } = await import('expo-file-system');
  const { settingId, digest } = validateCacheKey(cacheKey);
  const path = relativePath.split('/');
  const file = new File(new Directory(Paths.document, 'setting-packs', settingId, digest), ...path);
  if (!file.exists) return null;
  return file.bytes();
};

const deleteNativeCache = async (cacheKey) => {
  const { Directory, Paths } = await import('expo-file-system');
  const { settingId, digest } = validateCacheKey(cacheKey);
  const directory = new Directory(Paths.document, 'setting-packs', settingId, digest);
  if (directory.exists) directory.delete();
};

export const cacheSettingPackage = async ({ manifest, digest, files }) => {
  validateCachePayload({ manifest, digest, files });
  const cacheKey = `${manifest.id}/${digest}`;
  validateCacheKey(cacheKey);
  if (Platform.OS === 'web') {
    await writeWebCache({ cacheKey, manifest, digest, files });
  } else {
    await writeNativeCache({ cacheKey, manifest, digest, files });
  }
  return cacheKey;
};

export const readCachedSettingFile = async (cacheKey, relativePath) => {
  validateCacheKey(cacheKey);
  if (!isSafeSettingPackagePath(relativePath)) {
    throw new Error('[setting-cache] safe relative file path is required');
  }
  if (Platform.OS !== 'web') return readNativeFile(cacheKey, relativePath);

  const record = await readWebRecord(cacheKey);
  if (!record) return null;
  const file = record.files.find((entry) => entry.path === relativePath);
  return file?.bytes ? new Uint8Array(file.bytes) : null;
};

/** Return the already-cached native file URI for React Native image/font sources. */
export const getCachedSettingFileUri = async (cacheKey, relativePath) => {
  validateCacheKey(cacheKey);
  if (!isSafeSettingPackagePath(relativePath)) {
    throw new Error('[setting-cache] safe relative file path is required');
  }
  if (Platform.OS === 'web') return null;

  const { Directory, File, Paths } = await import('expo-file-system');
  const { settingId, digest } = validateCacheKey(cacheKey);
  const file = new File(
    new Directory(Paths.document, 'setting-packs', settingId, digest),
    ...relativePath.split('/'),
  );
  return file.exists ? file.uri : null;
};

export const deleteCachedSettingPackage = async (cacheKey) => {
  validateCacheKey(cacheKey);
  if (Platform.OS === 'web') return deleteWebCache(cacheKey);
  return deleteNativeCache(cacheKey);
};
