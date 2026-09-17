// domain/salvageEngine.js
//
// Универсальный движок механики «разбор» (патч 260).
//
// Что он знает: ТОЛЬКО форму состава разбора:
//   composition = { options: [ [ comp, ... ], ... ] }   // альтернативы «или»
//   comp = { material, count? , base?, dc?, effect? }  // фикс, кости DC, база+кости
//   comp.effect = { material, count, anyOnce? } | { options: [comp...] }
// и запасной режим для НЕ-хлама: пул материалов + вес предмета + надбавка за ОД.
// Имена предметов, кубики и значение редкостей для него непрозрачны: всё это
// даёт сеттинг портами. Как и движок крафта, он не заглядывает в стор.
//
// Корневая система 2d20: осложнение успех не отменяет — оно помножает время
// (durationMultiplier из правила вызывающего; то же число, что введёт 258/259
// для крафта). Провал — предмет НЕ расходуется (принятый дефолт шага разбора).
//
// Формы результата (контракт для экранов и тестов):
//   { done: true,  spent: [{itemId, count}], granted: [{itemId, quantity, instanceId?}],
//     check, time: { minutes, durationMultiplier } }
//   { done: false, stage: 'check', reason: 'check-failed', spent: [], granted: [],
//     check, time }
//   { done: false, stage: 'store', reason: 'spend-refused', spent: [], granted: [],
//     check, time }

import { resolveD20Check } from './d20Checks';

const pickOption = (list, choose) => {
  if (!Array.isArray(list) || list.length === 0) return null;
  if (list.length === 1) return list[0];
  const index = Number(choose?.(list.length)) || 0;
  return list[((index % list.length) + list.length) % list.length];
};

const sumComponent = (comp, rollDice) => {
  const fixed = typeof comp.count === 'number' ? comp.count : 0;
  const base = typeof comp.base === 'number' ? comp.base : 0;
  let dice = { units: 0, effects: 0 };
  if (comp.dc != null) {
    dice = rollDice(Math.max(0, Number(comp.dc) || 0)) ?? dice;
  }
  return { units: fixed + base + (Number(dice.units) || 0), effects: Number(dice.effects) || 0 };
};

/**
 * Разбор по печатному составу (хлам из таблиц). Кости бросает порт rollDice(n)
 * → { units, effects }. Альтернативы и «or» эффектов разрешаются портом
 * choose(count) → индекс. Нули на костях — законный нулевой выход.
 */
export const computeJunkYields = ({ composition, rollDice, choose }) => {
  const alt = pickOption(composition?.options, choose);
  if (!Array.isArray(alt)) return null;
  const acc = new Map();
  const add = (material, units) => {
    if (material && units > 0) acc.set(material, (acc.get(material) || 0) + units);
  };
  for (const comp of alt) {
    const { units, effects } = sumComponent(comp, rollDice);
    add(comp.material, units);
    if (comp.effect && effects > 0) {
      const times = comp.effect.anyOnce ? 1 : effects;
      const target = comp.effect.options
        ? pickOption(comp.effect.options, choose)
        : comp.effect;
      if (target?.material) {
        for (let i = 0; i < times; i++) add(target.material, target.count ?? 1);
      }
    }
  }
  return [...acc.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([material, count]) => ({ material, count }));
};

/**
 * Разбор НЕ-хлама: один материал из разрешённого пула; количество — 1 единица
 * плюс надбавка за вложенные ОД (пока не считается: вызывающий передаёт
 * apBonus = 0), но не больше веса предмета (округление вниз, минимум 1).
 */
export const computeNonJunkYield = ({ pool, weight, apBonus = 0, choose }) => {
  const pick = pickOption(pool, choose);
  if (!pick?.id) return [];
  const cap = Math.max(1, Math.floor(Math.max(0, Number(weight) || 0)) || 1);
  const count = Math.min(1 + Math.max(0, Number(apBonus) || 0), cap);
  return [{ material: pick.id, count }];
};

/**
 * Полный проход: проверка (состав и кубики — ТОЛЬКО после успеха, провал не
 * расходует предмет и не бросает кости выхода) → атомарный обмен через порты.
 */
export const runSalvage = ({
  item,
  composition = null,
  pool = null,
  apBonus = 0,
  attributeValue = 0,
  skillValue = 0,
  isTagged = false,
  difficulty = 0,
  complicationDurationMultiplier = 1,
  minutes = 0,
  rollDice,
  choose,
  rollD20,
  spend,
  grant,
}) => {
  if (!item || typeof item.itemId !== 'string' || !item.itemId) {
    throw new Error('[salvageEngine] item.itemId is required');
  }
  if (typeof spend !== 'function' || typeof grant !== 'function') {
    throw new Error('[salvageEngine] ports { spend, grant } are required');
  }
  if (composition == null && !Array.isArray(pool)) {
    throw new Error('[salvageEngine] either composition or pool is required');
  }

  const check = resolveD20Check({
    attributeValue,
    skillValue,
    isTagged,
    difficulty,
    diceCount: 2,
    ...(rollD20 ? { rollD20 } : {}),
  });
  const durationMultiplier = check.complicationCount > 0
    ? complicationDurationMultiplier
    : 1;
  const time = { minutes, durationMultiplier };

  if (!check.passed) {
    return { done: false, stage: 'check', reason: 'check-failed', spent: [], granted: [], check, time };
  }

  const yields = composition
    ? computeJunkYields({ composition, rollDice, choose })
    : computeNonJunkYield({ pool, weight: item.weight, apBonus, choose });

  const plan = [{ itemId: item.itemId, count: 1 }];
  const spendResult = spend(plan);
  if (!spendResult || spendResult.ok !== true) {
    return {
      done: false,
      stage: 'store',
      reason: 'spend-refused',
      storeReason: spendResult?.reason ?? null,
      spent: [],
      granted: [],
      check,
      time,
    };
  }

  const granted = [];
  for (const yieldEntry of yields || []) {
    const grantResult = grant({ itemId: yieldEntry.material, quantity: yieldEntry.count });
    granted.push({
      itemId: yieldEntry.material,
      quantity: yieldEntry.count,
      ...(grantResult && typeof grantResult === 'object' && grantResult.instanceId
        ? { instanceId: grantResult.instanceId }
        : {}),
    });
  }

  return { done: true, spent: plan, granted, check, time };
};
