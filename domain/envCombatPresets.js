// domain/envCombatPresets.js
// Чистая нормализация и дублирование сохранённых состояний (плиток) и папок
// экрана Мастера «Окружающая среда/бой» (патч 482). Без React / RN / БД.

export const GM_ENV_ENTRY_KIND = Object.freeze({
  FOLDER: 'folder',
  PRESET: 'preset',
});
export const ENV_ENTRY_KIND = GM_ENV_ENTRY_KIND;

export const GM_ENV_CATEGORY = Object.freeze({
  WEATHER: 'weather',
  RADIATION: 'radiation',
  INJURY: 'injury',
  ATTACK_FAIL: 'attackFail',
});
export const ENV_MECHANIC_TYPE = GM_ENV_CATEGORY;

const VALID_CATEGORIES = new Set(Object.values(GM_ENV_CATEGORY));

export function makeGmEnvId(prefix = 'gmenv', now = Date.now()) {
  return `${prefix}_${now}_${Math.random().toString(36).slice(2, 9)}`;
}

export function normalizeGmEnvEntry(raw = {}, now = Date.now()) {
  const kind = raw?.kind === GM_ENV_ENTRY_KIND.FOLDER
    ? GM_ENV_ENTRY_KIND.FOLDER
    : GM_ENV_ENTRY_KIND.PRESET;
  const id = typeof raw?.id === 'string' && raw.id.trim()
    ? raw.id.trim()
    : makeGmEnvId(kind === GM_ENV_ENTRY_KIND.FOLDER ? 'gmefld' : 'gmepre', now);
  const name = String(raw?.name || '').trim() || (kind === GM_ENV_ENTRY_KIND.FOLDER ? 'Новая папка' : 'Состояние');
  const description = typeof raw?.description === 'string'
    ? raw.description.trim().slice(0, 600)
    : '';
  const createdAt = Number(raw?.createdAt) > 0 ? Number(raw.createdAt) : now;
  const updatedAt = Number(raw?.updatedAt) > 0 ? Number(raw.updatedAt) : createdAt;

  if (kind === GM_ENV_ENTRY_KIND.FOLDER) {
    return {
      id,
      kind: GM_ENV_ENTRY_KIND.FOLDER,
      category: 'folder',
      mechanicType: null,
      name,
      description,
      folderId: null,
      parentFolderId: null,
      config: {},
      payload: {},
      createdAt,
      updatedAt,
    };
  }

  const rawCat = raw?.category || raw?.mechanicType;
  const category = VALID_CATEGORIES.has(rawCat)
    ? rawCat
    : GM_ENV_CATEGORY.WEATHER;
  const rawFolder = raw?.folderId !== undefined ? raw.folderId : raw?.parentFolderId;
  const folderId = typeof rawFolder === 'string' && rawFolder.trim()
    ? rawFolder.trim()
    : null;
  const rawConfig = raw?.config && typeof raw.config === 'object' && !Array.isArray(raw.config) && Object.keys(raw.config).length > 0
    ? raw.config
    : (raw?.payload && typeof raw.payload === 'object' && !Array.isArray(raw.payload) ? raw.payload : (raw?.config || {}));
  const config = JSON.parse(JSON.stringify(rawConfig));

  return {
    id,
    kind: GM_ENV_ENTRY_KIND.PRESET,
    category,
    mechanicType: category,
    name,
    description,
    folderId,
    parentFolderId: folderId,
    config,
    payload: config,
    createdAt,
    updatedAt,
  };
}

export function createEnvFolder({ id, name = '', description = '', now = Date.now() } = {}) {
  return normalizeGmEnvEntry({
    id,
    kind: GM_ENV_ENTRY_KIND.FOLDER,
    name,
    description,
    createdAt: now,
    updatedAt: now,
  }, now);
}

export function createEnvPreset({
  id,
  mechanicType = GM_ENV_CATEGORY.WEATHER,
  category,
  name = '',
  description = '',
  parentFolderId = null,
  folderId,
  payload = {},
  config,
  now = Date.now(),
} = {}) {
  return normalizeGmEnvEntry({
    id,
    kind: GM_ENV_ENTRY_KIND.PRESET,
    category: category || mechanicType,
    name,
    description,
    folderId: folderId !== undefined ? folderId : parentFolderId,
    config: config || payload,
    createdAt: now,
    updatedAt: now,
  }, now);
}

export function isEnvEntryVisibleInFolder(entry, currentFolderId = null) {
  if (!entry) return false;
  const fid = entry.folderId ?? entry.parentFolderId ?? null;
  if (!currentFolderId) {
    return fid == null || fid === '';
  }
  return entry.kind === GM_ENV_ENTRY_KIND.PRESET && fid === currentFolderId;
}

export function countPresetsInFolder(entries = [], folderId) {
  if (!folderId || !Array.isArray(entries)) return 0;
  return entries.filter(
    (e) => e?.kind === GM_ENV_ENTRY_KIND.PRESET && (e.folderId ?? e.parentFolderId) === folderId,
  ).length;
}

export function sortEnvEntries(entries = []) {
  return [...(entries || [])].sort((a, b) => {
    const aFolder = a?.kind === GM_ENV_ENTRY_KIND.FOLDER ? 0 : 1;
    const bFolder = b?.kind === GM_ENV_ENTRY_KIND.FOLDER ? 0 : 1;
    if (aFolder !== bFolder) return aFolder - bFolder;
    return (Number(b?.updatedAt) || 0) - (Number(a?.updatedAt) || 0);
  });
}

export function detachFolderPresets(entries = [], folderId, now = Date.now()) {
  return (entries || []).map((entry) => {
    if (entry?.kind === GM_ENV_ENTRY_KIND.PRESET && (entry.folderId ?? entry.parentFolderId) === folderId) {
      return normalizeGmEnvEntry({
        ...entry,
        folderId: null,
        parentFolderId: null,
        updatedAt: now,
      }, now);
    }
    return entry;
  });
}

export function duplicateGmEnvEntry(source, {
  existingNames = [],
  copySuffix = 'копия',
  now = Date.now(),
} = {}) {
  const base = normalizeGmEnvEntry(source, now);
  const namesSet = new Set((existingNames || []).map((n) => String(n || '').trim().toLowerCase()));
  let candidate = `${base.name} (${copySuffix})`;
  let counter = 2;
  while (namesSet.has(candidate.toLowerCase())) {
    candidate = `${base.name} (${copySuffix} ${counter})`;
    counter += 1;
  }
  return normalizeGmEnvEntry({
    ...base,
    id: makeGmEnvId(base.kind === GM_ENV_ENTRY_KIND.FOLDER ? 'gmefld' : 'gmepre', now),
    name: candidate,
    createdAt: now,
    updatedAt: now,
  }, now);
}
