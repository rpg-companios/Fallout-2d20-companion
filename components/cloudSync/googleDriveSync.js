import { debugLog } from '../../src/engine/debug/runtimeTrace.js';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import appConfig from '../../app.json';
import {
  AuthRequest,
  ResponseType,
  makeRedirectUri,
  exchangeCodeAsync,
} from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as db from '../../db';
import { createCharacterExportPayload, parseCharacterImportPayload, sanitizeFileName } from '../../domain/characterTransfer';
import { getActiveModuleId } from '../../domain/moduleLocale';
import { getSettingService } from '../../domain/registry.js';
import { syncAvatars, AVATARS_FOLDER_NAME, avatarFileName } from './avatarSync';
import { validateAvatarDataUrl } from '../../domain/characterAvatar';
import useUserEquipmentStore from '../../src/store/userEquipmentStore';
import {
  USER_EQUIPMENT_FILE_NAMES,
  USER_EQUIPMENT_KINDS,
  getUserEquipmentKindFromFileName,
  makeUserEquipmentDocument,
  validateUserEquipmentDocument,
} from '../../domain/userEquipment.js';
import * as avatarCache from '../../db/avatarCache';

// Хранилище облачных сохранений — appDataFolder (скрытая папка приложения в
// Google Drive): пользователь её НЕ видит в своём Диске, доступ есть только
// у этого приложения. Она предназначена именно для конфигураций и cloud-saves.
// Внутри неё — подпапка с id активного setting-пакета.
const APP_DATA_FOLDER = 'appDataFolder';
const SYNC_KEY = 'setting_cloud_sync_enabled';
const getLegacySyncPreferenceKey = () => getSettingService('cloudSync')?.legacyPreferenceKey ?? null;
// appDataFolder requires the dedicated non-sensitive scope. The former
// drive.metadata.readonly scope is sensitive and is unnecessary here because
// every sync file lives inside the app-specific data space.
const TOKEN_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

let pendingToken = null;
let cachedAccessToken = null;
let cachedAccessTokenExpiresAt = 0;

const TOKEN_EXPIRY_SAFETY_WINDOW_MS = 60 * 1000;

