import { debugLog } from '../../src/debug/falloutDebug';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as db from '../../db';
import { createCharacterExportPayload, parseCharacterImportPayload, sanitizeFileName } from '../../domain/characterTransfer';
import { getActiveModuleId } from '../../domain/moduleLocale';

// Хранилище облачных сохранений — appDataFolder (скрытая папка приложения в
// Google Drive): пользователь её НЕ видит в своём Диске, доступ есть только
// у этого приложения. Она предназначена именно для конфигураций и cloud-saves.
// Внутри неё — подпапка на каждый сеттинг (модуль): fallout/, heroes/, dnd/ …
const APP_DATA_FOLDER = 'appDataFolder';
const SYNC_KEY = 'fallout_cloud_sync_enabled';
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
  if (typeof process !== 'undefined' && process?.env?.EXPO_PUBLIC_GOOGLE_DRIVE_CLIENT_ID) {
    return process.env.EXPO_PUBLIC_GOOGLE_DRIVE_CLIENT_ID;
  }
  if (typeof window !== 'undefined' && window?.FALLOUT_GOOGLE_DRIVE_CLIENT_ID) {
    return window.FALLOUT_GOOGLE_DRIVE_CLIENT_ID;
  }
  return null;
};

const ensureWeb = () => Platform.OS === 'web' && typeof window !== 'undefined';

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

const requestAccessToken = async ({ forceRefresh = false } = {}) => {
  const clientId = getClientId();
  if (!clientId) {
    throw new Error('Google Drive client id is not configured. Set EXPO_PUBLIC_GOOGLE_DRIVE_CLIENT_ID.');
  }
  if (!forceRefresh && cachedAccessToken && Date.now() < cachedAccessTokenExpiresAt - TOKEN_EXPIRY_SAFETY_WINDOW_MS) {
    return cachedAccessToken;
  }
  if (pendingToken) return pendingToken;

  debugLog('sync.token:request', { forceRefresh, origin: window.location?.origin });
  pendingToken = new Promise((resolve, reject) => {
    const state = createOAuthState();
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: TOKEN_SCOPE,
      // Empty prompt lets Google reuse the existing grant. The previous
      // `consent` value forced the warning and account selection on every sync.
      prompt: '',
      state,
      callback: (resp) => {
        if (resp?.state && resp.state !== state) {
          reject(new Error('Google auth state validation failed.'));
          return;
        }
        if (resp?.access_token) {
          debugLog('sync.token:ok', { expiresIn: resp.expires_in });
          cachedAccessToken = resp.access_token;
          cachedAccessTokenExpiresAt = Date.now() + (Number(resp.expires_in) || 3600) * 1000;
          resolve(resp.access_token);
        } else {
          debugLog('sync.token:failed', { error: resp?.error || 'unknown' });
          reject(new Error(resp?.error || 'Google auth failed.'));
        }
      },
      // Раньше причина терялась: GIS передаёт сюда объект с полем type
      // ('popup_closed', 'popup_failed_to_open', ...) — именно он объясняет,
      // почему окно авторизации закрылось без токена.
      error_callback: (err) => {
        debugLog('sync.token:error', { type: err?.type, message: err?.message });
        reject(new Error(`Google auth failed: ${err?.type || err?.message || 'unknown'}`));
      },
    });

    tokenClient.requestAccessToken();
  }).finally(() => {
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
// Каждый сеттинг читает только свою подпапку: сейв fallout не попадёт в
// другой сеттинг и наоборот. Имя подпапки — id модуля (getActiveModuleId).
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
  const delimiter = '-------fallout2d20sync';
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

// Имя файла в Google Drive: <id>__<имя>.json. Часть с именем персонажа
// прогоняем через общий sanitizeFileName (мультиязычный: сохраняет кириллицу/
// акценты/иероглифы, убирает пробелы→_ и небезопасные символы), чтобы имена в
// облаке были такими же аккуратными, как при скачивании. id и .json сохраняются.
const makeRemoteFilename = (character) => {
  const safeName = sanitizeFileName(character?.name || 'character')
    .replace(/\.rpgc$/i, '');
  return `${character.id}__${safeName}.json`;
};

export const isCloudSyncConfigured = async () => (await AsyncStorage.getItem(SYNC_KEY)) === '1';

export const setCloudSyncConfigured = async (enabled) => {
  if (enabled) await AsyncStorage.setItem(SYNC_KEY, '1');
  else await AsyncStorage.removeItem(SYNC_KEY);
};

export const openCloudFolderInDrive = async () => {
  if (!ensureWeb()) return;
  window.open('https://drive.google.com/drive/my-drive', '_blank', 'noopener');
};

// onProgress({ stage, current, total }) — необязательный колбэк для UI.
// stage: 'auth' | 'folder' | 'list' | 'download' | 'upload' | 'done'.
// Вызовы обёрнуты так, чтобы падение обработчика UI не роняло синхронизацию.
export const syncAllCharactersWithCloud = async ({ confirmDownload, onProgress }) => {
  if (!ensureWeb()) throw new Error('Cloud sync supports only web platform.');

  const report = (stage, current = 0, total = 0) => {
    debugLog('sync.progress', { stage, current, total });
    try { onProgress?.({ stage, current, total }); } catch (_) {}
  };

  debugLog('sync.all:start', {});
  report('auth');
  await loadGoogleIdentityScript();
  const token = await requestAccessToken();
  report('folder');
  const folderId = await getModuleFolderId(token);
  report('list');
  const remoteFiles = await listRemoteCharacterFiles(token, folderId);
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
    const payload = JSON.stringify(createCharacterExportPayload(full));
    await uploadCharacterFile({ token, folderId, fileId: remote?.id, filename: makeRemoteFilename(character), payload });
  }

  await setCloudSyncConfigured(true);
  report('done');
  debugLog('sync.all:done', { uploaded: uploads.length, downloaded: downloadedCount });
  return { uploaded: uploads.length, downloaded: downloadedCount };
};

// Вызывается фоном (без await) из CharacterContext, поэтому обязана быть
// полностью «незаметной»: никогда не бросать наружу — иначе получим
// unhandled promise rejection. Проверка флага тоже внутри try.
export const syncCharacterToCloudIfEnabled = async (characterId) => {
  if (!ensureWeb()) return;

  try {
    const configured = await isCloudSyncConfigured();
    if (!configured) {
      debugLog('sync.auto:skipped', { characterId, reason: 'not-configured' });
      return;
    }
    debugLog('sync.auto:start', { characterId });

    await loadGoogleIdentityScript();
    const token = await requestAccessToken();
    const folderId = await getModuleFolderId(token);
    const remoteFiles = await listRemoteCharacterFiles(token, folderId);
    const remote = remoteFiles.find((file) => (file.name || '').startsWith(`${characterId}__`));
    const character = await db.loadCharacterById(characterId);
    if (!character) return;
    const payload = JSON.stringify(createCharacterExportPayload(character));

    await uploadCharacterFile({ token, folderId, fileId: remote?.id, filename: makeRemoteFilename(character), payload });
    debugLog('sync.auto:done', { characterId });
  } catch (e) {
    debugLog('sync.cloudFailed', { characterId, message: e?.message || String(e) });
  }
};
