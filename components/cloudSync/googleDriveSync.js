import { debugLog } from '../../src/debug/falloutDebug';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as db from '../../db';
import { createCharacterExportPayload, parseCharacterImportPayload, sanitizeFileName } from '../../domain/characterTransfer';
import { isGmCampaignsLicensed, isGmEnvCombatLicensed, isGmLootTradeLicensed } from '../../domain/premium';
import { normalizeContainerEntity } from '../../domain/lootTrade';
import { normalizeGmEnvEntry } from '../../domain/envCombatPresets';
import { getActiveModuleId } from '../../domain/moduleLocale';
import { syncAvatars, AVATARS_FOLDER_NAME, avatarFileName } from './avatarSync';
import { validateAvatarDataUrl } from '../../domain/characterAvatar';
import * as avatarCache from '../../db/avatarCache';

const GM_CONTAINERS_FOLDER_NAME = 'gm_containers';
const GM_ROOMS_FOLDER_NAME = 'gm_rooms';
const GM_ENV_ENTRIES_FOLDER_NAME = 'gm_env_entries';

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

const makeRemoteGmContainerFilename = (container) => {
  const safeName = sanitizeFileName(container?.name || 'container')
    .replace(/\.rpgc$/i, '');
  return `${container.id}__${safeName}.json`;
};

const findGmContainersFolderId = async (token, moduleFolderId) => {
  const q = encodeURIComponent(
    `mimeType='application/vnd.google-apps.folder' and trashed=false and name='${GM_CONTAINERS_FOLDER_NAME}' and '${moduleFolderId}' in parents`,
  );
  const listResp = await driveFetch(token, `${DRIVE_API}/files?q=${q}&fields=files(id,name)&spaces=appDataFolder`);
  const listData = await listResp.json();
  return listData.files?.[0]?.id ?? null;
};

