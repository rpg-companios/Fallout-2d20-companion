// РЕЕСТР ВЫВОДИМОСТИ (МК-1, патч 281).
//
// Исполняемая часть контракта: сеттинг регистрирует декларации, движок
// валидирует их, строит топологический порядок и вычисляет каскадом.
//
// ИЗОЛЯЦИЯ (важно): в этом патче реестр НИЧЕГО не подменяет в работающей
// программе — его импортируют только тесты контракта. Подключение к стору
// и смерть 24 ручных вызовов — МК-3 (патчи 283+), после тестового сеттинга
// (282). Так контракт приживается без риска для Fallout-модуля.
//
// ПРАВИЛА:
//   - id уникальны глобально и обязаны начинаться с префикса сеттинга
//     ('fallout.maxHealth') — коллизии между сеттингами исключены;
//   - deps непусты и ссылаются только на известные параметры/производные;
//   - цикл в графе зависимостей — ошибка регистрации, а не вечный цикл;
//   - evaluate чистая: снимок на входе, новый снимок на выходе.

import { applyModifiers } from '../contracts/parameter';
import type { ModifierBag } from '../contracts/parameter';
import type { DerivationContext, DerivedDefinition } from '../contracts/derived';
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

export const createDerivationRegistry = (): DerivationRegistry => {
  const parameters = new Map<string, { setting: string }>();
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
      parameters.set(param.id, { setting: prefix });
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
    for (const id of parameters.keys()) {
      const base = state[id];
      if (base === undefined) continue; // параметр ещё не задан — каскад ждёт
      values[id] = applyModifiers(base, modifiers[id] ?? []);
    }
    const ctx: DerivationContext = {
      values: values as Readonly<Record<string, number>>,
      modifiers,
    };
    for (const id of topo) {
      const def = derived.get(id)!;
      try {
        values[id] = def.compute(ctx);
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
