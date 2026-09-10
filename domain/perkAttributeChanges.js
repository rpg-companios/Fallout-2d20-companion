// domain/perkAttributeChanges.js
//
// План применения распределённых очков перков к атрибутам (патч 219).
//
// Дельта каждого атрибута считается от актуальной базы СТОРА — единственного
// источника истины, а не от массива контекста. Контекст отстаёт от стора
// после предыдущих коммитов очков перков, и отсчёт от устаревшей базы
// повторно начислял уже распределённые очки: 8 + два ранга «Интенсивных
// тренировок» давали +1 и +2 (итог 11) вместо +1 и +1 (итог 10).
// Если стор атрибут ещё не знает (создание персонажа до первого
// распределения) — отсчёт от значения контекста, как было раньше.

/**
 * @param {Array<{name: string, value: number}>} newAttributes — целевые значения
 *   после распределения очков перков (tempAttributes экрана персонажа).
 * @param {Object<string, {base?: number}>} storeAttributes — dict атрибутов
 *   зустанд-стора (актуальная база).
 * @param {Object<string, number>} contextValues — значения массива контекста
 *   (фолбэк для атрибутов, которых стор ещё не знает).
 * @returns {Array<{name: string, delta: number, baseSource: 'store'|'context'}>}
 */
export const planPerkAttributeDeltas = ({
  newAttributes = [],
  storeAttributes = {},
  contextValues = {},
} = {}) => {
  const attrs = Array.isArray(newAttributes) ? newAttributes : [];
  return attrs.map((newAttr) => {
    const name = typeof newAttr?.name === 'string' ? newAttr.name : '';
    const value = Number(newAttr?.value);
    if (!name) return { name: '', delta: 0, baseSource: 'context' };
    const storeAttr = storeAttributes?.[name];
    const storeBase = storeAttr && Number.isFinite(storeAttr.base) ? storeAttr.base : null;
    const contextValue = Number.isFinite(contextValues?.[name]) ? contextValues[name] : 0;
    const base = storeBase == null ? contextValue : storeBase;
    const delta = Number.isFinite(value) ? value - base : 0;
    return { name, delta, baseSource: storeBase == null ? 'context' : 'store' };
  });
};
