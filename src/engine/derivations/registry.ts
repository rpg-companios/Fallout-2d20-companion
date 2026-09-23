// РЕЕСТР ВЫВОДИМОСТИ (МК-1, патчи 281–283).
//
// Исполняемая часть контракта: сеттинг регистрирует декларации, движок
// валидирует их, строит топологический порядок и вычисляет каскадом.
//
// ИЗОЛЯЦИЯ (важно): реестр НИЧЕГО не подменяет в работающей программе —
// его импортируют только тесты контракта. МК-3, шаг 2 (патч 317): ручные
// вызовы пересчёта в сторе умерли (каскад в withDerivedCascade, формулы —
// модульные, 316); декларативный переезд формул сеттинга в ЭТОТ реестр —
// следующий шаг МК-3, с паритет-тестом на реальных сейвах.
//
// ПРАВИЛА:
//   - id уникальны глобально и обязаны начинаться с префикса сеттинга
//     ('fallout.maxHealth') — коллизии между сеттингами исключены;
//   - deps непусты и ссылаются только на известные параметры/производные;
//   - цикл в графе зависимостей — ошибка регистрации, а не вечный цикл;
//   - порядок модификаторов объявляет СЕТТИНГ (фазы-якоря), движок исполняет;
//   - evaluate чистая: снимок на входе, новый снимок на выходе.

import { applyPipeline, DEFAULT_PHASES } from '../contracts/parameter';
import type { DerivationContext, ModifierBag } from '../contracts/parameter';
import type { DerivedDefinition } from '../contracts/derived';
import type { ParameterDefinition } from '../contracts/parameter';
import type { CounterDefinition } from '../contracts/counter';
import type { RankBands } from '../contracts/bands';
import type { ReactionDefinition } from '../contracts/reactions';
import type { SettingExtension } from '../contracts/setting';

/** Результат каскада: значения всех узлов + потолки счётчиков. */
export interface EvaluationResult {
  /** Параметры (после модификаторов) и производные — одним словарём. */
  values: Record<string, number>;
  /** Потолки счётчиков: max разрешён в число или в ссылку на производное. */
  ceilings: Record<string, number>;
}

export interface DerivationRegistry {
  register: (setting: SettingExtension) => void;
  /** Топологический порядок производных (для трассировки и тестов). */
  order: () => readonly string[];
  /** Каскад: снимок параметров + модификаторы → значения + потолки. */
  evaluate: (
    state: Readonly<Record<string, number>>,
    modifiers?: Readonly<ModifierBag>,
  ) => EvaluationResult;
  /** Реакции, слушающие хоть один из changed (для МК-3). */
  reactionsFor: (changed: readonly string[]) => readonly ReactionDefinition[];
}

const KNOWN_KINDS: ReadonlySet<string> = new Set(['derived', 'max', 'rankCeiling']);
const ROUNDING_MODES: ReadonlySet<string> = new Set(['math', 'up', 'down', 'none']);