const getGmContainersFolderId = async (token, moduleFolderId) => {
  const existingId = await findGmContainersFolderId(token, moduleFolderId);
  if (existingId) return existingId;

  const createResp = await driveFetch(token, `${DRIVE_API}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: GM_CONTAINERS_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [moduleFolderId],
    }),
  });
  const created = await createResp.json();
  if (!created.id) {
    throw new Error('Не удалось создать подпапку gm_containers в appDataFolder');
  }
  return created.id;
};

const parseGmContainerCloudPayload = (rawText) => {
  try {
    const parsed = typeof rawText === 'string' ? JSON.parse(rawText) : rawText;
    const body = parsed?.container && typeof parsed.container === 'object'
      ? parsed.container
      : parsed;
    if (!body || typeof body !== 'object' || !body.id || !body.name) {
      return { error: 'INVALID_CONTAINER' };
    }
    return { container: normalizeContainerEntity(body) };
  } catch {
    return { error: 'INVALID_JSON' };
  }
};

const syncGmContainersInSession = async (token, moduleFolderId, { confirmDownload } = {}) => {
  if (!isGmLootTradeLicensed()) {
    return { uploaded: 0, downloaded: 0 };
  }
  const localContainers = typeof db.getGmContainersList === 'function'
    ? await db.getGmContainersList()
    : [];
  const existingFolderId = await findGmContainersFolderId(token, moduleFolderId);
  if (!existingFolderId && localContainers.length === 0) {
    return { uploaded: 0, downloaded: 0 };
  }

  const gmFolderId = existingFolderId || await getGmContainersFolderId(token, moduleFolderId);
  const remoteFiles = await listRemoteCharacterFiles(token, gmFolderId);
  const remoteById = new Map();
  for (const file of remoteFiles) {
    const maybeId = (file.name || '').split('__')[0];
    if (maybeId) remoteById.set(maybeId, file);
  }

  const outdatedLocals = [];
  const uploads = [];

  for (const container of localContainers) {
    const remote = remoteById.get(container.id);
    const localUpdated = Number(container.updatedAt || 0);
    const remoteUpdated = remote?.modifiedTime ? new Date(remote.modifiedTime).getTime() : 0;
    if (remote && remoteUpdated > localUpdated + 1000) {
      outdatedLocals.push({ container, remote });
    } else {
      uploads.push({ container, remote });
    }
  }

  let downloadedCount = 0;
  const localIds = new Set(localContainers.map((c) => c.id));
  const newRemoteFiles = remoteFiles.filter((file) => {
    const maybeId = (file.name || '').split('__')[0];
    return maybeId && !localIds.has(maybeId);
  });

  for (const file of newRemoteFiles) {
    const raw = await downloadRemoteCharacter(token, file.id);
    const parsed = parseGmContainerCloudPayload(raw);
    if (parsed.error || !parsed.container) continue;
    await db.saveGmContainer(parsed.container, { preserveUpdatedAt: true });
    downloadedCount += 1;
  }

  if (outdatedLocals.length > 0) {
    const shouldDownload = typeof confirmDownload === 'function'
      ? await confirmDownload(outdatedLocals)
      : true;
    if (shouldDownload) {
      for (const { remote } of outdatedLocals) {
        const raw = await downloadRemoteCharacter(token, remote.id);
        const parsed = parseGmContainerCloudPayload(raw);
        if (parsed.error || !parsed.container) continue;
        await db.saveGmContainer(parsed.container, { preserveUpdatedAt: true });
        downloadedCount += 1;
      }
    } else {
      uploads.push(...outdatedLocals);
    }
  }

  for (const { container, remote } of uploads) {
    const fresh = await db.getGmContainerById(container.id);
    if (!fresh) continue;
    const payload = JSON.stringify({
      formatVersion: 1,
      type: 'gm_container',
      exportedAt: Date.now(),
      container: fresh,
    });
    await uploadCharacterFile({
      token,
      folderId: gmFolderId,
      fileId: remote?.id,
      filename: makeRemoteGmContainerFilename(fresh),
      payload,
    });
  }

  return { uploaded: uploads.length, downloaded: downloadedCount };
};

// ─── Сохранённые плитки и папки «Окружающая среда/бой» (gm_env_entries) ─────

const makeRemoteGmEnvEntryFilename = (entry) => {
  const safeName = sanitizeFileName(entry?.name || 'env_preset')
    .replace(/\.rpgc$/i, '');
  return `${entry.id}__${safeName}.json`;
};

const findGmEnvEntriesFolderId = async (token, moduleFolderId) => {
  const q = encodeURIComponent(
    `mimeType='application/vnd.google-apps.folder' and trashed=false and name='${GM_ENV_ENTRIES_FOLDER_NAME}' and '${moduleFolderId}' in parents`,
  );
  const listResp = await driveFetch(token, `${DRIVE_API}/files?q=${q}&fields=files(id,name)&spaces=appDataFolder`);
  const listData = await listResp.json();
  return listData.files?.[0]?.id ?? null;
};

const getGmEnvEntriesFolderId = async (token, moduleFolderId) => {
  const existingId = await findGmEnvEntriesFolderId(token, moduleFolderId);
  if (existingId) return existingId;

  const createResp = await driveFetch(token, `${DRIVE_API}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: GM_ENV_ENTRIES_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [moduleFolderId],
    }),
  });
  const created = await createResp.json();
  if (!created.id) {
    throw new Error('Не удалось создать подпапку gm_env_entries в appDataFolder');
  }
  return created.id;
};

const parseGmEnvEntryCloudPayload = (rawText) => {
  try {
    const parsed = typeof rawText === 'string' ? JSON.parse(rawText) : rawText;
    const body = parsed?.entry && typeof parsed.entry === 'object'
      ? parsed.entry
      : parsed;
    if (!body || typeof body !== 'object' || !body.id || !body.name) {
      return { error: 'INVALID_GM_ENV_ENTRY' };
    }
    return { entry: normalizeGmEnvEntry(body) };
  } catch {
    return { error: 'INVALID_JSON' };
  }
};

