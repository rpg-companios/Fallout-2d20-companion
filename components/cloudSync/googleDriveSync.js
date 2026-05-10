import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as db from '../../db';
import { createCharacterExportPayload, parseCharacterImportPayload } from '../screens/HomeScreen/logic/characterTransfer';

const ROOT_FOLDER_NAME = 'fallout2d20';
const SYNC_KEY = 'fallout_cloud_sync_enabled';
const TOKEN_SCOPE = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.metadata.readonly';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

let pendingToken = null;

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

const requestAccessToken = async () => {
  const clientId = getClientId();
  if (!clientId) {
    throw new Error('Google Drive client id is not configured. Set EXPO_PUBLIC_GOOGLE_DRIVE_CLIENT_ID.');
  }
  if (pendingToken) return pendingToken;

  pendingToken = new Promise((resolve, reject) => {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: TOKEN_SCOPE,
      prompt: 'consent',
      callback: (resp) => {
        if (resp?.access_token) resolve(resp.access_token);
        else reject(new Error(resp?.error || 'Google auth failed.'));
      },
      error_callback: () => reject(new Error('Google auth failed.')),
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
    throw new Error(`Google Drive API error (${response.status}): ${text}`);
  }

  return response;
};

const getOrCreateRootFolder = async (token) => {
  const q = encodeURIComponent(`mimeType='application/vnd.google-apps.folder' and trashed=false and name='${ROOT_FOLDER_NAME}'`);
  const listResp = await driveFetch(token, `${DRIVE_API}/files?q=${q}&fields=files(id,name,createdTime)&spaces=drive`);
  const listData = await listResp.json();
  if (listData.files?.length) return listData.files[0].id;

  const createResp = await driveFetch(token, `${DRIVE_API}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: ROOT_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });
  const created = await createResp.json();
  return created.id;
};

const listRemoteCharacterFiles = async (token, folderId) => {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false and mimeType='application/json'`);
  const resp = await driveFetch(token, `${DRIVE_API}/files?q=${q}&fields=files(id,name,modifiedTime)&spaces=drive&pageSize=200`);
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

const makeRemoteFilename = (character) => `${character.id}__${character.name}.json`;

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

  await loadGoogleIdentityScript();
  const token = await requestAccessToken();
  const folderId = await getOrCreateRootFolder(token);
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
    await loadGoogleIdentityScript();
    const token = await requestAccessToken();
    const folderId = await getOrCreateRootFolder(token);
    const remoteFiles = await listRemoteCharacterFiles(token, folderId);
    const remote = remoteFiles.find((file) => (file.name || '').startsWith(`${characterId}__`));
    const character = await db.loadCharacterById(characterId);
    if (!character) return;
    const payload = JSON.stringify(createCharacterExportPayload(character));

    await uploadCharacterFile({ token, folderId, fileId: remote?.id, filename: makeRemoteFilename(character), payload });
  } catch (e) {
    console.warn('[CloudSync] Failed to sync character:', e?.message || e);
  }
};
