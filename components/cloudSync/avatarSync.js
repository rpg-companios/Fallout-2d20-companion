// components/cloudSync/avatarSync.js
//
// Редкий синк аватаров (задел премиум-фичи, патч 193; UI нет).
//
// Протокол (docs/premium-and-avatar-design.md, §1.2): аватар меняется редко,
// поэтому проверяется ТОЛЬКО в полной синхронизации («Синхронизировать с
// Google Drive») — и в будущем при первой загрузке персонажа на устройстве.
// Автосейв персонажа аватар не трогает.
//
// Размещение: appDataFolder/<сеттинг>/avatars/<characterId>.jpg — имя по
// стабильному id, переименование персонажа аватар не трогает.
//
// Архитектура: planAvatarSync — чистая функция (протокол, легко тестировать),
// syncAvatars — оркестратор с инъекцией зависимостей (Drive-операции поставляет
// googleDriveSync.js, кэш — db/avatarCache.js). Цикл импортов исключён.

/** Имя подпапки аватаров внутри папки сеттинга. */
export const AVATARS_FOLDER_NAME = 'avatars';

/** Имя файла аватара в Drive: <characterId>.jpg. */
export const avatarFileName = (characterId) => `${characterId}.jpg`;

/** characterId из имени файла аватара или null. */
export const characterIdFromAvatarFileName = (name) => {
  const match = String(name || '').match(/^([^\/]+)\.jpg$/i);
  return match ? match[1] : null;
};

/**
 * Сравнить локальную и облачную копию одного персонажа.
 * md5 равны (обе есть) → noop; иначе last-write-wins по времени.
 *
 * @returns {'noop'|'upload'|'download'}
 */
export const decideAvatarAction = ({ local, remote }) => {
  if (!local) return 'download';
  if (!remote) return 'upload';
  if (local.md5 && remote.md5 && local.md5 === remote.md5) return 'noop';
  const localAt = Number(local.updatedAt || 0);
  const remoteAt = Number(remote.modifiedTime || 0);
  return remoteAt > localAt ? 'download' : 'upload';
};

/**
 * Составить план синка аватаров (чистая функция, протокол из дизайн-дока).
 *
 * @param {object} args
 * @param {Array<{characterId: string, md5?: string|null, updatedAt?: number}>} args.local — строки кэша
 * @param {Array<{fileId: string, name: string, md5?: string, modifiedTime?: number}>} args.remote — файлы Drive
 * @param {Iterable<string>} args.existingCharacterIds — id живых персонажей (локальный список)
 * @returns {{
 *   noop: Array<{characterId: string}>,
 *   uploads: Array<{characterId: string}>,
 *   downloads: Array<{characterId: string, fileId: string}>,
 *   localDeletes: Array<{characterId: string}>,
 *   remoteDeletes: Array<{characterId: string, fileId: string}>,
 * }}
 */
export function planAvatarSync({ local = [], remote = [], existingCharacterIds = [] }) {
  const existing = new Set(existingCharacterIds);

  const remoteByCharacterId = new Map();
  for (const file of remote) {
    const characterId = characterIdFromAvatarFileName(file.name);
    if (characterId) remoteByCharacterId.set(characterId, file);
  }
  const localByCharacterId = new Map(local.map((row) => [row.characterId, row]));

  const noop = [];
  const uploads = [];
  const downloads = [];
  const localDeletes = [];
  const remoteDeletes = [];

  // Осиротевшие локальные аватары (персонаж удалён) — убрать из кэша.
  for (const row of local) {
    if (!existing.has(row.characterId)) localDeletes.push({ characterId: row.characterId });
  }
  // Осиротевшие облачные аватары — удалить файлы.
  for (const [characterId, file] of remoteByCharacterId) {
    if (!existing.has(characterId)) remoteDeletes.push({ characterId, fileId: file.fileId });
  }

  // Живые персонажи: сравнение копий.
  for (const characterId of existing) {
    const row = localByCharacterId.get(characterId);
    const file = remoteByCharacterId.get(characterId);
    if (!row && !file) continue;
    const action = decideAvatarAction({
      local: row ? { md5: row.md5 ?? null, updatedAt: Number(row.updatedAt || 0) } : null,
      remote: file ? { md5: file.md5 ?? null, modifiedTime: file.modifiedTime ? new Date(file.modifiedTime).getTime() : 0 } : null,
    });
    if (action === 'noop') noop.push({ characterId });
    else if (action === 'upload') uploads.push({ characterId, fileId: file ? file.fileId : null });
    else downloads.push({ characterId, fileId: file.fileId });
  }

  return { noop, uploads, downloads, localDeletes, remoteDeletes };
}

