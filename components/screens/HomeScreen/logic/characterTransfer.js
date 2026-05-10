const EXPORT_FORMAT_VERSION = 1;
const EXPORT_FILE_EXTENSION = '.rpgc';

const safeParseJson = (raw) => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const sanitizeFileName = (name) => {
  const base = (name || 'character')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 48);

  return `${base || 'character'}${EXPORT_FILE_EXTENSION}`;
};

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

export const downloadCharacterPayloadWeb = (payload, preferredName) => {
  const fileName = sanitizeFileName(preferredName);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

export const pickCharacterFileWeb = () => new Promise((resolve) => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = `${EXPORT_FILE_EXTENSION},application/json`;

  input.onchange = () => {
    const file = input.files && input.files[0];
    if (!file) {
      resolve(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsText(file, 'utf-8');
  };

  input.click();
});

export const IMPORT_ERRORS = {
  invalidJson: 'import.errors.invalidJson',
  invalidFormat: 'import.errors.invalidFormat',
  unsupportedVersion: 'import.errors.unsupportedVersion',
  missingCharacter: 'import.errors.missingCharacter',
  missingName: 'import.errors.missingName',
  missingData: 'import.errors.missingData',
};
