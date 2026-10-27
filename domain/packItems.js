// domain/packItems.js
// Полное удаление пака контента (закон владельца 2026-10-19: «без следов»).
// Чистый обходчик сейва персонажа: вырезает всё с префиксом `hb_<packId>_`.
// Правила:
// - в массивах: выкидываем строковые id пака (списки модов/слотов) и объекты
//   с id пака (экземпляры в инвентаре);
// - в объектах: значение-объект с id пака удаляем целиком (надетые слоты
//   `equipped.hands = {id: 'hb_…'}`);
// - СКАЛЯРНЫЕ значения объектов не трогаем осознанно: словари вида
//   `{ id_патрона: количество }` — статистика, не список предметов; ключи
//   словарей данных ломать нельзя. Если где-то появится висячая строковая
//   ссылка на удалённый id — она отобразится как id (защита по закону
//   «нет перевода — показываем id»), падением не грозит.

import { itemIdPrefix } from '../src/itempack/contract';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Возвращает { data, removed } — копию сейва без следов пака и счётчик
 * удалённых сущностей (для диалога «удалится N предметов»).
 */
export const stripPackFromSaveData = (data, packId) => {
  const prefix = itemIdPrefix(packId);
  let removed = 0;

  const isPackObject = (v) => isObj(v) && typeof v.id === 'string' && v.id.startsWith(prefix);

  const walk = (node) => {
    if (Array.isArray(node)) {
      const out = [];
      for (const el of node) {
        if (typeof el === 'string' && el.startsWith(prefix)) { removed += 1; continue; }
        if (isPackObject(el)) { removed += 1; continue; }
        out.push(walk(el));
      }
      return out;
    }
    if (isObj(node)) {
      if (typeof node.id === 'string' && node.id.startsWith(prefix)) {
        removed += 1;
        return null; // корневой объект-предмет пака (см. обработку в объектах)
      }
      const out = {};
      for (const [key, value] of Object.entries(node)) {
        if (isPackObject(value)) { removed += 1; continue; }
        out[key] = walk(value);
      }
      return out;
    }
    return node;
  };

  return { data: walk(data), removed };
};

/** Сухой подсчёт следов пака в сейве (для превью диалога удаления). */
export const countPackItemsInSaveData = (data, packId) =>
  stripPackFromSaveData(data, packId).removed;
