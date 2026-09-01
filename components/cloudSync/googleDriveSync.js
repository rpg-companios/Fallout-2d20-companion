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
const TOKEN_SCOPE = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

// OAuth 2.0 endpoints для Authorization Code + PKCE потока (публичный веб-клиент).
const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

// Токены держим только в памяти на время сессии вкладки, чтобы не просить вход
// повторно при каждой синхронизации. На диск / в localStorage не пишем.
let pendingToken = null;
let cachedToken = null;
let cachedTokenExpiry = 0;

// --- PKCE + CSRF helpers (только браузер) --------------------------------
// code_verifier (случайная строка) -> code_challenge = base64url(SHA256(verifier)).
// Во время обмена кода на токен роль «секрета» играет code_verifier — поэтому
// публичному клиенту (без сервера) не нужен client_secret. См. RFC 7636.
const toBase64Url = (bytes) => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const randomUrlString = (byteLength = 32) => {
  const arr = new Uint8Array(byteLength);
  crypto.getRandomValues(arr);
  return toBase64Url(arr);
};

const sha256Base64Url = async (str) => {
  const data = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return toBase64Url(new Uint8Array(digest));
};

// Expiry access-токена (unix ms) берём из JWT payload, чтобы не гонять
// пользователя в попап на каждую синхронизацию.
const readTokenExpiry = (token) => {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(atob(payload));
    return Number(json.exp || 0) * 1000;
  } catch (e) {
    return 0;
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

// Получение access_token для Google Drive через Authorization Code + PKCE прямо
// в браузере. Никакого client_secret — публичный клиент, роль секрета играет
// code_verifier. Поток: открываем попап -> Google возвращает ?code&state на наш
// origin -> обмениваем код на токен через oauth2.googleapis.com/token.
const authorizeWithGoogle = async () => {
  const clientId = getClientId();
  if (!clientId) {
    throw new Error('Google Drive client id is not configured. Set EXPO_PUBLIC_GOOGLE_DRIVE_CLIENT_ID.');
  }

  const codeVerifier = randomUrlString(64);
  const codeChallenge = await sha256Base64Url(codeVerifier);
  const state = randomUrlString(32);
  const redirectUri = window.location.origin;

  const authParams = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: TOKEN_SCOPE,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  const authUrl = `${GOOGLE_AUTH_ENDPOINT}?${authParams.toString()}`;

  // Открываем попап и ждём, пока Google вернёт нас на redirectUri с ?code&state.
  const code = await new Promise((resolve, reject) => {
    const popup = window.open(authUrl, 'gdrive-oauth', 'width=520,height=640,resizable=yes');
    if (!popup) {
      reject(new Error('Google auth popup was blocked. Разрешите всплывающие окна для этого сайта и повторите.'));
      return;
    }

    const close = () => {
      clearInterval(pollTimer);
      clearInterval(closedTimer);
      try { if (!popup.closed) popup.close(); } catch (e) { /* noop */ }
    };

    const closedTimer = setInterval(() => {
      if (popup.closed) { close(); reject(new Error('Google auth was canceled or the popup was closed.')); }
    }, 700);

    const pollTimer = setInterval(() => {
      let href;
      try { href = popup.location.href; } catch (e) { return; } // пока кросс-домен — ждём
      const url = new URL(href);
      const q = url.searchParams;
      if (q.get('error')) {
        close();
        reject(new Error(`Google auth failed: ${q.get('error_description') || q.get('error')}`));
        return;
      }
      if (q.get('code')) {
        if (q.get('state') !== state) {
          close();
          reject(new Error('OAuth state mismatch (possible CSRF).'));
          return;
        }
        close();
        resolve(q.get('code'));
      }
    }, 300);
  });

  // Обмен кода на токен (PKCE, без client_secret).
  const tokenResp = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: codeVerifier,
    }),
  });
  const tokenData = await tokenResp.json();
  if (!tokenResp.ok) {
    throw new Error(`Google token exchange failed: ${tokenData.error_description || tokenData.error || tokenResp.status}`);
  }
  return tokenData.access_token;
};

const requestAccessToken = async () => {
  if (cachedToken && Date.now() < cachedTokenExpiry) return cachedToken;
  if (pendingToken) return pendingToken;

  pendingToken = authorizeWithGoogle()
    .then((token) => {
      cachedToken = token;
      cachedTokenExpiry = readTokenExpiry(token) || (Date.now() + 3600 * 1000);
      return token;
    })
    .finally(() => {
      pendingToken = null;
    });

  return pendingToken;
};

// Сбрасываем кэш токена (например, при 401), чтобы следующий вызов вошёл заново.
export const clearCachedCloudToken = () => {
  cachedToken = null;
  cachedTokenExpiry = 0;
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
    // Протух/отозван токен — сбрасываем кэш, чтобы следующая синхронизация
    // вошла в Google заново.
    if (response.status === 401) clearCachedCloudToken();
    const text = await response.text();
    throw new Error(`Google Drive API error (${response.status}): ${text}`);
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
  if (listData.files?.length) return listData.files[0].id;

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
  return created.id;
};

const listRemoteCharacterFiles = async (token, folderId) => {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false and mimeType='application/json'`);
  const resp = await driveFetch(token, `${DRIVE_API}/files?q=${q}&fields=files(id,name,modifiedTime)&spaces=appDataFolder&pageSize=200`);
  const data = await resp.json();
  return data.files || [];
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

export const syncAllCharactersWithCloud = async ({ confirmDownload }) => {
  if (!ensureWeb()) throw new Error('Cloud sync supports only web platform.');

  const token = await requestAccessToken();
  const folderId = await getModuleFolderId(token);
  const remoteFiles = await listRemoteCharacterFiles(token, folderId);
  const localList = await db.getCharactersList();
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

  for (const { character, remote } of uploads) {
    const full = await db.loadCharacterById(character.id);
    if (!full) continue;
    const payload = JSON.stringify(createCharacterExportPayload(full));
    await uploadCharacterFile({ token, folderId, fileId: remote?.id, filename: makeRemoteFilename(character), payload });
  }

  await setCloudSyncConfigured(true);
  return { uploaded: uploads.length, downloaded: downloadedCount };
};

export const syncCharacterToCloudIfEnabled = async (characterId) => {
  if (!ensureWeb()) return;
  const configured = await isCloudSyncConfigured();
  if (!configured) return;

  try {
    const token = await requestAccessToken();
    const folderId = await getModuleFolderId(token);
    const remoteFiles = await listRemoteCharacterFiles(token, folderId);
    const remote = remoteFiles.find((file) => (file.name || '').startsWith(`${characterId}__`));
    const character = await db.loadCharacterById(characterId);
    if (!character) return;
    const payload = JSON.stringify(createCharacterExportPayload(character));

    await uploadCharacterFile({ token, folderId, fileId: remote?.id, filename: makeRemoteFilename(character), payload });
  } catch (e) {
    debugLog('sync.cloudFailed', { message: e?.message || String(e) });
  }
};