const createOAuthState = () => {
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  return `oauth-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const clearCachedAccessToken = (token = null) => {
  if (!token || cachedAccessToken === token) {
    cachedAccessToken = null;
    cachedAccessTokenExpiresAt = 0;
  }
};

const getClientId = () => {
  // Expo statically inlines direct process.env references; dynamic env-key
  // lookup is not reliable in Metro bundles.
  const sharedClientId = typeof process !== 'undefined'
    ? process.env.EXPO_PUBLIC_GOOGLE_DRIVE_CLIENT_ID
    : null;
  if (Platform.OS === 'ios') {
    return (typeof process !== 'undefined' ? process.env.EXPO_PUBLIC_GOOGLE_DRIVE_IOS_CLIENT_ID : null)
      || sharedClientId;
  }
  if (Platform.OS === 'android') {
    return (typeof process !== 'undefined' ? process.env.EXPO_PUBLIC_GOOGLE_DRIVE_ANDROID_CLIENT_ID : null)
      || sharedClientId;
  }
  return sharedClientId
    || (typeof window !== 'undefined' ? window?.SETTING_GOOGLE_DRIVE_CLIENT_ID : null);
};

const ensureWeb = () => Platform.OS === 'web' && typeof window !== 'undefined';
const isCloudSyncSupported = () => ensureWeb() || Platform.OS === 'ios' || Platform.OS === 'android';
const GOOGLE_OAUTH_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};
WebBrowser.maybeCompleteAuthSession();

const loadGoogleIdentityScript = async () => {
  if (!ensureWeb()) throw new Error('Cloud sync supports only web platform.');
  if (window.google?.accounts?.oauth2) return;

  await new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-google-identity="1"]');
    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Identity script.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentity = '1';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Failed to load Google Identity script.'));
    document.head.appendChild(script);
  });
};

const cacheAccessToken = (accessToken, expiresIn) => {
  cachedAccessToken = accessToken;
  cachedAccessTokenExpiresAt = Date.now() + (Number(expiresIn) || 3600) * 1000;
};

const requestNativeAccessToken = async (clientId) => {
  const applicationId = Platform.OS === 'ios'
    ? appConfig.expo.ios.bundleIdentifier
    : appConfig.expo.android.package;
  const redirectUri = makeRedirectUri({ native: `${applicationId}:/oauthredirect` });
  const request = new AuthRequest({
    clientId,
    redirectUri,
    responseType: ResponseType.Code,
    scopes: [TOKEN_SCOPE],
    usePKCE: true,
  });
  const result = await request.promptAsync(GOOGLE_OAUTH_DISCOVERY);
  if (result.type !== 'success') {
    throw new Error(result.type === 'cancel' || result.type === 'dismiss'
      ? 'Google sign-in was cancelled.'
      : `Google sign-in failed (${result.type}).`);
  }
  if (result.params?.error) throw new Error(result.params.error_description || result.params.error);
  if (result.params?.state !== request.state) throw new Error('Google auth state validation failed.');
  if (!result.params?.code) throw new Error('Google did not return an authorization code.');

  const tokenResponse = await exchangeCodeAsync({
    clientId,
    code: result.params.code,
    redirectUri: request.redirectUri,
    scopes: [TOKEN_SCOPE],
    extraParams: { code_verifier: request.codeVerifier || '' },
  }, GOOGLE_OAUTH_DISCOVERY);
  if (!tokenResponse?.accessToken) throw new Error('Google did not return an access token.');
  cacheAccessToken(tokenResponse.accessToken, tokenResponse.expiresIn);
  debugLog('sync.token:native:ok', { expiresIn: tokenResponse.expiresIn });
  return tokenResponse.accessToken;
};

const requestWebAccessToken = (clientId, forceRefresh) => new Promise((resolve, reject) => {
  const state = createOAuthState();
  const tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: TOKEN_SCOPE,
    // Empty prompt lets Google reuse the existing grant without reopening
    // consent on every full sync.
    prompt: '',
    state,
    callback: (resp) => {
      if (resp?.state && resp.state !== state) {
        reject(new Error('Google auth state validation failed.'));
        return;
      }
      if (resp?.access_token) {
        debugLog('sync.token:ok', { expiresIn: resp.expires_in });
        cacheAccessToken(resp.access_token, resp.expires_in);
        resolve(resp.access_token);
      } else {
        debugLog('sync.token:failed', { error: resp?.error || 'unknown' });
        reject(new Error(resp?.error || 'Google auth failed.'));
      }
    },
    error_callback: (err) => {
      debugLog('sync.token:error', { type: err?.type, message: err?.message, forceRefresh });
      reject(new Error(`Google auth failed: ${err?.type || err?.message || 'unknown'}`));
    },
  });
  tokenClient.requestAccessToken();
});

const requestAccessToken = async ({ forceRefresh = false } = {}) => {
  const clientId = getClientId();
  if (!clientId) {
    const hint = Platform.OS === 'ios'
      ? 'EXPO_PUBLIC_GOOGLE_DRIVE_IOS_CLIENT_ID'
      : Platform.OS === 'android'
        ? 'EXPO_PUBLIC_GOOGLE_DRIVE_ANDROID_CLIENT_ID'
        : 'EXPO_PUBLIC_GOOGLE_DRIVE_CLIENT_ID';
    throw new Error(`Google Drive OAuth client id is not configured. Set ${hint}.`);
  }
  if (!forceRefresh && cachedAccessToken && Date.now() < cachedAccessTokenExpiresAt - TOKEN_EXPIRY_SAFETY_WINDOW_MS) {
    return cachedAccessToken;
  }
  if (pendingToken) return pendingToken;
  if (Platform.OS === 'web' && !ensureWeb()) throw new Error('Browser window is unavailable for Google sign-in.');

  debugLog('sync.token:request', {
    forceRefresh,
    platform: Platform.OS,
    origin: ensureWeb() ? window.location?.origin : null,
  });
  const request = Platform.OS === 'web'
    ? requestWebAccessToken(clientId, forceRefresh)
    : requestNativeAccessToken(clientId);
  pendingToken = request.finally(() => {
    pendingToken = null;
  });
  return pendingToken;
};

const driveFetch = async (token, url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    debugLog('sync.api:error', { status: response.status, url: String(url).slice(0, 120), body: text.slice(0, 300) });
    const error = new Error(`Google Drive API error (${response.status}): ${text}`);
    error.status = response.status;
    if (response.status === 401) clearCachedAccessToken(token);
    throw error;
  }

  return response;
};

// В appDataFolder создаём/находим подпапку текущего сеттинга (модуля).
// Каждый setting-пакет читает только свою подпапку; имя — его id
// (getActiveModuleId), поэтому данные не смешиваются между настройками игры.
const getModuleFolderId = async (token) => {
  const moduleId = getActiveModuleId();
  const q = encodeURIComponent(
    `mimeType='application/vnd.google-apps.folder' and trashed=false and name='${moduleId}'`,
  );
  const listResp = await driveFetch(token, `${DRIVE_API}/files?q=${q}&fields=files(id,name)&spaces=appDataFolder`);
  const listData = await listResp.json();
  if (listData.files?.length) {
    debugLog('sync.folder:found', { moduleId, id: listData.files[0].id });
    return listData.files[0].id;
  }

  const createResp = await driveFetch(token, `${DRIVE_API}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: moduleId,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [APP_DATA_FOLDER],
    }),
  });
  const created = await createResp.json();
  if (!created.id) {
    throw new Error('Не удалось создать подпапку сеттинга в appDataFolder');
  }
  debugLog('sync.folder:created', { moduleId, id: created.id });
  return created.id;
};