export const createDerivationRegistry = (): DerivationRegistry => {
  const parameters = new Map<string, ParameterDefinition & { setting: string }>();
  const derived = new Map<string, DerivedDefinition & { setting: string }>();
  const counters = new Map<string, CounterDefinition & { setting: string }>();
  const rankBands: (RankBands & { setting: string })[] = [];
  const reactions = new Map<string, ReactionDefinition & { setting: string }>();
  let topo: readonly string[] = [];

  const fail = (msg: string): never => {
    throw new Error(`[derivations] ${msg}`);
  };

  const assertPrefixed = (id: string, setting: string, what: string) => {
    if (!id.startsWith(`${setting}.`)) {
      fail(`${what} "${id}" обязан начинаться с префикса сеттинга "${setting}."`);
    }
  };

  /** Фазы модификаторов: если объявлены — непустой список с уникальными id;
   *  round фазы — boolean или режим округления; rounding итога — режим. */
  const validatePhases = (def: { id: string; modifierPhases?: unknown; rounding?: unknown }) => {
    if (def.rounding !== undefined && !ROUNDING_MODES.has(def.rounding as string)) {
      fail(`"${def.id}": неизвестный режим округления "${String(def.rounding)}" (доступны: math, up, down, none)`);
    }
    if (def.modifierPhases === undefined) return;
    if (!Array.isArray(def.modifierPhases) || def.modifierPhases.length === 0) {
      fail(`"${def.id}": modifierPhases, если объявлены, — непустой список фаз`);
    }
    const seen = new Set<string>();
    for (const phase of def.modifierPhases as Array<string | { id?: string; round?: unknown }>) {
      const id: string = typeof phase === 'string' ? phase : (phase?.id ?? '');
      if (id === '') {
        fail(`"${def.id}": каждая фаза — строка или { id, round? }`);
      }
      if (typeof phase !== 'string') {
        const round = phase.round;
        const valid = round === undefined || round === true || round === false || ROUNDING_MODES.has(round as string);
        if (!valid) {
          fail(`"${def.id}": round фазы "${id}" — boolean или режим округления (math, up, down, none)`);
        }
      }
      if (seen.has(id)) fail(`"${def.id}": фаза "${id}" объявлена дважды`);
      seen.add(id);
    }
  };

  const rebuildTopo = () => {
    // Kahn по графу deps: параметры — готовые узлы-источники, производные
    // встают после своих производных-входов. Цикл = ошибка регистрации.
    for (const def of derived.values()) {
      const unknown = def.deps.filter((d) => !parameters.has(d) && !derived.has(d));
      if (unknown.length > 0) {
        fail(`производное "${def.id}" ссылается на неизвестные входы: ${unknown.join(', ')}`);
      }
    }
    const dependents = new Map<string, string[]>();
    const indeg = new Map<string, number>();
    for (const id of derived.keys()) indeg.set(id, 0);
    for (const def of derived.values()) {
      for (const dep of def.deps) {
        if (!dependents.has(dep)) dependents.set(dep, []);
        dependents.get(dep)!.push(def.id);
      }
      indeg.set(def.id, def.deps.filter((d) => derived.has(d)).length);
    }
    const queue: string[] = [];
    for (const [id, deg] of indeg) {
      if (deg === 0) queue.push(id);
    }
    const sorted: string[] = [];
    while (queue.length > 0) {
      const id = queue.shift()!;
      sorted.push(id);
      for (const next of dependents.get(id) ?? []) {
        const deg = (indeg.get(next) ?? 0) - 1;
        indeg.set(next, deg);
        if (deg === 0) queue.push(next);
      }
    }
    if (sorted.length !== indeg.size) {
      const stuck = Array.from(indeg.keys()).filter((id) => !sorted.includes(id));
      fail(`цикл в зависимостях производных: ${stuck.sort().join(', ')}`);
    }
    topo = sorted;
  };

  const register = (setting: SettingExtension) => {
    if (!setting || typeof setting !== 'object') fail('объявление сеттинга должно быть объектом');
    const prefix = setting.id;
    if (typeof prefix !== 'string' || prefix === '') fail('у сеттинга обязан быть id-префикс');

    const put = <T extends { id: string }>(
      map: Map<string, T & { setting: string }>,
      items: readonly T[] | undefined,
      what: string,
    ) => {
      for (const item of items ?? []) {
        assertPrefixed(item.id, prefix, what);
        if (map.has(item.id) || parameters.has(item.id)) {
          fail(`${what} "${item.id}" уже зарегистрировано`);
        }
        map.set(item.id, { ...item, setting: prefix });
      }
    };

    for (const param of setting.parameters ?? []) {
      assertPrefixed(param.id, prefix, 'параметр');
      if (parameters.has(param.id) || derived.has(param.id) || counters.has(param.id)) {
        fail(`параметр "${param.id}" уже зарегистрирован`);
      }
      if (param.kind !== 'number') {
        fail(`параметр "${param.id}": v1 поддерживает только kind 'number'`);
      }
      validatePhases(param);
      parameters.set(param.id, { ...param, setting: prefix });
    }
    put(derived, setting.derived, 'производное');
    for (const def of setting.derived ?? []) {
      if (!Array.isArray(def.deps) || def.deps.length === 0) {
        fail(`производное "${def.id}" обязано иметь непустые deps`);
      }
      if (!KNOWN_KINDS.has(def.kind)) {
        fail(`производное "${def.id}": неизвестный kind "${def.kind}"`);
      }
      if (typeof def.compute !== 'function') {
        fail(`производное "${def.id}" обязано иметь compute`);
      }
      validatePhases(def);
    }
    put(counters, setting.counters, 'счётчик');
    for (const bands of setting.rankBands ?? []) {
      if (!Array.isArray(bands.bands) || bands.bands.length === 0) {
        fail(`потолки рангов (from "${bands.from}") обязаны иметь непустые bands`);
      }
      rankBands.push({ ...bands, setting: prefix });
    }
    put(reactions, setting.reactions, 'реакция');
    for (const reaction of setting.reactions ?? []) {
      if (!Array.isArray(reaction.watch) || reaction.watch.length === 0) {
        fail(`реакция "${reaction.id}" обязана иметь непустой watch`);
      }
      if (typeof reaction.on !== 'function') {
        fail(`реакция "${reaction.id}" обязана иметь on`);
      }
    }
    rebuildTopo();
  };

  const evaluate = (
    state: Readonly<Record<string, number>>,
    modifiers: Readonly<ModifierBag> = {},
  ) => {
    const values: Record<string, number> = {};
    const ctx: DerivationContext = {
      values: values as Readonly<Record<string, number>>,
      modifiers,
    };
    // Параметры: база из состояния → конвейер модификаторов (фазы и режим
    // округления — по объявлению). Условия видят значения, вычисленные
    // к их моменту (объявляйте deps честно).
    for (const [id, def] of parameters) {
      const base = state[id];
      if (base === undefined) continue; // параметр ещё не задан — каскад ждёт
      try {
        values[id] = applyPipeline(
          base,
          modifiers[id] ?? [],
          def.modifierPhases ?? DEFAULT_PHASES,
          ctx,
          def.rounding ?? 'math',
        );
      } catch (err) {
        fail(`параметр "${id}" упал при вычислении: ${(err as Error).message}`);
      }
    }
    // Производные: база = compute(ctx) → конвейер модификаторов поверх базы.
    for (const id of topo) {
      const def = derived.get(id)!;
      try {
        const base = def.compute(ctx);
        values[id] = applyPipeline(
          base,
          modifiers[id] ?? [],
          def.modifierPhases ?? DEFAULT_PHASES,
          ctx,
          def.rounding ?? 'math',
        );
      } catch (err) {
        fail(`производное "${id}" упало при вычислении: ${(err as Error).message}`);
      }
    }
    const ceilings: Record<string, number> = {};
    for (const counter of counters.values()) {
      if (typeof counter.max === 'number') ceilings[counter.id] = counter.max;
      else {
        const resolved = values[counter.max];
        if (resolved === undefined) {
          fail(`счётчик "${counter.id}": потолок "${counter.max}" не вычислен`);
        }
        ceilings[counter.id] = resolved;
      }
    }
    return { values, ceilings };
  };

  const reactionsFor = (changed: readonly string[]) =>
    Array.from(reactions.values()).filter((r) => r.watch.some((id) => changed.includes(id)));

  return { register, order: () => topo, evaluate, reactionsFor };
};
