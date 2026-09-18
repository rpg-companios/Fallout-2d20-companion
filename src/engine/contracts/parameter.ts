// КОНТРАКТ ВЫВОДИМОСТИ — параметры (МК-1, патч 281).
//
// Параметр — число, которым сеттинг описывает персонажа: атрибут, навык,
// производное здоровье, потолок и т.п. Движок ничего не знает о смыслах:
// он хранит значения и применяет модификаторы по правилам этого контракта.
//
// v1: значение — только число (ParameterValueKind зафиксирован для будущего
// расширения на «дорожки» и списки, но движок пока принимает 'number').

/** Операция модификатора параметра.
 *  - '+'  — прибавить к базе;
 *  - '-'  — вычесть из базы;
 *  - '%'  — процент от результата базы (см. порядок в derived.ts);
 *  - 'set' — заменить базу целиком (семантика «СИЛ в силовой броне = 11»). */
export type ModifierOperation = '+' | '-' | '%' | 'set';

/** Один модификатор параметра: источник обязателен — для отчёта «откуда что». */
export interface ParameterModifier {
  /** Стабильный источник: id перка, предмета, эффекта, брони. */
  source: string;
  operation: ModifierOperation;
  value: number;
}

/** Kind значения параметра. v1 — только 'number'. */
export type ParameterValueKind = 'number' | 'track' | 'list';

/** Объявление параметра. Значение живёт в состоянии; объявление — в сеттинге. */
export interface ParameterDefinition {
  /** Полный id: с префиксом сеттинга ('fallout.maxHealth'). */
  id: string;
  kind: ParameterValueKind;
  /** Человекочитаемое имя для ошибок и трассировки. */
  label: string;
  /** Необязательный потолок, которого держит движок (может быть ссылкой на derived). */
  max?: number | string;
}

/** Модификаторы, сгруппированные по параметру. */
export type ModifierBag = Record<string, ParameterModifier[]>;

/**
 * Применить модификаторы к базовому значению в договорном порядке:
 *   1) 'set' — последний set заменяет базу (если set несколько, берём последний
 *      по порядку массива: «переопределение» сильнее «дополнения»);
 *   2) '+' и '-' складываются в любом порядке (аддитивы коммутативны);
 *   3) '%' суммируются и применяются к результату шага 2;
 *   4) итог округляется Math.round.
 * Функция чистая; параметр без модификаторов возвращается как есть.
 */
export const applyModifiers = (base: number, modifiers: readonly ParameterModifier[]): number => {
  let value = base;
  let percents = 0;
  for (const mod of modifiers) {
    if (mod.operation === 'set') value = mod.value;
  }
  for (const mod of modifiers) {
    if (mod.operation === '+') value += mod.value;
    else if (mod.operation === '-') value -= mod.value;
    else if (mod.operation === '%') percents += mod.value;
  }
  if (percents !== 0) value = value * (1 + percents / 100);
  return Math.round(value);
};