const syncGmEnvEntriesInSession = async (token, moduleFolderId, { confirmDownload } = {}) => {
  if (!isGmEnvCombatLicensed()) {
    return { uploaded: 0, downloaded: 0 };
  }
  const localEntries = typeof db.getGmEnvEntriesList === 'function'
    ? await db.getGmEnvEntriesList()
    : [];
  const existingFolderId = await findGmEnvEntriesFolderId(token, moduleFolderId);
  if (!existingFolderId && localEntries.length === 0) {
    return { uploaded: 0, downloaded: 0 };
  }

  const gmEnvFolderId = existingFolderId || await getGmEnvEntriesFolderId(token, moduleFolderId);
  const remoteFiles = await listRemoteCharacterFiles(token, gmEnvFolderId);
  const remoteById = new Map();
  for (const file of remoteFiles) {
    const maybeId = (file.name || '').split('__')[0];
    if (maybeId) remoteById.set(maybeId, file);
  }

  const outdatedLocals = [];
  const uploads = [];

  for (const entry of localEntries) {
    const remote = remoteById.get(entry.id);
    const localUpdated = Number(entry.updatedAt || 0);
    const remoteUpdated = remote?.modifiedTime ? new Date(remote.modifiedTime).getTime() : 0;
    if (remote && remoteUpdated > localUpdated + 1000) {
      outdatedLocals.push({ entry, remote });
    } else {
      uploads.push({ entry, remote });
    }
  }

  let downloadedCount = 0;
  const localIds = new Set(localEntries.map((e) => e.id));
  const newRemoteFiles = remoteFiles.filter((file) => {
    const maybeId = (file.name || '').split('__')[0];
    return maybeId && !localIds.has(maybeId);
  });

  for (const file of newRemoteFiles) {
    const raw = await downloadRemoteCharacter(token, file.id);
    const parsed = parseGmEnvEntryCloudPayload(raw);
    if (parsed.error || !parsed.entry) continue;
    await db.saveGmEnvEntry(parsed.entry, { preserveUpdatedAt: true });
    downloadedCount += 1;
  }

  if (outdatedLocals.length > 0) {
    const shouldDownload = typeof confirmDownload === 'function'
      ? await confirmDownload(outdatedLocals)
      : true;
    if (shouldDownload) {
      for (const { remote } of outdatedLocals) {
        const raw = await downloadRemoteCharacter(token, remote.id);
        const parsed = parseGmEnvEntryCloudPayload(raw);
        if (parsed.error || !parsed.entry) continue;
        await db.saveGmEnvEntry(parsed.entry, { preserveUpdatedAt: true });
        downloadedCount += 1;
      }
    } else {
      uploads.push(...outdatedLocals);
    }
  }

  for (const { entry, remote } of uploads) {
    const fresh = await db.getGmEnvEntryById(entry.id);
    if (!fresh) continue;
    const payload = JSON.stringify({
      formatVersion: 1,
      type: 'gm_env_entry',
      exportedAt: Date.now(),
      entry: fresh,
    });
    await uploadCharacterFile({
      token,
      folderId: gmEnvFolderId,
      fileId: remote?.id,
      filename: makeRemoteGmEnvEntryFilename(fresh),
      payload,
    });
  }

  return { uploaded: uploads.length, downloaded: downloadedCount };
};

// ─── Комнаты кампаний Мастера (gm_rooms в appDataFolder/<сеттинг>/gm_rooms/) ──
// Позволяет Мастеру синхронизировать созданные комнаты вместе с owner_token
// между разными браузерами и режимами запуска (например, PWA <-> Replit).
// Каждая импортированная комната сразу получает запись в folder_rooms, поэтому
// отображается строго в разделе «Админ» и никогда не попадает в «Пользователь».

const makeRemoteGmRoomFilename = (room) => {
  const safeName = sanitizeFileName(room?.name || room?.code || 'room')
    .replace(/\.rpgc$/i, '');
  return `${room.folderId}__${safeName}.json`;
};

const findGmRoomsFolderId = async (token, moduleFolderId) => {
  const q = encodeURIComponent(
    `mimeType='application/vnd.google-apps.folder' and trashed=false and name='${GM_ROOMS_FOLDER_NAME}' and '${moduleFolderId}' in parents`,
  );
  const listResp = await driveFetch(token, `${DRIVE_API}/files?q=${q}&fields=files(id,name)&spaces=appDataFolder`);
  const listData = await listResp.json();
  return listData.files?.[0]?.id ?? null;
};

