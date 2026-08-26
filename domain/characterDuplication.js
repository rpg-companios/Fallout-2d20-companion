const CHARACTER_ID_PREFIX = 'char_';
const COPY_SEPARATOR = ' — ';

const assertNonEmptyString = (value, field) => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`[characterDuplication] ${field} must be a non-empty string`);
  }
};

const cloneData = (value) => {
  if (Array.isArray(value)) return value.map(cloneData);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneData(entry)]));
  }
  return value;
};

export const createDuplicateCharacterId = (timestamp, entropy) => {
  if (!Number.isFinite(timestamp)) {
    throw new TypeError('[characterDuplication] timestamp must be finite');
  }
  assertNonEmptyString(entropy, 'entropy');
  return `${CHARACTER_ID_PREFIX}${timestamp}_${entropy}`;
};

export const createDuplicateCharacterName = ({ sourceName, existingNames, copyLabel }) => {
  assertNonEmptyString(sourceName, 'sourceName');
  assertNonEmptyString(copyLabel, 'copyLabel');
  if (!Array.isArray(existingNames) || existingNames.some((name) => typeof name !== 'string')) {
    throw new TypeError('[characterDuplication] existingNames must be an array of strings');
  }

  const occupied = new Set(existingNames);
  const base = `${sourceName}${COPY_SEPARATOR}${copyLabel}`;
  if (!occupied.has(base)) return base;

  let sequence = 2;
  while (occupied.has(`${base} ${sequence}`)) sequence += 1;
  return `${base} ${sequence}`;
};

/**
 * Чистая движковая механика дублирования персонажа.
 *
 * Вложенные данные копируются без изменения структуры и внутренних id.
 * Меняются только имя в каноническом поле characterName, id записи и даты.
 * Слой хранения отдельно отмечает копию как ожидающую подтверждения имени.
 */
export const buildCharacterDuplicate = ({
  source,
  existingNames,
  copyLabel,
  duplicateId,
  timestamp,
}) => {
  if (!source || typeof source !== 'object') {
    throw new TypeError('[characterDuplication] source character is required');
  }
  assertNonEmptyString(source.id, 'source.id');
  assertNonEmptyString(source.name, 'source.name');
  assertNonEmptyString(duplicateId, 'duplicateId');
  if (!Number.isFinite(timestamp)) {
    throw new TypeError('[characterDuplication] timestamp must be finite');
  }
  if (!source.data || typeof source.data !== 'object' || Array.isArray(source.data)) {
    throw new TypeError('[characterDuplication] source.data must be an object');
  }
  if (typeof source.data.characterName !== 'string' || source.data.characterName !== source.name) {
    throw new TypeError('[characterDuplication] source name and data.characterName must match');
  }

  const name = createDuplicateCharacterName({ sourceName: source.name, existingNames, copyLabel });
  const data = cloneData(source.data);
  data.characterName = name;

  return {
    id: duplicateId,
    name,
    level: source.level,
    originName: source.originName,
    data,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};
