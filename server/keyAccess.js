'use strict';

/**
 * Патч 516: серверная проверка ключевой записи для точек доступа.
 * Патч 517: ворота — событие другой точки, общее на комнату.
 *
 * Чистая функция без сетевого состояния: решение принимается по снимку
 * общего хранилища комнаты, состояниям терминалов и журналу событий доступа.
 * Клиент НЕ решает, открыта точка или нет (урок 506). Контракт — разделы
 * 3.3–3.4 и 7.3–7.4 `docs/key-items-and-gates-design.md`.
 */

const KEY_ACCESS = Object.freeze({
  NONE: 'none',                 // требования нет
  OPEN_BY_KEY: 'open-by-key',   // ключ добыт: мини-игра не запускается
  DENIED: 'denied',             // обязательный ключ не добыт
  NEEDS_CHECK: 'needs-check',   // необязательный ключ не добыт, нужна проверка
  OPEN: 'open',                 // привязанная проверка пройдена
});

const hasKeyInStorage = (storage, keyItemId) => {
  const id = String(keyItemId || '').trim();
  if (!id) return false;
  return (Array.isArray(storage?.entries) ? storage.entries : []).some(
    (entry) => entry?.kind === 'keyItem' && String(entry?.keyItemId || '').trim() === id,
  );
};

/**
 * Проверка считается пройденной, если привязанная точка уже дала событие.
 * Патч 517: событие живёт на комнате, а не во вкладке игрока. Раньше ворота
 * умели смотреть только на победу в мини-игре терминала.
 */
const isCheckPassed = (sources, linkedCheckId) => {
  const id = String(linkedCheckId || '').trim();
  if (!id) return false;
  const events = sources?.accessEvents instanceof Map
    ? Object.fromEntries(sources.accessEvents.entries())
    : (sources?.accessEvents || {});
  if (events[id]) return true;
  const states = sources?.terminalStates instanceof Map
    ? Object.fromEntries(sources.terminalStates.entries())
    : (sources?.terminalStates || {});
  return states[id]?.game?.status === 'won';
};

/**
 * @param {object} requirement  { requiredKeyItemId, keyRequirement, linkedCheckId }
 * @param {object} options      { storage, terminalStates, accessEvents }
 * @returns {{ state: string, keyItemId: string, reason: string }}
 */
const resolveKeyAccess = (requirement = {}, options = {}) => {
  const keyItemId = String(requirement.requiredKeyItemId || '').trim();
  if (!keyItemId) {
    // Патч 517: ворота работают и без требования ключа.
    const linkedCheckId = String(requirement.linkedCheckId || '').trim();
    if (!linkedCheckId) {
      return { state: KEY_ACCESS.NONE, keyItemId: '', reason: 'no-requirement' };
    }
    return isCheckPassed(options, linkedCheckId)
      ? { state: KEY_ACCESS.OPEN, keyItemId: '', reason: 'gate-passed' }
      : { state: KEY_ACCESS.NEEDS_CHECK, keyItemId: '', reason: 'gate-pending' };
  }
  if (hasKeyInStorage(options.storage, keyItemId)) {
    return { state: KEY_ACCESS.OPEN_BY_KEY, keyItemId, reason: 'key-found' };
  }
  if (requirement.keyRequirement === 'required') {
    return { state: KEY_ACCESS.DENIED, keyItemId, reason: 'mandatory-key-missing' };
  }
  const linkedCheckId = String(requirement.linkedCheckId || '').trim();
  if (linkedCheckId && isCheckPassed(options, linkedCheckId)) {
    return { state: KEY_ACCESS.OPEN, keyItemId, reason: 'linked-check-passed' };
  }
  return { state: KEY_ACCESS.NEEDS_CHECK, keyItemId, reason: 'optional-key-missing' };
};

/** Можно ли пользоваться точкой без ручного решения Мастера. */
const isKeyAccessOpen = (state) => (
  state === KEY_ACCESS.NONE
  || state === KEY_ACCESS.OPEN_BY_KEY
  || state === KEY_ACCESS.OPEN
);

/** Нужно ли показывать точку как «открытую ключом». */
const isUnlockedByKey = (state) => state === KEY_ACCESS.OPEN_BY_KEY;

module.exports = {
  KEY_ACCESS,
  hasKeyInStorage,
  isCheckPassed,
  resolveKeyAccess,
  isKeyAccessOpen,
  isUnlockedByKey,
};