const getGmRoomsFolderId = async (token, moduleFolderId) => {
  const existingId = await findGmRoomsFolderId(token, moduleFolderId);
  if (existingId) return existingId;

  const createResp = await driveFetch(token, `${DRIVE_API}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: GM_ROOMS_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [moduleFolderId],
    }),
  });
  const created = await createResp.json();
  if (!created.id) {
    throw new Error('Не удалось создать подпапку gm_rooms в appDataFolder');
  }
  return created.id;
};

const listLocalGmRooms = async () => {
  if (typeof db.getFolderRooms !== 'function' || typeof db.getCharacterFolders !== 'function') {
    return [];
  }
  const [roomRows, folders] = await Promise.all([
    db.getFolderRooms(),
    db.getCharacterFolders(),
  ]);
  const folderById = new Map((folders || []).map((f) => [f.id, f]));
  return (roomRows || [])
    .filter((row) => row?.folder_id && row?.code && row?.owner_token)
    .map((row) => {
      const folder = folderById.get(row.folder_id);
      return {
        folderId: String(row.folder_id),
        name: String(folder?.name || row.code).trim() || String(row.code),
        code: String(row.code),
        ownerToken: String(row.owner_token),
        updatedAt: Number(folder?.updatedAt || folder?.createdAt || 0),
      };
    });
};

const parseGmRoomCloudPayload = (rawText) => {
  try {
    const parsed = typeof rawText === 'string' ? JSON.parse(rawText) : rawText;
    const body = parsed?.room && typeof parsed.room === 'object' ? parsed.room : parsed;
    if (!body || typeof body !== 'object' || !body.folderId || !body.code || !body.ownerToken) {
      return { error: 'INVALID_GM_ROOM' };
    }
    return {
      room: {
        folderId: String(body.folderId),
        name: String(body.name || body.code).trim() || String(body.code),
        code: String(body.code),
        ownerToken: String(body.ownerToken),
        updatedAt: Number(body.updatedAt || 0),
      },
    };
  } catch {
    return { error: 'INVALID_JSON' };
  }
};

const saveImportedGmRoom = async (room, localRoomsByCode) => {
  const existingSameCode = localRoomsByCode.get(room.code);
  const targetFolderId = existingSameCode ? existingSameCode.folderId : room.folderId;
  await db.ensureCharacterFolder({ id: targetFolderId, name: room.name });
  if (typeof db.renameCharacterFolder === 'function') {
    await db.renameCharacterFolder(targetFolderId, room.name);
  }
  await db.upsertFolderRoom(targetFolderId, room.code, room.ownerToken);
  localRoomsByCode.set(room.code, { ...room, folderId: targetFolderId });
};

const syncGmRoomsInSession = async (token, moduleFolderId, { confirmDownload } = {}) => {
  if (!isGmCampaignsLicensed()) {
    return { uploaded: 0, downloaded: 0 };
  }
  const localRooms = await listLocalGmRooms();
  const existingFolderId = await findGmRoomsFolderId(token, moduleFolderId);
  if (!existingFolderId && localRooms.length === 0) {
    return { uploaded: 0, downloaded: 0 };
  }

  const gmRoomsFolderId = existingFolderId || await getGmRoomsFolderId(token, moduleFolderId);
  const remoteFiles = await listRemoteCharacterFiles(token, gmRoomsFolderId);
  const remoteById = new Map();
  for (const file of remoteFiles) {
    const maybeId = (file.name || '').split('__')[0];
    if (maybeId) remoteById.set(maybeId, file);
  }

  const localRoomsByCode = new Map(localRooms.map((r) => [r.code, r]));
  const outdatedLocals = [];
  const uploads = [];

  for (const room of localRooms) {
    const remote = remoteById.get(room.folderId);
    const localUpdated = Number(room.updatedAt || 0);
    const remoteUpdated = remote?.modifiedTime ? new Date(remote.modifiedTime).getTime() : 0;
    if (remote && remoteUpdated > localUpdated + 1000) {
      outdatedLocals.push({ room, remote });
    } else {
      uploads.push({ room, remote });
    }
  }

  let downloadedCount = 0;
  const localIds = new Set(localRooms.map((r) => r.folderId));
  const newRemoteFiles = remoteFiles.filter((file) => {
    const maybeId = (file.name || '').split('__')[0];
    return maybeId && !localIds.has(maybeId);
  });

  for (const file of newRemoteFiles) {
    const raw = await downloadRemoteCharacter(token, file.id);
    const parsed = parseGmRoomCloudPayload(raw);
    if (parsed.error || !parsed.room) continue;
    await saveImportedGmRoom(parsed.room, localRoomsByCode);
    downloadedCount += 1;
  }

  if (outdatedLocals.length > 0) {
    const shouldDownload = typeof confirmDownload === 'function'
      ? await confirmDownload(outdatedLocals)
      : true;
    if (shouldDownload) {
      for (const { remote } of outdatedLocals) {
        const raw = await downloadRemoteCharacter(token, remote.id);
        const parsed = parseGmRoomCloudPayload(raw);
        if (parsed.error || !parsed.room) continue;
        await saveImportedGmRoom(parsed.room, localRoomsByCode);
        downloadedCount += 1;
      }
    } else {
      uploads.push(...outdatedLocals);
    }
  }

  for (const { room, remote } of uploads) {
    const payload = JSON.stringify({
      formatVersion: 1,
      type: 'gm_room',
      exportedAt: Date.now(),
      room,
    });
    await uploadCharacterFile({
      token,
      folderId: gmRoomsFolderId,
      fileId: remote?.id,
      filename: makeRemoteGmRoomFilename(room),
      payload,
    });
  }

  return { uploaded: uploads.length, downloaded: downloadedCount };
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
// локальный кэш; multipart как у сейвов, но MIME может быть image/jpeg, image/png, image/gif).
const uploadAvatarFile = async ({ token, folderId, fileId, characterId, dataUrl, mimeType = 'image/jpeg' }) => {
  const fileName = avatarFileName(characterId, mimeType);
  const metadata = fileId ? null : { name: fileName, parents: [folderId], mimeType };
  const delimiter = '-------fallout2d20avatar';
  
  // Извлекаем base64 из data URL
  const base64Match = dataUrl.match(/^data:image\/[^;]+;base64,(.+)$/);
  const base64Data = base64Match ? base64Match[1] : dataUrl;
  
  const multipartBody = [
    `--${delimiter}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata || {}),
    `--${delimiter}`,
    `Content-Type: ${mimeType}`,
    '',
    base64Data,
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

/**
 * Загрузить один аватар в Google Drive.
 * Используется для автосинхронизации при изменении картинки персонажа.
 */
export const syncCharacterAvatarToCloud = async (characterId) => {
  if (!ensureWeb()) {
    // На нативных платформах облачная синхронизация не поддерживается
    return;
  }

  try {
    const token = await requestAccessToken();
    const moduleFolderId = await getModuleFolderId(token);
    const avatarsFolderId = await getAvatarsFolderId(token, moduleFolderId);
    
    // Получаем аватар из кэша
    const avatarRow = await avatarCache.getAvatarCache(characterId);
    if (!avatarRow?.data_url && !avatarRow?.dataUrl) {
      debugLog('sync.avatar:notFound', { characterId });
      return;
    }

    const dataUrl = avatarRow.data_url || avatarRow.dataUrl;
    
    // Проверяем валидность
    const validation = validateAvatarDataUrl(dataUrl);
    if (!validation.ok) {
      debugLog('sync.avatar:invalid', { characterId, reason: validation.reason });
      return;
    }

    // Определяем MIME-тип из кэша
    const mimeType = avatarRow.mime_type || avatarRow.mimeType || 'image/jpeg';
    
    // Проверяем, есть ли уже файл в Drive (ищем по characterId с любым расширением)
    const avatarFiles = await listAvatarFiles(token, avatarsFolderId);
    const existingFile = avatarFiles.find((f) => {
      const parsed = parseAvatarFileName(f.name);
      return parsed?.characterId === characterId;
    });

    // Загружаем или обновляем
    const result = await uploadAvatarFile({
      token,
      folderId: avatarsFolderId,
      fileId: existingFile?.id || null,
      characterId,
      dataUrl,
      mimeType,
    });

    // Обновляем md5 в кэше
    if (result?.md5Checksum) {
      await avatarCache.updateAvatarCacheMd5(characterId, result.md5Checksum);
    }

    debugLog('sync.avatar:uploaded', { characterId, fileId: result?.id });
  } catch (e) {
    debugLog('sync.avatar:failed', { characterId, message: e?.message });
    throw e;
  }
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
    const payload = JSON.stringify(createCharacterExportPayload(full)); // 361: тело сейва как есть
    await uploadCharacterFile({ token, folderId, fileId: remote?.id, filename: makeRemoteFilename(character), payload });
  }

  await setCloudSyncConfigured(true);

  // Комнаты кампаний Мастера (патч 479): двусторонняя синхронизация вместе с owner_token
  // в подпапке appDataFolder/<сеттинг>/gm_rooms/, чтобы Replit и PWA видели одни и те же комнаты.
  let gmRoomsUploaded = 0;
  let gmRoomsDownloaded = 0;
  try {
    const gmRoomStats = await syncGmRoomsInSession(token, folderId, { confirmDownload });
    gmRoomsUploaded = gmRoomStats.uploaded || 0;
    gmRoomsDownloaded = gmRoomStats.downloaded || 0;
    debugLog('sync.gmRooms:done', gmRoomStats);
  } catch (e) {
    debugLog('sync.gmRooms:failed', { message: e?.message });
  }

  // Контейнеры и торговцы Мастера («Добыча/Торговля», патч 468): двусторонняя
  // синхронизация в подпапке appDataFolder/<сеттинг>/gm_containers/.
  let gmUploaded = 0;
  let gmDownloaded = 0;
  try {
    const gmStats = await syncGmContainersInSession(token, folderId, { confirmDownload });
    gmUploaded = gmStats.uploaded || 0;
    gmDownloaded = gmStats.downloaded || 0;
    debugLog('sync.gmContainers:done', gmStats);
  } catch (e) {
    debugLog('sync.gmContainers:failed', { message: e?.message });
  }

  // Сохранённые плитки и папки «Окружающая среда/бой» (патч 482):
  let gmEnvUploaded = 0;
  let gmEnvDownloaded = 0;
  try {
    const gmEnvStats = await syncGmEnvEntriesInSession(token, folderId, { confirmDownload });
    gmEnvUploaded = gmEnvStats.uploaded || 0;
    gmEnvDownloaded = gmEnvStats.downloaded || 0;
    debugLog('sync.gmEnvEntries:done', gmEnvStats);
  } catch (e) {
    debugLog('sync.gmEnvEntries:failed', { message: e?.message });
  }

  // Аватары (задел премиум-фичы, UI пока нет): редкий синк — ровно здесь.
  // Пустой кэш → ни одного запроса; сбой аватаров не роняет синк персонажей.
  try {
    const avatarStats = await syncAvatarsInSession(token, folderId);
    debugLog('sync.avatars:done', avatarStats);
  } catch (e) {
    debugLog('sync.avatars:failed', { message: e?.message });
  }

  report('done');
  const totalUploaded = uploads.length + gmRoomsUploaded + gmUploaded + gmEnvUploaded;
  const totalDownloaded = downloadedCount + gmRoomsDownloaded + gmDownloaded + gmEnvDownloaded;
  debugLog('sync.all:done', { uploaded: totalUploaded, downloaded: totalDownloaded });
  return { uploaded: totalUploaded, downloaded: totalDownloaded };
};

