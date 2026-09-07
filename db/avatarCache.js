// db/avatarCache.js
//
// Локальный кэш аватаров персонажей (задел премиум-фичи, патч 193; UI нет).
// Таблица character_avatars (db/schema.js): web — IndexedDB-подобный адаптер
// поверх AsyncStorage, native — SQLite. SQL поддерживается обоими адаптерами:
// INSERT OR REPLACE / SELECT / DELETE (см. db/adapters/WebAdapter.js).

import { runQuery, getAll, getFirst } from './Database';

/**
 * Запись аватара персонажа в локальный кэш (upsert).
 *
 * @param {string} characterId
 * @param {string} dataUrl — JPEG data URL (прошёл validateAvatarDataUrl)
 * @param {string|null} md5 — md5Checksum из Drive (после выгрузки) или null
 * @returns {Promise<void>}
 */
export async function setAvatarCache(characterId, dataUrl, md5 = null) {
  if (!characterId || typeof dataUrl !== 'string') return;
  await runQuery(
    'INSERT OR REPLACE INTO character_avatars (character_id, data_url, md5, updated_at) VALUES (?, ?, ?, ?)',
    [characterId, dataUrl, md5, Date.now()],
  );
}

/**
 * Запись аватара, скачанного из Drive (с его md5 и временем).
 *
 * @param {string} characterId
 * @param {string} dataUrl
 * @param {string|null} md5
 * @param {number} updatedAt — время изменения файла в облаке (ms)
 */
export async function setAvatarCacheFromRemote(characterId, dataUrl, md5, updatedAt) {
  if (!characterId || typeof dataUrl !== 'string') return;
  await runQuery(
    'INSERT OR REPLACE INTO character_avatars (character_id, data_url, md5, updated_at) VALUES (?, ?, ?, ?)',
    [characterId, dataUrl, md5 ?? null, Number(updatedAt) || Date.now()],
  );
}

/**
 * Обновить только md5 локального аватара (Drive вернул md5Checksum выгрузки).
 */
export async function updateAvatarCacheMd5(characterId, md5) {
  if (!characterId) return;
  await runQuery(
    'UPDATE character_avatars SET md5 = ? WHERE character_id = ?',
    [md5 ?? null, characterId],
  );
}

/** Строка кэша аватара персонажа или null: { character_id, data_url, md5, updated_at }. */
export async function getAvatarCache(characterId) {
  if (!characterId) return null;
  return getFirst(
    'SELECT character_id, data_url, md5, updated_at FROM character_avatars WHERE character_id = ?',
    [characterId],
  );
}

/** Все строки кэша (для полного синка). */
export async function listAvatarCache() {
  return getAll('SELECT character_id, data_url, md5, updated_at FROM character_avatars');
}

/** Удалить аватар персонажа из кэша. */
export async function deleteAvatarCache(characterId) {
  if (!characterId) return;
  await runQuery('DELETE FROM character_avatars WHERE character_id = ?', [characterId]);
}
