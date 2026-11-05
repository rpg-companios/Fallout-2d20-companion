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

const {
  resolveAccessExpression,
  evaluateAccessExpression,
} = require('./accessExpression.js');

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
const linkedCheckIdsOf = (requirement = {}) => {
  const ids = [
    ...(Array.isArray(requirement.linkedCheckIds) ? requirement.linkedCheckIds : []),
    requirement.linkedCheckId,
  ];
  const seen = new Set();
  const out = [];
  for (const value of ids) {
    const id = String(value || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
};

/**
 * Патч 520: если в требованиях указаны и терминал, и замок, они НЕ блокируют
 * точку одновременно. Достаточно любого пройденного источника — «ИЛИ».
 * Патч 538: legacy-ИЛИ сохранён как частный случай выражения из одних '/'.
 */
const anyCheckPassed = (options, requirement) => linkedCheckIdsOf(requirement)
  .some((id) => isCheckPassed(options, id));

/**
 * Патч 538: ворота-выражение И/ИЛИ. Источник истины — accessExpression
 * (+ = И, / = ИЛИ); у старых карточек без него собирается legacy-ИЛИ из
 * linkedCheckIds. Пустое выражение = требования нет (возвращаем false, а
 * решение «требования нет» принимает resolveKeyAccess по длине списка).
 */
const gateExpressionPassed = (options, requirement) => {
  const expression = resolveAccessExpression(requirement);
  if (expression.length === 0) return false;
  return evaluateAccessExpression(expression, (id) => isCheckPassed(options, id));
};

/** Есть ли у точки хоть одна проверка-операнд в требовании. */
const hasGateChecks = (requirement) => resolveAccessExpression(requirement).length > 0;

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
    // Патч 538: выражение И/ИЛИ вместо принудительного ИЛИ.
    if (!hasGateChecks(requirement)) {
      return { state: KEY_ACCESS.NONE, keyItemId: '', reason: 'no-requirement' };
    }
    return gateExpressionPassed(options, requirement)
      ? { state: KEY_ACCESS.OPEN, keyItemId: '', reason: 'gate-passed' }
      : { state: KEY_ACCESS.NEEDS_CHECK, keyItemId: '', reason: 'gate-pending' };
  }
  if (hasKeyInStorage(options.storage, keyItemId)) {
    return { state: KEY_ACCESS.OPEN_BY_KEY, keyItemId, reason: 'key-found' };
  }
  if (requirement.keyRequirement === 'required') {
    return { state: KEY_ACCESS.DENIED, keyItemId, reason: 'mandatory-key-missing' };
  }
  if (hasGateChecks(requirement) && gateExpressionPassed(options, requirement)) {
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
  linkedCheckIdsOf,
  anyCheckPassed,
  gateExpressionPassed,
  hasGateChecks,
  resolveKeyAccess,
  isKeyAccessOpen,
  isUnlockedByKey,
};