// Удаление персонажа в облаке. Вызывается ТОЛЬКО после явного подтверждения
// пользователя («удалить везде»), потому что операция необратима и действует
// на все устройства: файл в appDataFolder уносится безвозвратно.
//
// Возвращает { removed, reason }: removed=true, если файл реально удалён.
// Наружу не бросает — удаление в облаке не должно отменять локальное.
export const deleteCharacterFromCloudIfEnabled = async (characterId) => {
  if (!ensureWeb()) return { removed: false, reason: 'not-web' };

  try {
    const configured = await isCloudSyncConfigured();
    if (!configured) {
      debugLog('sync.delete:skipped', { characterId, reason: 'not-configured' });
      return { removed: false, reason: 'not-configured' };
    }

    debugLog('sync.delete:start', { characterId });
    await loadGoogleIdentityScript();
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
    const payload = JSON.stringify(createCharacterExportPayload(character)); // 361: тело сейва как есть

    await uploadCharacterFile({ token, folderId, fileId: remote?.id, filename: makeRemoteFilename(character), payload });
    debugLog('sync.auto:done', { characterId });
  } catch (e) {
    debugLog('sync.cloudFailed', { characterId, message: e?.message || String(e) });
  }
};

// Фоновая выгрузка контейнера/торговца Мастера в Google Drive (если облако уже включено).
export const syncGmContainerToCloudIfEnabled = async (containerId) => {
  if (!ensureWeb() || !containerId || !isGmLootTradeLicensed()) return;

  try {
    const configured = await isCloudSyncConfigured();
    if (!configured) return;

    await loadGoogleIdentityScript();
    const token = await requestAccessToken();
    const moduleFolderId = await getModuleFolderId(token);
    const gmFolderId = await getGmContainersFolderId(token, moduleFolderId);
    const remoteFiles = await listRemoteCharacterFiles(token, gmFolderId);
    const remote = remoteFiles.find((file) => (file.name || '').startsWith(`${containerId}__`));
    const container = await db.getGmContainerById(containerId);
    if (!container) return;

    const payload = JSON.stringify({
      formatVersion: 1,
      type: 'gm_container',
      exportedAt: Date.now(),
      container,
    });
    await uploadCharacterFile({
      token,
      folderId: gmFolderId,
      fileId: remote?.id,
      filename: makeRemoteGmContainerFilename(container),
      payload,
    });
    debugLog('sync.gmContainer.auto:done', { containerId });
  } catch (e) {
    debugLog('sync.gmContainer.auto:failed', { containerId, message: e?.message || String(e) });
  }
};

