/**
 * Патч 509: перенос «Общего хранилища» через JSON.
 *
 * Снимок живёт в памяти серверной комнаты и исчезает, когда сервер
 * недоступен/перезапущен. Экспорт нужен и Мастеру, и игроку: если ведущий
 * перестал водить, сменился Мастер или игрок сам стал Мастером, он импортирует
 * файл и наполняет хранилище новым сервером одним действием.
 *
 * Модуль чистый: формат файла и валидация без React Native и без сети.
 */

export const STORAGE_EXPORT_TYPE = 'party_storage';
export const STORAGE_EXPORT_VERSION = 1;

export const createStorageExportPayload = ({ code, storage, exportedBy = '' }) => ({
  formatVersion: STORAGE_EXPORT_VERSION,
  type: STORAGE_EXPORT_TYPE,
  code: String(code || ''),
  exportedBy: String(exportedBy || ''),
  exportedAt: Date.now(),
  storage: {
    revision: Number(storage?.revision) || 0,
    entries: (storage?.entries || []).map((entry) => ({
      entryId: String(entry.entryId || ''),
      item: entry.item && typeof entry.item === 'object' ? { ...entry.item } : {},
      name: String(entry.name || ''),
      itemType: String(entry.itemType || 'misc'),
      quantity: Math.max(1, Math.floor(Number(entry.quantity) || 1)),
      depositedBy: entry.depositedBy ? String(entry.depositedBy) : undefined,
      depositedByName: entry.depositedByName ? String(entry.depositedByName) : undefined,
      at: entry.at ? Number(entry.at) : undefined,
    })),
  },
});

/**
 * Разобрать файл. Принимает и наш конверт, и «голый» снимок {revision, entries}.
 * Возвращает { storage, code, error }.
 */
export const parseStorageImportPayload = (raw) => {
  let parsed = raw;
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw); } catch { return { error: 'INVALID_JSON' }; }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { error: 'INVALID_JSON' };

  const body = parsed.storage && typeof parsed.storage === 'object'
    ? parsed.storage
    : parsed;
  if (!Array.isArray(body.entries)) return { error: 'NO_ENTRIES' };

  const entries = body.entries
    .filter((entry) => entry && typeof entry === 'object' && entry.name)
    .map((entry, index) => ({
      entryId: String(entry.entryId || `imported_${index}`),
      item: entry.item && typeof entry.item === 'object' ? { ...entry.item } : { name: String(entry.name) },
      name: String(entry.name),
      itemType: String(entry.itemType || 'misc'),
      quantity: Math.max(1, Math.floor(Number(entry.quantity) || 1)),
      depositedBy: entry.depositedBy ? String(entry.depositedBy) : undefined,
      depositedByName: entry.depositedByName ? String(entry.depositedByName) : undefined,
      at: entry.at ? Number(entry.at) : undefined,
    }));

  return {
    storage: { revision: Number(body.revision) || 0, entries },
    code: String(parsed.code || '').trim(),
    exportedAt: Number(parsed.exportedAt) || 0,
  };
};

export const storageExportFileName = (code, now = new Date()) => {
  const clean = String(code || 'room').replace(/[^A-Za-z0-9_-]/g, '_');
  const day = now.toISOString().slice(0, 10);
  return `storage__${clean}__${day}.json`;
};

export default createStorageExportPayload;
