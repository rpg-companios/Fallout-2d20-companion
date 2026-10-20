// Реестр расширений состояния персонажа — родовой механизм движка (патч 207).
//
// ЗАЧЕМ.
//   Универсальный движок не должен знать правила сеттинга, но сеттинг вправе
//   добавлять персонажу состояние (поле сейва, инициализацию при создании,
//   миграцию старых сейвов, операции). Раньше механика одного сеттинга была
//   зашита в engine-код и цепочку миграций напрямую. Реестр — то место, где
//   активный пакет регистрирует своё расширение, а движок применяет его без
//   знания правил.
//
// КОНТРАКТ РАСШИРЕНИЯ.
//   { id, fieldKey, factory(character), hydrate(saved, character)?, reset()?, serialize(value)? }
//   - id       — уникальный ключ расширения.
//   - fieldKey — имя поля в сейве, которым владеет расширение.
//   - factory  — начальное состояние при создании персонажа (origin уже
//                выбран). Может вернуть null — поле создаётся, но пустое
//                для типов персонажей, которым расширение не применимо.
//   - hydrate  — НЕОБЯЗАТЕЛЬНО: нормализация поля при загрузке сейва. Должна
//                быть идемпотентна. По умолчанию поле берётся как есть.
//   - reset    — состояние поля при сбросе персонажа. По умолчанию null.
//   - serialize — необязательная проекция кэшируемого значения (например,
//                 исключение временных диалоговых данных).
//   Миграции версий регистрируются отдельно (registerStateMigration): они
//   компонуются с переходом migrateCharacterState на зарезервированном
//   индексе MIGRATIONS и не меняют нумерацию schemaVersion. Отдельно регистрируются
//   слушатели применённых расходников (registerConsumableAppliedListener):
//   движок уведомляет их из applyConsumableFull.
//
// ПРАВИЛА (владелец):
//   - никаких сеттинговых имён/правил в этом файле — только движковый
//     реестр; активный пакет регистрирует свои расширения сам.
//   - поле сейва появляется миграцией версии (а не `|| fallback` при
//     загрузке), как и раньше: hydrate не заменяет миграции.
//   - регистрация идемпотентна: повторный вызов с тем же id — ошибка
//     (двойное владение полем — дефект данных).

const EXTENSIONS = new Map();

export const registerStateExtension = (extension) => {
  if (!extension || typeof extension !== 'object') {
    throw new Error('[stateExtensions] Расширение состояния должно быть объектом');
  }
  if (typeof extension.id !== 'string' || !extension.id) {
    throw new Error('[stateExtensions] Расширение состояния обязано иметь id');
  }
  if (typeof extension.fieldKey !== 'string' || !extension.fieldKey) {
    throw new Error(`[stateExtensions] Расширение "${extension.id}" обязано указать fieldKey`);
  }
  if (typeof extension.factory !== 'function') {
    throw new Error(`[stateExtensions] Расширение "${extension.id}" обязано иметь factory`);
  }
  if (extension.hydrate !== undefined && typeof extension.hydrate !== 'function') {
    throw new Error(`[stateExtensions] hydrate расширения "${extension.id}" должен быть функцией`);
  }
  if (extension.reset !== undefined && typeof extension.reset !== 'function') {
    throw new Error(`[stateExtensions] reset расширения "${extension.id}" должен быть функцией`);
  }
  if (extension.serialize !== undefined && typeof extension.serialize !== 'function') {
    throw new Error(`[stateExtensions] serialize расширения "${extension.id}" должен быть функцией`);
  }
  if (EXTENSIONS.has(extension.id)) {
    throw new Error(`[stateExtensions] Расширение "${extension.id}" уже зарегистрировано`);
  }
  for (const registered of EXTENSIONS.values()) {
    if (registered.fieldKey === extension.fieldKey) {
      throw new Error(
        `[stateExtensions] Поле "${extension.fieldKey}" уже принадлежит расширению "${registered.id}"`,
      );
    }
  }
  EXTENSIONS.set(extension.id, extension);
  return () => {
    if (EXTENSIONS.get(extension.id) === extension) EXTENSIONS.delete(extension.id);
  };
};

