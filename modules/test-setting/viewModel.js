// ТЕСТОВЫЙ СЕТТИНГ — вью-модель песочницы (МК-2, патч 286).
//
// Чистая функция: результат каскада реестра → строки для экрана. Никакого
// react-native — логика экрана проверяется в vitest, экран только рисует.

import { checkRequirements } from '../../src/engine/contracts';
import { ATTRIBUTES, SKILLS, SPELLS, rankCeilingId } from './index';

const DERIVED_ROWS = [
  ['test.derived.maxHealth', 'Здоровье'],
  ['test.derived.maxMana', 'Манна'],
  ['test.derived.magicPower', 'Сила магии'],
  ['test.derived.defense', 'Защита'],
  ['test.derived.attack', 'Нападение'],
];

/**
 * Собрать вью-модель песочницы из результата registry.evaluate().
 * Возвращает строки для экрана: атрибуты, навыки (с потолками), производные,
 * счётчики и заклинания с гейтами (требование ранга) и карманом (манна).
 */
export const buildSandboxViewModel = ({ values, ceilings }) => ({
  attributes: ATTRIBUTES.map((a) => ({
    id: a.id,
    label: a.label,
    value: values[a.id] ?? 0,
  })),
  skills: SKILLS.map((s) => {
    const ceiling = values[rankCeilingId(s.id)] ?? 0;
    const value = values[s.id] ?? 0;
    return {
      id: s.id,
      label: s.label,
      value,
      ceiling,
      atCeiling: value >= ceiling,
    };
  }),
  derived: DERIVED_ROWS.map(([id, label]) => ({
    id,
    label,
    value: values[id] ?? 0,
  })),
  counters: {
    health: ceilings['test.counter.health'] ?? 0,
    mana: ceilings['test.counter.mana'] ?? 0,
  },
  spells: SPELLS.map((spell) => {
    const gate = checkRequirements([spell.requirement], values);
    const manaOk = spell.manaCost <= (ceilings['test.counter.mana'] ?? 0);
    return {
      id: spell.id,
      name: spell.name,
      cost: spell.manaCost,
      gateOk: gate.ok,
      manaOk,
      allowed: gate.ok && manaOk,
    };
  }),
});
