// domain/equipmentKits.js
// Чистая логика комплектов снаряжения: без React, без данных конкретного
// сеттинга. Состав комплектов и требования к ним — ДАННЫЕ модуля.
//
// Движок знает только один механизм: комплект может заявлять требования
// по выбранным трейтам персонажа (`requiresTraitIds`). UI комплектов
// вызывает фильтр и показывает то, что прошло по данным. Никаких
// спец-веток «для семей» и т.п.

import { getSelectedSubTraits } from './traits';

/**
 * Множество id выбранных трейтов (включая под-трейты мульти-трейтов).
 * Для обычного одиночного трейта — его id; для семьи — id выбранной семьи.
 *
 * Учитывает обе формы хранения:
 *   - актуальная: trait.ids (массив) + trait.id;
 *   - legacy: одиночный trait без ids (id попадает в множество из getSelectedSubTraits).
 *
 * @param {object|null|undefined} trait
 * @returns {Set<string>}
 */
export function getSelectedTraitIdSet(trait) {
  const ids = new Set();
  // Прямые id из объекта трейта — актуальная форма (одиночный трейт или
  // первичный id мульти-трейта).
  if (trait?.id) ids.add(trait.id);
  if (Array.isArray(trait?.ids)) trait.ids.forEach((id) => id && ids.add(id));
  // Под-трейты из данных (резолв по реестру) — для наследных/составных форм.
  for (const t of getSelectedSubTraits(trait)) {
    if (t?.id) ids.add(t.id);
  }
  return ids;
}

/**
 * Доступен ли комплект персонажу с данным набором выбранных трейтов.
 *
 * Правило (по данным, единое для ВСЕХ комплектов):
 *   - `requiresTraitIds` отсутствует/пуст → комплект доступен всегда;
 *   - иначе комплект доступен, если ХОТЯ БЫ ОДИН из требуемых трейтов
 *     выбран у персонажа (комплект «привязан» к этому трейту).
 *
 * @param {object} kit                 запись комплекта из каталога
 * @param {Set<string>} selectedIds    множество id выбранных трейтов
 * @returns {boolean}
 */
export function kitIsAvailableForTraits(kit, selectedIds) {
  const required = Array.isArray(kit?.requiresTraitIds) ? kit.requiresTraitIds : [];
  if (required.length === 0) return true;
  return required.some((id) => selectedIds.has(id));
}

/**
 * Фильтрует список комплектов ориджина по требованиям из данных.
 * Одна общая логика для любых ориджинов: у «Трёх семей» каждый комплект
 * несёт свой requiresTraitIds и покажется только выбранной семье; у всех
 * остальных комплектов требования пусты и показываются все.
 *
 * @param {Array<object>} kits    записи комплектов ориджина
 * @param {object|null} trait     выбранный трейт персонажа
 * @returns {Array<object>}
 */
export function filterKitsForCharacter(kits, trait) {
  if (!Array.isArray(kits) || kits.length === 0) return [];
  const selectedIds = getSelectedTraitIdSet(trait);
  return kits.filter((kit) => kitIsAvailableForTraits(kit, selectedIds));
}