/**
 * Выполнить план синка аватаров. Зависимости инъектируются:
 *
 * @param {object} args
 * @param {object} args.driveOps — {
 *   listAvatarFiles(token, folderId),
 *   uploadAvatarFile({ token, folderId, fileId, characterId, dataUrl }) → { id, md5Checksum },
 *   downloadAvatarFile(token, fileId) → dataUrl (текст),
 *   deleteAvatarFile(token, fileId),
 * }
 * @param {object} args.cacheOps — { list, get, setFromRemote, updateMd5, delete } (db/avatarCache.js)
 * @param {Function} args.listCharacterIds — async () => string[] (живые персонажи)
 * @param {Function} [args.findFolder] — async () => string|null — найти подпапку avatars БЕЗ создания
 * @param {Function} [args.ensureFolder] — async () => string — найти/создать (вызывается лениво,
 *   только когда есть что выгрузить: неиспользуемая фича не оставляет следов в облаке)
 * @param {Function} [args.validateDataUrl] — (dataUrl) => { ok } (domain/characterAvatar.js)
 * @param {string} args.token — access token Drive
 * @returns {Promise<{uploaded:number, downloaded:number, noop:number, localDeleted:number, remoteDeleted:number}>}
 */
export async function syncAvatars({
  token,
  driveOps,
  cacheOps,
  listCharacterIds,
  findFolder,
  ensureFolder,
  validateDataUrl,
}) {
  const [localRows, characterIds] = await Promise.all([
    cacheOps.list(),
    listCharacterIds(),
  ]);

  // Папку аватаров только ИЩЕМ (без создания): её отсутствие == пустое облако.
  const folderId = findFolder ? await findFolder() : null;
  const remoteFiles = folderId ? await driveOps.listAvatarFiles(token, folderId) : [];

  const plan = planAvatarSync({
    local: localRows.map((row) => ({
      characterId: row.character_id ?? row.characterId,
      md5: row.md5 ?? null,
      updatedAt: Number(row.updated_at ?? row.updatedAt ?? 0),
    })),
    remote: remoteFiles.map((file) => ({
      fileId: file.id ?? file.fileId,
      name: file.name,
      md5: file.md5Checksum ?? file.md5 ?? null,
      modifiedTime: file.modifiedTime ?? null,
    })),
    existingCharacterIds: characterIds,
  });

  // Нечего делать — не создаём папку и не делаем больше ни одного запроса
  // (полная синхронизация без аватаров не оставляет следов в облаке).
  const total = plan.uploads.length + plan.downloads.length + plan.noop.length
    + plan.localDeletes.length + plan.remoteDeletes.length;
  if (total === 0) {
    return { uploaded: 0, downloaded: 0, noop: 0, localDeleted: 0, remoteDeleted: 0 };
  }

  let uploadFolderId = folderId;
  if (plan.uploads.length > 0 && !uploadFolderId) {
    uploadFolderId = ensureFolder ? await ensureFolder() : null;
  }

  for (const { characterId } of plan.localDeletes) {
    await cacheOps.delete(characterId);
  }
  for (const { fileId } of plan.remoteDeletes) {
    await driveOps.deleteAvatarFile(token, fileId);
  }
  for (const { characterId, fileId } of plan.uploads) {
    const row = await cacheOps.get(characterId);
    if (!row?.data_url && !row?.dataUrl) continue;
    const uploaded = await driveOps.uploadAvatarFile({
      token,
      folderId: uploadFolderId,
      fileId: fileId ?? null,
      characterId,
      dataUrl: row.data_url ?? row.dataUrl,
    });
    if (uploaded?.md5Checksum) {
      await cacheOps.updateMd5(characterId, uploaded.md5Checksum);
    }
  }
  for (const { characterId, fileId } of plan.downloads) {
    const dataUrl = await driveOps.downloadAvatarFile(token, fileId);
    // Чужой файл мог быть «толстым» или не-аватаром: валидируем до кэша.
    if (validateDataUrl ? !validateDataUrl(dataUrl).ok : false) continue;
    const file = remoteFiles.find((f) => (f.id ?? f.fileId) === fileId);
    const modifiedMs = file?.modifiedTime ? new Date(file.modifiedTime).getTime() : Date.now();
    await cacheOps.setFromRemote(characterId, dataUrl, file?.md5Checksum ?? null, modifiedMs);
  }

  return {
    uploaded: plan.uploads.length,
    downloaded: plan.downloads.length,
    noop: plan.noop.length,
    localDeleted: plan.localDeletes.length,
    remoteDeleted: plan.remoteDeletes.length,
  };
}
