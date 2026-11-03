'use strict';

/**
 * Патч 516: серверная проверка ключевой записи для точек доступа.
 *
 * Чистая функция без серверного состояния: решение принимается по снимку
 * общего хранилища комнаты и по состояниям терминалов. Клиент НЕ решает,
 * открыта точка или нет (урок 506). Контракт — разделы 7.3–7.4
 * `docs/key-items-and-gates-design.md`.
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

/** Проверка считается пройденной, если привязанный терминал взломан. */
const isCheckPassed = (terminalStates, linkedCheckId) => {
  const id = String(linkedCheckId || '').trim();
  if (!id) return false;
  const states = terminalStates instanceof Map
    ? Object.fromEntries(terminalStates.entries())
    : (terminalStates || {});
  return states[id]?.game?.status === 'won';
};

/**
 * @param {object} requirement  { requiredKeyItemId, keyRequirement, linkedCheckId }
 * @param {object} options      { storage, terminalStates }
 * @returns {{ state: string, keyItemId: string, reason: string }}
 */
const resolveKeyAccess = (requirement = {}, options = {}) => {
  const keyItemId = String(requirement.requiredKeyItemId || '').trim();
  if (!keyItemId) {
    return { state: KEY_ACCESS.NONE, keyItemId: '', reason: 'no-requirement' };
  }
  if (hasKeyInStorage(options.storage, keyItemId)) {
    return { state: KEY_ACCESS.OPEN_BY_KEY, keyItemId, reason: 'key-found' };
  }
  if (requirement.keyRequirement === 'required') {
    return { state: KEY_ACCESS.DENIED, keyItemId, reason: 'mandatory-key-missing' };
  }
  const linkedCheckId = String(requirement.linkedCheckId || '').trim();
  if (linkedCheckId && isCheckPassed(options.terminalStates, linkedCheckId)) {
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