// Удаление контейнера/торговца Мастера из Google Drive при локальном удалении.
export const deleteGmContainerFromCloudIfEnabled = async (containerId) => {
  if (!ensureWeb() || !containerId) return { removed: false, reason: 'not-web' };
  if (!isGmLootTradeLicensed()) return { removed: false, reason: 'unlicensed' };

  try {
    const configured = await isCloudSyncConfigured();
    if (!configured) return { removed: false, reason: 'not-configured' };

    await loadGoogleIdentityScript();
    const token = await requestAccessToken();
    const moduleFolderId = await getModuleFolderId(token);
    const gmFolderId = await findGmContainersFolderId(token, moduleFolderId);
    if (!gmFolderId) return { removed: false, reason: 'absent' };

    const remoteFiles = await listRemoteCharacterFiles(token, gmFolderId);
    const remote = remoteFiles.find((file) => (file.name || '').startsWith(`${containerId}__`));
    if (!remote) return { removed: false, reason: 'absent' };

    await driveFetch(token, `${DRIVE_API}/files/${remote.id}`, { method: 'DELETE' });
    debugLog('sync.gmContainer.delete:done', { containerId, fileId: remote.id });
    return { removed: true };
  } catch (e) {
    const message = e?.message || String(e);
    debugLog('sync.gmContainer.delete:failed', { containerId, message });
    return { removed: false, reason: 'error', message };
  }
};

