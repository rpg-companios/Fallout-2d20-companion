'use strict';

/**
 * Патч 521: мелочи «Общего хранилища» — стаканье одинаковых предметов и лимиты.
 *
 * Модуль чистый: без сети, без состояния комнаты и без React. Все функции
 * работают с обычным массивом записей и не мутируют входные данные, поэтому
 * сервер может сначала проверить перенос целиком, а уже потом применять его
 * (правило «пока кнопка «Перенести» не нажата, предметы не перенесены»).
 */

const STORAGE_LIMITS = Object.freeze({
  /** Максимум строк на складе, включая ключевые записи. */
  MAX_ENTRIES: 200,
  /** Максимум предметов в одном стеке; излишек уходит в новую строку. */
  MAX_STACK_QUANTITY: 999,
  /** Максимум операций в одном атомарном переносе. */
  MAX_TRANSFER_OPERATIONS: 50,
  /** Максимум предметов в одной операции. */
  MAX_QUANTITY_PER_OPERATION: 999,
});

// Служебные поля экземпляра предмета не участвуют в сравнении: два одинаковых
// пулемёта с разными uniqueId должны лежать в одной строке склада.
const SERVICE_FIELDS = Object.freeze([
  'uniqueId', 'equipInstanceId', 'stackKey', 'equipped', 'locked', 'appliedMods', 'quantity',
]);

const stableStringify = (value) => {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) === undefined ? 'null' : JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value)
    .filter((key) => !SERVICE_FIELDS.includes(key) && value[key] !== undefined)
    .sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
};

/** Ключ стаканья по снимку предмета, устойчивый к порядку полей. */
const storageStackKey = (item) => stableStringify(item && typeof item === 'object' ? item : {});

/** Индекс первой строки, куда можно доложить предмет. Ключи не стакаются. */
const findStackIndex = (entries, item) => {
  const key = storageStackKey(item);
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry || entry.kind === 'keyItem') continue;
    if (Number(entry.quantity) >= STORAGE_LIMITS.MAX_STACK_QUANTITY) continue;
    if (storageStackKey(entry.item) !== key) continue;
    return index;
  }
  return -1;
};

/**
 * Применить поступления к уже подготовленному массиву записей (после списаний).
 * Принимает `{ item | plain, quantity | qty, name }`.
 * Возвращает `{ entries, added, error }`; при `error` исходный массив не меняется.
 */
const applyStorageDeposits = ({ entries = [], deposits = [], makeEntry, at = Date.now() }) => {
  const next = (Array.isArray(entries) ? entries : []).map((entry) => ({ ...entry }));
  const added = [];
  for (const put of (Array.isArray(deposits) ? deposits : [])) {
    const item = put.item || put.plain;
    const name = String(put.name || '').trim() || 'Предмет';
    let remaining = Math.max(1, Math.floor(Number(put.quantity ?? put.qty) || 1));
    while (remaining > 0) {
      const index = findStackIndex(next, item);
      if (index >= 0) {
        const target = next[index];
        const free = STORAGE_LIMITS.MAX_STACK_QUANTITY - Number(target.quantity);
        const portion = Math.max(1, Math.min(free, remaining));
        const merged = { ...target, quantity: Number(target.quantity) + portion };
        next[index] = merged;
        added.push({ ...merged });
        remaining -= portion;
        continue;
      }
      if (next.length >= STORAGE_LIMITS.MAX_ENTRIES) {
        return { entries, added: [], error: 'STORAGE_FULL' };
      }
      const portion = Math.min(remaining, STORAGE_LIMITS.MAX_STACK_QUANTITY);
      const entry = makeEntry({ item, name, quantity: portion, at });
      next.push(entry);
      added.push({ ...entry });
      remaining -= portion;
    }
  }
  return { entries: next, added, error: null };
};

module.exports = {
  STORAGE_LIMITS,
  storageStackKey,
  findStackIndex,
  applyStorageDeposits,
};
