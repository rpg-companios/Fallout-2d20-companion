'use strict';

/**
 * Патч 522: складирование по закону инвентаря.
 *
 * Игровых ограничений нет: ни веса, ни числа строк, ни размера стопки, ни
 * потолка количества за операцию. Осталась только ЗАЩИТА СЕРВЕРА — валидация
 * количества, санитайзинг сетевого снимка и предел числа операций в одном
 * сообщении (вместе с LIMITS.MAX_MESSAGE_BYTES на уровне WebSocket).
 *
 * Все правила стака приходят из `domain/itemStacking.js` — того же модуля, что
 * используют инвентарь и торговцы. Моды, заряды, прочность и уникальные качества
 * разделяют стопки; одинаковые предметы склеиваются.
 */

const {
  PROTOCOL_MAX_TRANSFER_OPERATIONS,
  sanitizeItemSnapshot,
  isValidQuantity,
  itemStackKey,
  effectiveItemCost,
  effectiveItemWeight,
} = require('./itemStacking.js');

/** Индекс строки, в которую можно доложить предмет. Ключи не стакаются. */
const findStackIndex = (entries, item) => {
  const key = itemStackKey(item);
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry || entry.kind === 'keyItem') continue;
    if (itemStackKey(entry.item) !== key) continue;
    return index;
  }
  return -1;
};

/**
 * Применить поступления к уже подготовленному массиву записей (после списаний).
 * Принимает `{ item | plain, quantity | qty, name }`.
 * Возвращает `{ entries, added, error }`; при `error` исходный массив не меняется,
 * поэтому перенос остаётся атомарным.
 */
const applyStorageDeposits = ({ entries = [], deposits = [], makeEntry, at = Date.now() }) => {
  const next = (Array.isArray(entries) ? entries : []).map((entry) => ({ ...entry }));
  const added = [];
  const list = Array.isArray(deposits) ? deposits : [];

  for (const put of list) {
    const rawItem = put.item || put.plain;
    const clean = sanitizeItemSnapshot(rawItem);
    const quantity = Number(put.quantity ?? put.qty);
    if (!clean || !isValidQuantity(quantity)) {
      return { entries, added: [], error: 'STORAGE_BAD_MESSAGE' };
    }
    const name = String(put.name || clean.name || '').trim() || 'Предмет';
    const index = findStackIndex(next, clean);
    if (index >= 0) {
      const target = next[index];
      const merged = { ...target, quantity: Number(target.quantity) + quantity };
      next[index] = merged;
      added.push({ ...merged });
    } else {
      const entry = makeEntry({ item: clean, name, quantity, at });
      next.push(entry);
      added.push({ ...entry });
    }
  }
  return { entries: next, added, error: null };
};

module.exports = {
  // Технический предохранитель протокола, НЕ игровой лимит.
  PROTOCOL_MAX_TRANSFER_OPERATIONS,
  sanitizeItemSnapshot,
  isValidQuantity,
  effectiveItemCost,
  effectiveItemWeight,
  // Алиас для прежних тестов и внешних потребителей.
  storageStackKey: itemStackKey,
  itemStackKey,
  findStackIndex,
  applyStorageDeposits,
};
