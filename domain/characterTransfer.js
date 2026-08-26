/**
 * domain/characterTransfer.js
 * Чистая доменная логика импорта/экспорта персонажей.
 * Без зависимостей от React, Platform, expo, DOM.
 * Подходит для тестов, cloud sync и UI-слоев.
 */

export const EXPORT_FORMAT_VERSION = 1;
export const EXPORT_FILE_EXTENSION = '.rpgc';

export const IMPORT_ERRORS = {
  invalidJson: 'import.errors.invalidJson',
  invalidFormat: 'import.errors.invalidFormat',
  unsupportedVersion: 'import.errors.unsupportedVersion',
  missingCharacter: 'import.errors.missingCharacter',
  missingName: 'import.errors.missingName',
  missingData: 'import.errors.missingData',
};

const safeParseJson = (raw) => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const sanitizeFileName = (name) => {
  const base = (name || 'character')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 48);

  return `${base || 'character'}${EXPORT_FILE_EXTENSION}`;
};

/**
 * Создает payload для экспорта.
 * @param {Object} characterRow - строка из БД: {id, name, level, origin_name, data}
 */
export const createCharacterExportPayload = (characterRow) => ({
  format: 'rpg-companion-character',
  version: EXPORT_FORMAT_VERSION,
  exportedAt: new Date().toISOString(),
  character: {
    id: characterRow.id,
    name: characterRow.name,
    level: characterRow.level ?? 1,
    originName: characterRow.origin_name ?? null,
    data: characterRow.data,
  },
});

/**
 * Парсит и валидирует импортируемый payload.
 * @param {string} rawText - сырой текст файла
 * @returns {{character?: Object, error?: string}}
 */
export const parseCharacterImportPayload = (rawText) => {
  const parsed = safeParseJson(rawText);
  if (!parsed || typeof parsed !== 'object') {
    return { error: 'invalidJson' };
  }

  if (parsed.format !== 'rpg-companion-character') {
    return { error: 'invalidFormat' };
  }

  if (parsed.version !== EXPORT_FORMAT_VERSION) {
    return { error: 'unsupportedVersion' };
  }

  if (!parsed.character || typeof parsed.character !== 'object') {
    return { error: 'missingCharacter' };
  }

  const { character } = parsed;
  if (!character.name || typeof character.name !== 'string') {
    return { error: 'missingName' };
  }

  if (!character.data || typeof character.data !== 'object') {
    return { error: 'missingData' };
  }

  return {
    character: {
      id: character.id || null,
      name: character.name.trim(),
      level: Number.isFinite(character.level) ? character.level : 1,
      originName: character.originName || null,
      data: character.data,
    },
  };
};

/**
 * Вспомогательная функция: безопасный парс + валидация, возвращает объект персонажа или бросает ошибку с кодом
 */
export const parseCharacterOrThrow = (rawText) => {
  const result = parseCharacterImportPayload(rawText);
  if (result.error) {
    throw new Error(result.error);
  }
  return result.character;
};