const listRemoteCharacterFiles = async (token, folderId) => {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false and mimeType='application/json'`);
  const resp = await driveFetch(token, `${DRIVE_API}/files?q=${q}&fields=files(id,name,modifiedTime)&spaces=appDataFolder&pageSize=200`);
  const data = await resp.json();
  const files = data.files || [];
  debugLog('sync.list:remote', { count: files.length, names: files.map((f) => f.name) });
  return files;
};

const downloadRemoteCharacter = async (token, fileId) => {
  const resp = await driveFetch(token, `${DRIVE_API}/files/${fileId}?alt=media`);
  return resp.text();
};

const uploadCharacterFile = async ({ token, folderId, fileId, filename, payload }) => {
  const metadata = fileId ? null : { name: filename, parents: [folderId], mimeType: 'application/json' };
  const delimiter = '-------setting-cloud-sync';
  const multipartBody = [
    `--${delimiter}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata || {}),
    `--${delimiter}`,
    'Content-Type: application/json',
    '',
    payload,
    `--${delimiter}--`,
  ].join('\r\n');

  const endpoint = fileId
    ? `${UPLOAD_API}/files/${fileId}?uploadType=multipart`
    : `${UPLOAD_API}/files?uploadType=multipart`;

  debugLog('sync.upload', { filename, mode: fileId ? 'update' : 'create', bytes: payload.length });
  await driveFetch(token, endpoint, {
    method: fileId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${delimiter}` },
    body: multipartBody,
  });
};

const ensureUserEquipmentHydrated = async () => {
  const persistence = useUserEquipmentStore.persist;
  if (persistence && !persistence.hasHydrated()) await persistence.rehydrate();
};

// User equipment files live directly beside saves in the existing setting
// folder. No extra Drive folder is created.
const syncUserEquipmentInSession = async (token, folderId) => {
  await ensureUserEquipmentHydrated();
  const settingId = getActiveModuleId();
  const store = useUserEquipmentStore.getState();
  const remoteFiles = await listRemoteCharacterFiles(token, folderId);
  const remoteByKind = new Map();
  for (const file of remoteFiles) {
    const kind = getUserEquipmentKindFromFileName(file.name);
    if (!kind) continue;
    const previous = remoteByKind.get(kind);
    if (!previous || new Date(file.modifiedTime || 0) > new Date(previous.modifiedTime || 0)) {
      remoteByKind.set(kind, file);
    }
  }

  const remoteData = {};
  const invalidKinds = new Set();
  for (const [kind, remote] of remoteByKind) {
    try {
      const raw = await downloadRemoteCharacter(token, remote.id);
      const validated = validateUserEquipmentDocument(raw, {
        expectedSettingId: settingId,
        expectedKind: kind,
        fileName: remote.name,
      });
      if (!validated.ok) {
        invalidKinds.add(kind);
        debugLog('sync.userEquipment:invalidRemote', { kind, errors: validated.errors.map((entry) => entry.code) });
        continue;
      }
      remoteData[kind] = validated.items;
    } catch (error) {
      invalidKinds.add(kind);
      debugLog('sync.userEquipment:downloadFailed', { kind, message: error?.message });
    }
  }

  const mergedData = store.mergeRemoteData({ settingId, remoteData }).data;
  let uploadedKinds = 0;
  for (const kind of USER_EQUIPMENT_KINDS) {
    if (invalidKinds.has(kind)) continue;
    const remote = remoteByKind.get(kind);
    const items = mergedData[kind] || [];
    if (items.length === 0 && !remote) continue;
    const payload = JSON.stringify(makeUserEquipmentDocument({ settingId, kind, items }));
    await uploadCharacterFile({
      token,
      folderId,
      fileId: remote?.id,
      filename: USER_EQUIPMENT_FILE_NAMES[kind],
      payload,
    });
    uploadedKinds += 1;
  }

  const recordCount = USER_EQUIPMENT_KINDS.reduce((sum, kind) => sum + (mergedData[kind]?.length || 0), 0);
  debugLog('sync.userEquipment:done', { records: recordCount, uploadedKinds });
  return { records: recordCount, uploadedKinds, downloadedKinds: remoteData ? Object.keys(remoteData).length : 0 };
};

// Имя файла в Google Drive: <id>__<имя>.json. Часть с именем персонажа
// прогоняем через общий sanitizeFileName (мультиязычный: сохраняет кириллицу/
// акценты/иероглифы, убирает пробелы→_ и небезопасные символы), чтобы имена в
// облаке были такими же аккуратными, как при скачивании. id и .json сохраняются.
const makeRemoteFilename = (character) => {
  const safeName = sanitizeFileName(character?.name || 'character')
    .replace(/\.rpgc$/i, '');
  return `${character.id}__${safeName}.json`;
};

// ─── Аватары персонажей (задел премиум-фичи, патч 193; UI нет) ───────────────
// Файлы лежат РЯДОМ с сейвами: appDataFolder/<сеттинг>/avatars/<characterId>.jpg.
// Синк редкий: только полная синхронизация и (в будущем) первая загрузка
// персонажа на устройстве. Автосейв аватары не трогает.

const findAvatarsFolderId = async (token, moduleFolderId) => {
  const q = encodeURIComponent(
    `mimeType='application/vnd.google-apps.folder' and trashed=false and name='${AVATARS_FOLDER_NAME}' and '${moduleFolderId}' in parents`,
  );
  const listResp = await driveFetch(token, `${DRIVE_API}/files?q=${q}&fields=files(id,name)&spaces=appDataFolder`);
  const listData = await listResp.json();
  return listData.files?.[0]?.id ?? null;
};

const getAvatarsFolderId = async (token, moduleFolderId) => {
  const existingId = await findAvatarsFolderId(token, moduleFolderId);
  if (existingId) return existingId;

  const createResp = await driveFetch(token, `${DRIVE_API}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: AVATARS_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [moduleFolderId],
    }),
  });
  const created = await createResp.json();
  if (!created.id) {
    throw new Error('Не удалось создать подпапку avatars в appDataFolder');
  }
  return created.id;
};

