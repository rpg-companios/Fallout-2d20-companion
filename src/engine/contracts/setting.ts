// КОНТРАКТ ВЫВОДИМОСТИ — расширение сеттинга (МК-1, патч 281).
//
// Точка сборки: сеттинг описывает себя для движка одним объектом. Ключевая
// мысль плана v3 (docs/architecture/typescript-migration-plan.md): движок
// исполняет универсальные правила, сеттинг их объявляет. Сеттинг остаётся
// живым JavaScript — типы этой папки и есть «дверь» между мирами.
//
// Основа — уже действующий контракт расширений состояния
// (src/store/stateExtensions.js, патч 207): { id, fieldKey, factory,
// hydrate, reset }. МК-1 добавляет к нему декларации выводимости.

import type { CounterDefinition } from './counter';
import type { DerivedDefinition } from './derived';
import type { ParameterDefinition, ParameterModifier } from './parameter';
import type { RankBands } from './bands';
import type { ReactionDefinition } from './reactions';
import type { Requirement } from './requirements';

/** Полное объявление сеттинга для движка. */
export interface SettingExtension {
  /** Префикс сеттинга: 'fallout', 'test'. Все id внутри — с ним. */
  id: string;
  /** Поля состояния персонажа (контракт патча 207, без изменений). */
  fieldKey?: string;
  factory?: (character: unknown) => unknown;
  hydrate?: (saved: unknown, character: unknown) => unknown;
  reset?: () => unknown;
  /** Объявления выводимости (новое с МК-1). */
  parameters?: readonly ParameterDefinition[];
  derived?: readonly DerivedDefinition[];
  counters?: readonly CounterDefinition[];
  rankBands?: readonly RankBands[];
  requirements?: readonly Requirement[];
  reactions?: readonly ReactionDefinition[];
  /** Стартовые модификаторы (ориджин/трейты) — применяются при создании. */
  initialModifiers?: readonly ParameterModifier[];
}

/** Проверка формы SettingExtension на загрузке (дверь JS→TS). */
export const validateSettingExtension = (ext: SettingExtension): readonly string[] => {
  const errors: string[] = [];
  const push = (cond: boolean, msg: string) => {
    if (cond) errors.push(msg);
  };
  push(typeof ext.id !== 'string' || ext.id === '', 'setting: id обязателен');
  const arrays: Array<readonly unknown[]> = [
    ext.parameters ?? [],
    ext.derived ?? [],
    ext.counters ?? [],
    ext.rankBands ?? [],
    ext.requirements ?? [],
    ext.reactions ?? [],
    ext.initialModifiers ?? [],
  ];
  arrays.forEach((arr, i) => {
    push(!Array.isArray(arr), `setting "${ext.id}": секция #${i} должна быть массивом`);
  });
  return errors;
};