export const getRegisteredStateExtensions = () => Array.from(EXTENSIONS.values());

/**
 * Расширения к состоянию только что созданного персонажа: объект полей
 * { [fieldKey]: value } по всем зарегистрированным расширениям. Вызывается
 * при выборе ориджина/типа персонажа (поле ещё не существует в сейве).
 * factory получает { origin, trait } — на момент создания трейта может ещё
 * не быть, сеттинг сам решает, что ему нужно.
 */
export const createStateExtensionFields = (character) => {
  const fields = {};
  for (const extension of EXTENSIONS.values()) {
    fields[extension.fieldKey] = extension.factory(character);
  }
  return fields;
};

/**
 * Нормализация поля расширения при загрузке сейва. Идемпотентные hydrate
 * позволяют сеттингу чинить/достраивать своё поле, не поднимая версию
 * схемы (сейв остаётся совместимым со старыми версиями приложения).
 * Возвращает { [fieldKey]: normalized }.
 */
export const hydrateStateExtensionFields = (savedState, character) => {
  const fields = {};
  for (const extension of EXTENSIONS.values()) {
    const raw = savedState[extension.fieldKey];
    fields[extension.fieldKey] = extension.hydrate
      ? extension.hydrate(raw, character)
      : raw;
  }
  return fields;
};

/** Поля расширений при полном сбросе персонажа (создание нового). */
export const resetStateExtensionFields = () => {
  const fields = {};
  for (const extension of EXTENSIONS.values()) {
    fields[extension.fieldKey] = extension.reset ? extension.reset() : null;
  }
  return fields;
};

/** Project runtime extension values into their local persisted-cache shape. */
export const serializeStateExtensionFields = (stateExtensions = {}) => {
  const fields = { ...(stateExtensions || {}) };
  for (const extension of EXTENSIONS.values()) {
    const { fieldKey } = extension;
    if (!Object.hasOwn(fields, fieldKey) || typeof extension.serialize !== 'function') continue;
    fields[fieldKey] = extension.serialize(fields[fieldKey]);
  }
  return fields;
};

// --- Миграции расширений ---------------------------------------------------

// Зарегистрированные миграции: [{ migration, index }]. index — зарезервированный
// переход в массиве MIGRATIONS движка (vN -> vN+1). Миграции сеттинга
// компонуются внутри этого перехода и не добавляют версию схемы.
const MIGRATION_REGISTRATIONS = [];

export const registerStateMigration = (migration, index) => {
  if (typeof migration !== 'function') {
    throw new Error('[stateExtensions] Миграция расширения должна быть функцией');
  }
  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`[stateExtensions] Некорректный индекс миграции расширения: ${index}`);
  }
  const registration = { migration, index };
  MIGRATION_REGISTRATIONS.push(registration);
  return () => {
    const registrationIndex = MIGRATION_REGISTRATIONS.indexOf(registration);
    if (registrationIndex >= 0) MIGRATION_REGISTRATIONS.splice(registrationIndex, 1);
  };
};

export const getRegisteredStateMigrations = () => Array.from(MIGRATION_REGISTRATIONS);

// --- Слушатели применённых расходников -------------------------------------

// Родовое уведомление «расходник применён на себя» (патч 208). Движок
// вызывает слушателей в конце applyConsumableFull и собирает их результаты
// в extensionResults; пакет сам решает, какие собственные поля обновить.
// Движок правил не знает.
//
// Контракт слушателя: (item, ctx) => result | null, где ctx —
// { stateExtensions, setStateExtension } (чтение/запись полей расширений),
// result — произвольный объект с id слушателя (или null, если предмет
// слушателя не касается). Исключение слушателя — дефект, роняем
// применение, чтобы не молча терять состояние.
const CONSUMABLE_LISTENERS = new Map();