const listAvatarFiles = async (token, avatarsFolderId) => {
  const q = encodeURIComponent(`'${avatarsFolderId}' in parents and trashed=false`);
  const resp = await driveFetch(
    token,
    `${DRIVE_API}/files?q=${q}&fields=files(id,name,md5Checksum,modifiedTime)&spaces=appDataFolder&pageSize=200`,
  );
  const data = await resp.json();
  return data.files || [];
};

// Контент файла — data URL текстом (масштабируется теми же лимитами, что и
// локальный кэш; multipart как у сейвов, но MIME image/jpeg).
const uploadAvatarFile = async ({ token, folderId, fileId, characterId, dataUrl }) => {
  const metadata = fileId ? null : { name: avatarFileName(characterId), parents: [folderId], mimeType: 'image/jpeg' };
  const delimiter = '-------setting-avatar-sync';
  const multipartBody = [
    `--${delimiter}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata || {}),
    `--${delimiter}`,
    'Content-Type: image/jpeg',
    '',
    dataUrl,
    `--${delimiter}--`,
  ].join('\r\n');

  const endpoint = fileId
    ? `${UPLOAD_API}/files/${fileId}?uploadType=multipart`
    : `${UPLOAD_API}/files?uploadType=multipart`;
  const resp = await driveFetch(token, endpoint, {
    method: fileId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${delimiter}` },
    body: multipartBody,
  });
  const parsed = await resp.json();
  return { id: parsed.id ?? null, md5Checksum: parsed.md5Checksum ?? null };
};