// Фоновая выгрузка комнаты Мастера в Google Drive при создании/переименовании.
export const syncGmRoomToCloudIfEnabled = async (folderId) => {
  if (!ensureWeb() || !folderId || !isGmCampaignsLicensed()) return;

  try {
    const configured = await isCloudSyncConfigured();
    if (!configured) return;

    const localRooms = await listLocalGmRooms();
    const room = localRooms.find((r) => r.folderId === String(folderId));
    if (!room) return;

    await loadGoogleIdentityScript();
    const token = await requestAccessToken();
    const moduleFolderId = await getModuleFolderId(token);
    const gmRoomsFolderId = await getGmRoomsFolderId(token, moduleFolderId);
    const remoteFiles = await listRemoteCharacterFiles(token, gmRoomsFolderId);
    const remote = remoteFiles.find((file) => (file.name || '').startsWith(`${room.folderId}__`));

    const payload = JSON.stringify({
      formatVersion: 1,
      type: 'gm_room',
      exportedAt: Date.now(),
      room,
    });
    await uploadCharacterFile({
      token,
      folderId: gmRoomsFolderId,
      fileId: remote?.id,
      filename: makeRemoteGmRoomFilename(room),
      payload,
    });
    debugLog('sync.gmRoom.auto:done', { folderId: room.folderId, code: room.code });
  } catch (e) {
    debugLog('sync.gmRoom.auto:failed', { folderId, message: e?.message || String(e) });
  }
};