export const registerConsumableAppliedListener = (entry) => {
  if (!entry || typeof entry !== 'object') {
    throw new Error('[stateExtensions] Слушатель расходников должен быть объектом');
  }
  if (typeof entry.id !== 'string' || !entry.id) {
    throw new Error('[stateExtensions] Слушатель расходников обязан иметь id');
  }
  if (typeof entry.listener !== 'function') {
    throw new Error(`[stateExtensions] Слушатель расходников "${entry.id}" обязан иметь listener`);
  }
  if (CONSUMABLE_LISTENERS.has(entry.id)) {
    throw new Error(`[stateExtensions] Слушатель расходников "${entry.id}" уже зарегистрирован`);
  }
  CONSUMABLE_LISTENERS.set(entry.id, entry.listener);
  return () => {
    if (CONSUMABLE_LISTENERS.get(entry.id) === entry.listener) CONSUMABLE_LISTENERS.delete(entry.id);
  };
};

export const getRegisteredConsumableAppliedListeners = () =>
  Array.from(CONSUMABLE_LISTENERS.entries());

export const notifyConsumableApplied = (item, ctx) => {
  const results = [];
  for (const [id, listener] of CONSUMABLE_LISTENERS) {
    const result = listener(item, ctx);
    if (result != null) {
      results.push(result && typeof result === 'object' ? { ...result, id } : { id });
    }
  }
  return results;
};

// --- Слушатели событий состояний -------------------------------------------

// Родовое уведомление об изменении состояния персонажа. Движок вызывает
// подписанные слушатели с пакетом { kind, event, ...payload } и передаёт
// их результаты вызывающему коду; активный пакет решает, какие собственные
// поля обновить. Движок правил не знает.
//
// Контракт слушателя: (payload, ctx) => result | null, где ctx —
// { stateExtensions, setStateExtension }; result — произвольный объект
// с id слушателя (или null, если событие слушателя не касается).
// Исключение слушателя — дефект, роняем уведомление.
const CONDITION_EVENT_LISTENERS = new Map();

export const registerConditionEventListener = (entry) => {
  if (!entry || typeof entry !== 'object') {
    throw new Error('[stateExtensions] Слушатель событий состояний должен быть объектом');
  }
  if (typeof entry.id !== 'string' || !entry.id) {
    throw new Error('[stateExtensions] Слушатель событий состояний обязан иметь id');
  }
  if (typeof entry.kind !== 'string' || !entry.kind) {
    throw new Error(`[stateExtensions] Слушатель \"${entry.id}\" обязан указать kind`);
  }
  if (typeof entry.event !== 'string' || !entry.event) {
    throw new Error(`[stateExtensions] Слушатель \"${entry.id}\" обязан указать event`);
  }
  if (typeof entry.listener !== 'function') {
    throw new Error(`[stateExtensions] Слушатель \"${entry.id}\" обязан иметь listener`);
  }
  const key = `${entry.kind}:${entry.event}:${entry.id}`;
  if (CONDITION_EVENT_LISTENERS.has(key)) {
    throw new Error(`[stateExtensions] Слушатель \"${entry.id}\" (${entry.kind}:${entry.event}) уже зарегистрирован`);
  }
  CONDITION_EVENT_LISTENERS.set(key, entry);
  return () => {
    if (CONDITION_EVENT_LISTENERS.get(key) === entry) CONDITION_EVENT_LISTENERS.delete(key);
  };
};

export const getRegisteredConditionEventListeners = () =>
  Array.from(CONDITION_EVENT_LISTENERS.values());

export const notifyConditionEvent = (payload, ctx) => {
  const results = [];
  for (const entry of CONDITION_EVENT_LISTENERS.values()) {
    if (entry.kind !== payload?.kind || entry.event !== payload?.event) continue;
    const result = entry.listener(payload, ctx);
    if (result != null) {
      results.push(result && typeof result === 'object' ? { ...result, id: entry.id } : { id: entry.id });
    }
  }
  return results;
};