const downloadAvatarFile = async (token, fileId) => {
  const resp = await driveFetch(token, `${DRIVE_API}/files/${fileId}?alt=media`);
  return resp.text();
};

const deleteAvatarFile = async (token, fileId) => {
  await driveFetch(token, `${DRIVE_API}/files/${fileId}`, { method: 'DELETE' });
};

// Редкий синк аватаров внутри уже открытой сессии (token/folder есть).
// Падение аватаров не должно ронять синк персонажей — вызывающий ловит.
const syncAvatarsInSession = async (token, moduleFolderId) => {
  return syncAvatars({
    token,
    driveOps: { listAvatarFiles, uploadAvatarFile, downloadAvatarFile, deleteAvatarFile },
    cacheOps: {
      list: avatarCache.listAvatarCache,
      get: avatarCache.getAvatarCache,
      setFromRemote: avatarCache.setAvatarCacheFromRemote,
      updateMd5: avatarCache.updateAvatarCacheMd5,
      delete: avatarCache.deleteAvatarCache,
    },
    listCharacterIds: async () => (await db.getCharactersList()).map((c) => c.id),
    findFolder: () => findAvatarsFolderId(token, moduleFolderId),
    ensureFolder: () => getAvatarsFolderId(token, moduleFolderId),
    validateDataUrl: validateAvatarDataUrl,
  });
};

export const isCloudSyncConfigured = async () => {
  const legacyKey = getLegacySyncPreferenceKey();
  const currentValue = await AsyncStorage.getItem(SYNC_KEY);
  if (currentValue !== null) {
    if (legacyKey && legacyKey !== SYNC_KEY) await AsyncStorage.removeItem(legacyKey);
    return currentValue === '1';
  }
  if (!legacyKey || legacyKey === SYNC_KEY) return false;

  const legacyValue = await AsyncStorage.getItem(legacyKey);
  if (legacyValue === '1') {
    await AsyncStorage.setItem(SYNC_KEY, '1');
    await AsyncStorage.removeItem(legacyKey);
    return true;
  }
  if (legacyValue !== null) await AsyncStorage.removeItem(legacyKey);
  return false;
};

export const setCloudSyncConfigured = async (enabled) => {
  const legacyKey = getLegacySyncPreferenceKey();
  if (enabled) await AsyncStorage.setItem(SYNC_KEY, '1');
  else await AsyncStorage.removeItem(SYNC_KEY);
  if (legacyKey && legacyKey !== SYNC_KEY) await AsyncStorage.removeItem(legacyKey);
};

export const openCloudFolderInDrive = async () => {
  if (!ensureWeb()) return;
  window.open('https://drive.google.com/drive/my-drive', '_blank', 'noopener');
};

export const syncUserEquipmentWithCloud = async () => {
  if (!isCloudSyncSupported()) throw new Error('Google Drive sync is not supported on this platform.');
  if (ensureWeb()) await loadGoogleIdentityScript();
  const token = await requestAccessToken();
  const folderId = await getModuleFolderId(token);
  const stats = await syncUserEquipmentInSession(token, folderId);
  await setCloudSyncConfigured(true);
  return { ...stats, synced: true };
};

export const syncUserEquipmentToCloudIfEnabled = async () => {
  if (!(await isCloudSyncConfigured())) return { synced: false, reason: 'not-configured' };
  return syncUserEquipmentWithCloud();
};