// Удаление комнаты Мастера из Google Drive при удалении локальной комнаты.
export const deleteGmRoomFromCloudIfEnabled = async (folderId) => {
  if (!ensureWeb() || !folderId) return { removed: false, reason: 'not-web' };
  if (!isGmCampaignsLicensed()) return { removed: false, reason: 'unlicensed' };

  try {
    const configured = await isCloudSyncConfigured();
    if (!configured) return { removed: false, reason: 'not-configured' };

    await loadGoogleIdentityScript();
    const token = await requestAccessToken();
    const moduleFolderId = await getModuleFolderId(token);
    const gmRoomsFolderId = await findGmRoomsFolderId(token, moduleFolderId);
    if (!gmRoomsFolderId) return { removed: false, reason: 'absent' };

    const remoteFiles = await listRemoteCharacterFiles(token, gmRoomsFolderId);
    const remote = remoteFiles.find((file) => (file.name || '').startsWith(`${folderId}__`));
    if (!remote) return { removed: false, reason: 'absent' };

    await driveFetch(token, `${DRIVE_API}/files/${remote.id}`, { method: 'DELETE' });
    debugLog('sync.gmRoom.delete:done', { folderId, fileId: remote.id });
    return { removed: true };
  } catch (e) {
    const message = e?.message || String(e);
    debugLog('sync.gmRoom.delete:failed', { folderId, message });
    return { removed: false, reason: 'error', message };
  }
};

// Фоновая выгрузка сохранённой плитки / папки «Окружающая среда/бой» в Google Drive.
export const syncGmEnvEntryToCloudIfEnabled = async (entryId) => {
  if (!ensureWeb() || !entryId || !isGmEnvCombatLicensed()) return;

  try {
    const configured = await isCloudSyncConfigured();
    if (!configured) return;

    await loadGoogleIdentityScript();
    const token = await requestAccessToken();
    const moduleFolderId = await getModuleFolderId(token);
    const gmEnvFolderId = await getGmEnvEntriesFolderId(token, moduleFolderId);
    const remoteFiles = await listRemoteCharacterFiles(token, gmEnvFolderId);
    const remote = remoteFiles.find((file) => (file.name || '').startsWith(`${entryId}__`));
    const entry = await db.getGmEnvEntryById(entryId);
    if (!entry) return;

    const payload = JSON.stringify({
      formatVersion: 1,
      type: 'gm_env_entry',
      exportedAt: Date.now(),
      entry,
    });
    await uploadCharacterFile({
      token,
      folderId: gmEnvFolderId,
      fileId: remote?.id,
      filename: makeRemoteGmEnvEntryFilename(entry),
      payload,
    });
    debugLog('sync.gmEnvEntry.auto:done', { entryId });
  } catch (e) {
    debugLog('sync.gmEnvEntry.auto:failed', { entryId, message: e?.message || String(e) });
  }
};

// Удаление сохранённой плитки / папки «Окружающая среда/бой» из Google Drive.
export const deleteGmEnvEntryFromCloudIfEnabled = async (entryId) => {
  if (!ensureWeb() || !entryId) return { removed: false, reason: 'not-web' };
  if (!isGmEnvCombatLicensed()) return { removed: false, reason: 'unlicensed' };

  try {
    const configured = await isCloudSyncConfigured();
    if (!configured) return { removed: false, reason: 'not-configured' };

    await loadGoogleIdentityScript();
    const token = await requestAccessToken();
    const moduleFolderId = await getModuleFolderId(token);
    const gmEnvFolderId = await findGmEnvEntriesFolderId(token, moduleFolderId);
    if (!gmEnvFolderId) return { removed: false, reason: 'absent' };

    const remoteFiles = await listRemoteCharacterFiles(token, gmEnvFolderId);
    const remote = remoteFiles.find((file) => (file.name || '').startsWith(`${entryId}__`));
    if (!remote) return { removed: false, reason: 'absent' };

    await driveFetch(token, `${DRIVE_API}/files/${remote.id}`, { method: 'DELETE' });
    debugLog('sync.gmEnvEntry.delete:done', { entryId, fileId: remote.id });
    return { removed: true };
  } catch (e) {
    const message = e?.message || String(e);
    debugLog('sync.gmEnvEntry.delete:failed', { entryId, message });
    return { removed: false, reason: 'error', message };
  }
};