// onProgress({ stage, current, total }) — необязательный колбэк для UI.
// stage: 'auth' | 'folder' | 'list' | 'download' | 'upload' | 'done'.
// Вызовы обёрнуты так, чтобы падение обработчика UI не роняло синхронизацию.
export const syncAllCharactersWithCloud = async ({ confirmDownload, onProgress }) => {
  if (!isCloudSyncSupported()) throw new Error('Google Drive sync is not supported on this platform.');

  const report = (stage, current = 0, total = 0) => {
    debugLog('sync.progress', { stage, current, total });
    try { onProgress?.({ stage, current, total }); } catch (_) {}
  };

  debugLog('sync.all:start', {});
  report('auth');
  if (ensureWeb()) await loadGoogleIdentityScript();
  const token = await requestAccessToken();
  report('folder');
  const folderId = await getModuleFolderId(token);
  // Restore custom catalogs before importing any character save that may refer
  // to user-defined equipment IDs.
  const userEquipmentStats = await syncUserEquipmentInSession(token, folderId);
  report('list');
  const remoteFiles = (await listRemoteCharacterFiles(token, folderId))
    .filter((file) => !getUserEquipmentKindFromFileName(file.name));
  const localList = await db.getCharactersList();
  debugLog('sync.all:local', { count: localList.length });
  const remoteById = new Map();

  for (const file of remoteFiles) {
    const maybeId = (file.name || '').split('__')[0];
    if (maybeId) remoteById.set(maybeId, file);
  }

  const outdatedLocals = [];
  const uploads = [];

  for (const character of localList) {
    const remote = remoteById.get(character.id);
    const localUpdated = Number(character.updatedAt || 0);
    const remoteUpdated = remote?.modifiedTime ? new Date(remote.modifiedTime).getTime() : 0;

    if (remote && remoteUpdated > localUpdated) outdatedLocals.push({ character, remote });
    else uploads.push({ character, remote });
  }

  let downloadedCount = 0;

  // Персонажи из облака, которых ещё нет на этом устройстве, — подтянуть
  // (двусторонний merge: не только обновлять существующих по времени, но и
  // привозить новых с другого устройства).
  const localIds = new Set(localList.map((c) => c.id));
  const newRemoteFiles = remoteFiles.filter((file) => {
    const maybeId = (file.name || '').split('__')[0];
    return maybeId && !localIds.has(maybeId);
  });
  let downloadIndex = 0;
  for (const file of newRemoteFiles) {
    const maybeId = (file.name || '').split('__')[0];
    downloadIndex += 1;
    report('download', downloadIndex, newRemoteFiles.length);
    const raw = await downloadRemoteCharacter(token, file.id);
    const parsed = parseCharacterImportPayload(raw);
    if (parsed.error) continue;
    const imported = parsed.character;
    const id = imported.id || imported.characterId || `char_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    await db.saveCharacter(id, imported.name, imported.level ?? 1, imported.originName ?? null, imported.data);
    downloadedCount += 1;
  }

  if (outdatedLocals.length > 0) {
    const shouldDownload = await confirmDownload(outdatedLocals);
    if (shouldDownload) {
      for (const { remote } of outdatedLocals) {
        const raw = await downloadRemoteCharacter(token, remote.id);
        const parsed = parseCharacterImportPayload(raw);
        if (parsed.error) continue;
        const imported = parsed.character;
        const id = imported.id || imported.characterId || `char_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        await db.saveCharacter(id, imported.name, imported.level ?? 1, imported.originName ?? null, imported.data);
        downloadedCount += 1;
      }
    } else {
      uploads.push(...outdatedLocals);
    }
  }

  let uploadIndex = 0;
  for (const { character, remote } of uploads) {
    uploadIndex += 1;
    report('upload', uploadIndex, uploads.length);
    const full = await db.loadCharacterById(character.id);
    if (!full) continue;
    const payload = JSON.stringify(createCharacterExportPayload(full)); // 361: тело сейва как есть
    await uploadCharacterFile({ token, folderId, fileId: remote?.id, filename: makeRemoteFilename(character), payload });
  }

  await setCloudSyncConfigured(true);

  // Аватары (задел премиум-фичы, UI пока нет): редкий синк — ровно здесь.
  // Пустой кэш → ни одного запроса; сбой аватаров не роняет синк персонажей.
  try {
    const avatarStats = await syncAvatarsInSession(token, folderId);
    debugLog('sync.avatars:done', avatarStats);
  } catch (e) {
    debugLog('sync.avatars:failed', { message: e?.message });
  }

  report('done');
  debugLog('sync.all:done', { uploaded: uploads.length, downloaded: downloadedCount, userEquipmentStats });
  return { uploaded: uploads.length, downloaded: downloadedCount, userEquipment: userEquipmentStats };
};

// Удаление персонажа в облаке. Вызывается ТОЛЬКО после явного подтверждения
// пользователя («удалить везде»), потому что операция необратима и действует
// на все устройства: файл в appDataFolder уносится безвозвратно.
//
// Возвращает { removed, reason }: removed=true, если файл реально удалён.
// Наружу не бросает — удаление в облаке не должно отменять локальное.
export const deleteCharacterFromCloudIfEnabled = async (characterId) => {
  if (!isCloudSyncSupported()) return { removed: false, reason: 'unsupported-platform' };

  try {
    const configured = await isCloudSyncConfigured();
    if (!configured) {
      debugLog('sync.delete:skipped', { characterId, reason: 'not-configured' });
      return { removed: false, reason: 'not-configured' };
    }

    debugLog('sync.delete:start', { characterId });
    if (ensureWeb()) await loadGoogleIdentityScript();
    const token = await requestAccessToken();
    const folderId = await getModuleFolderId(token);
    const remoteFiles = await listRemoteCharacterFiles(token, folderId);
    // Имя файла в облаке: <id>__<имя>.json — ищем по префиксу id, потому что
    // имя персонажа могло измениться после последней выгрузки.
    const remote = remoteFiles.find((file) => (file.name || '').startsWith(`${characterId}__`));

    if (!remote) {
      debugLog('sync.delete:absent', { characterId });
      return { removed: false, reason: 'absent' };
    }

    await driveFetch(token, `${DRIVE_API}/files/${remote.id}`, { method: 'DELETE' });
    debugLog('sync.delete:done', { characterId, fileId: remote.id });

    // Аватар этого персонажа (если был) удаляем лучшими усилиями: сбой
    // удаления фото не должен отменять уже удалённый сейв.
    try {
      const avatarsFolderId = await getAvatarsFolderId(token, folderId);
      const avatarFiles = await listAvatarFiles(token, avatarsFolderId);
      const avatar = avatarFiles.find((file) => file.name === avatarFileName(characterId));
      if (avatar) await deleteAvatarFile(token, avatar.id);
      await avatarCache.deleteAvatarCache(characterId);
    } catch (e) {
      debugLog('sync.delete:avatar-failed', { characterId, message: e?.message });
    }

    return { removed: true };
  } catch (e) {
    const message = e?.message || String(e);
    debugLog('sync.delete:failed', { characterId, message });
    return { removed: false, reason: 'error', message };
  }
};

// Вызывается фоном (без await) из CharacterContext, поэтому обязана быть
// полностью «незаметной»: никогда не бросать наружу — иначе получим
// unhandled promise rejection. Проверка флага тоже внутри try.
export const syncCharacterToCloudIfEnabled = async (characterId) => {
  if (!isCloudSyncSupported()) return;
  // Never open an auth browser from a background autosave on native. A full
  // manual sync or an explicit user-data import performs interactive sign-in.
  if (Platform.OS !== 'web'
    && (!cachedAccessToken || Date.now() >= cachedAccessTokenExpiresAt - TOKEN_EXPIRY_SAFETY_WINDOW_MS)) return;

  try {
    const configured = await isCloudSyncConfigured();
    if (!configured) {
      debugLog('sync.auto:skipped', { characterId, reason: 'not-configured' });
      return;
    }
    debugLog('sync.auto:start', { characterId });

    if (ensureWeb()) await loadGoogleIdentityScript();
    const token = await requestAccessToken();
    const folderId = await getModuleFolderId(token);
    const remoteFiles = await listRemoteCharacterFiles(token, folderId);
    const remote = remoteFiles.find((file) => (file.name || '').startsWith(`${characterId}__`));
    const character = await db.loadCharacterById(characterId);
    if (!character) return;
    const payload = JSON.stringify(createCharacterExportPayload(character)); // 361: тело сейва как есть

    await uploadCharacterFile({ token, folderId, fileId: remote?.id, filename: makeRemoteFilename(character), payload });
    debugLog('sync.auto:done', { characterId });
  } catch (e) {
    debugLog('sync.cloudFailed', { characterId, message: e?.message || String(e) });
  }
};
