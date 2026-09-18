// КОНТРАКТ ВЫВОДИМОСТИ — параметры (МК-1, патчи 281–283).
//
// Параметр — число, которым сеттинг описывает персонажа: атрибут, навык,
// производное здоровье, потолок и т.п. Движок ничего не знает о смыслах.
//
// СЛОВО ВЛАДЕЛЬЦА (2026-09-18) — главный урок патча 283:
//   «Это программа rpg игр. Там есть правила, и как в правилах напишут,
//    так % и будут рассчитываться. [...] И это хрен угадаешь.»
// Движок НЕ диктует порядок модификаторов — его объявляет правило сеттинга.
// Контракт даёт словарь: фазы-якоря (где применяется модификатор), условия
// (когда применяется) и операции (что делает). Пример владельца (скорострельность):
//   база 5 → моды +1/−2 → черта +10% [базы с модами] → перк ×2  = 9;
//   а другая черта даёт +10% уже ИТОГОВОЙ — после перка; а третья срабатывает
//    только если скорострельность ≤ порога. Всё это — объявления, не догмы.
//
// v1: значение — только число (ParameterValueKind зафиксирован для будущего
// расширения на «дорожки» и списки, но движок пока принимает 'number').

/** Операция модификатора.
 *  - '+'  — прибавить;
 *  - '-'  — вычесть;
 *  - '%'  — процент (в своей фазе суммируются);
 *  - '×'  — множитель (перк «х2», половина и т.п.);
 *  - 'set' — заменить значение фазы целиком («СИЛ в силовой броне = 11»). */
export type ModifierOperation = '+' | '-' | '%' | '×' | 'set';

/** Контекст для условий и формул: значения (на текущий момент каскада)
 *  и модификаторы по источникам. Никакого стора — только объявленный вход. */
export interface DerivationContext {
  /** Значения параметров после модификаторов (то, что видит игрок). */
  values: Readonly<Record<string, number>>;
  /** Модификаторы по источникам — для производных вида «сколько дал перк». */
  modifiers: Readonly<ModifierBag>;
}

/** Один модификатор параметра: источник обязателен — для отчёта «откуда что». */
export interface ParameterModifier {
  /** Стабильный источник: id перка, предмета, эффекта, брони. */
  source: string;
  operation: ModifierOperation;
  value: number;
  /** Фаза-якорь: к какому шагу конвейера модификатор привязан.
   *  Без меты — фаза по умолчанию для операции (add/percent/mult). */
  phase?: string;
  /** Условие применения: получает значение НА ВХОДЕ фазы (до её операций).
   *  Пример владельца: перк действует, только если скорострельность ≤ N. */
  when?: (value: number, ctx: DerivationContext) => boolean;
}

/** Kind значения параметра. v1 — только 'number'. */
export type ParameterValueKind = 'number' | 'track' | 'list';

/** Фаза конвейера: имя ИЛИ объект с промежуточным округлением.
 *  round: true — округлить режимом, объявленным для значения; round: режим —
 *  округлить именно так на выходе фазы (правило может округлять шаг иначе,
 *  чем итог). */
export type ModifierPhase = string | { id: string; round?: boolean | RoundingMode };

/** Режим округления — диктует сеттинг (слово владельца, 2026-09-18):
 *  «(10+18)×1.15 = 32.2 → 32 — тоже не обязательное состояние. Сеттинг может
 *  диктовать, в какую сторону должно быть округление. И может быть и 32 и 33.
 *  И например при 32.01 правило будет заставлять округлить в большую или
 *  меньшую сторону до целого».
 *  - 'math' — математическое (0.5 вверх), по умолчанию;
 *  - 'up'   — всегда в большую сторону (потолок): 32.01 → 33;
 *  - 'down' — всегда в меньшую сторону (пол): 32.99 → 32;
 *  - 'none' — не округлять (значение остаётся дробным). */
export type RoundingMode = 'math' | 'up' | 'down' | 'none';

/** Округлить число в объявленном режиме. Чистая функция. */
export const roundValue = (value: number, mode: RoundingMode): number => {
  if (mode === 'up') return Math.ceil(value);
  if (mode === 'down') return Math.floor(value);
  if (mode === 'none') return value;
  return Math.round(value);
};

/** Объявление параметра. Значение живёт в состоянии; объявление — в сеттинге. */
export interface ParameterDefinition {
  /** Полный id: с префиксом сеттинга ('fallout.maxHealth'). */
  id: string;
  kind: ParameterValueKind;
  /** Человекочитаемое имя для ошибок и трассировки. */
  label: string;
  /** Необязательный потолок, которого держит движок (может быть ссылкой на derived). */
  max?: number | string;
  /** Конвейер модификаторов: фазы в порядке исполнения. Отсутствует — дефолт
   *  ['add', 'percent', 'mult'] (аддитивы → суммарный процент → множители). */
  modifierPhases?: readonly ModifierPhase[];
  /** Режим округления итога — диктует сеттинг (патч 284). По умолчанию 'math'. */
  rounding?: RoundingMode;
}

/** Модификаторы, сгруппированные по параметру. */
export type ModifierBag = Record<string, ParameterModifier[]>;

/** Дефолтный конвейер: база+моды → суммарный процент → множители. */
export const DEFAULT_PHASES: readonly string[] = ['add', 'percent', 'mult'];

/** Фаза по умолчанию для операции (когда модификатор не привязан явно). */
export const defaultPhaseFor = (operation: ModifierOperation): string => {
  if (operation === '+' || operation === '-' || operation === 'set') return 'add';
  if (operation === '%') return 'percent';
  return 'mult';
};

/** Разрешить объявление фаз в список { id, round }. */
export const resolvePhases = (
  phases: readonly ModifierPhase[],
): { id: string; round: boolean | RoundingMode }[] =>
  phases.map((p) => {
    if (typeof p === 'string') return { id: p, round: false as const };
    return { id: p.id, round: p.round ?? false };
  });

/**
 * Исполнить ОДНУ фазу: условия проверяются на входе фазы, затем в фазе
 * действует канонический порядок (set → сумма аддитивов → суммарный процент →
 * множители по порядку). Чистая функция.
 */
export const applyWithinPhase = (
  entry: number,
  modifiers: readonly ParameterModifier[],
  ctx: DerivationContext,
): number => {
  const active = modifiers.filter((mod) => !mod.when || mod.when(entry, ctx));
  let value = entry;
  for (const mod of active) {
    if (mod.operation === 'set') value = mod.value;
  }
  let adds = 0;
  let percents = 0;
  for (const mod of active) {
    if (mod.operation === '+') adds += mod.value;
    else if (mod.operation === '-') adds -= mod.value;
    else if (mod.operation === '%') percents += mod.value;
  }
  value += adds;
  if (percents !== 0) value = value * (1 + percents / 100);
  for (const mod of active) {
    if (mod.operation === '×') value = value * mod.value;
  }
  return value;
};

/**
 * Исполнить КОНВЕЙЕР значения: база → фазы в объявленном порядке.
 * Порядок фаз — это и есть якорь: где «+10% базовой», а где «+10% итоговой» —
 * решает правило сеттинга (слово владельца: «как в правилах напишут»).
 * Округление: режим тоже диктует сеттинг (final, по умолчанию 'math');
 * фаза с round:true округляет тем же режимом, с round:<режим> — своим.
 * Модификатор в необъявленную фазу — ошибка.
 */
export const applyPipeline = (
  base: number,
  modifiers: readonly ParameterModifier[],
  phases: readonly ModifierPhase[],
  ctx: DerivationContext,
  final: RoundingMode = 'math',
): number => {
  const declared = new Set(resolvePhases(phases).map((p) => p.id));
  const byPhase = new Map<string, ParameterModifier[]>();
  for (const mod of modifiers) {
    const phase = mod.phase ?? defaultPhaseFor(mod.operation);
    if (!declared.has(phase)) {
      throw new Error(
        `[derivations] Модификатор от "${mod.source}" сослался на фазу "${phase}", которая для этого значения не объявлена (объявлено: ${Array.from(declared).join(', ') || 'ничего'})`,
      );
    }
    if (!byPhase.has(phase)) byPhase.set(phase, []);
    byPhase.get(phase)!.push(mod);
  }
  let value = base;
  for (const phase of resolvePhases(phases)) {
    value = applyWithinPhase(value, byPhase.get(phase.id) ?? [], ctx);
    if (phase.round !== false) {
      const mode: RoundingMode = phase.round === true ? final : phase.round;
      value = roundValue(value, mode);
    }
  }
  return roundValue(value, final);
};

/**
 * Процент к ОБЪЯВЛЕННОЙ БАЗЕ — по слову владельца (2026-09-18):
 * «+15% жизней считаются как базовое значение параметра ОЗ (например
 * атр1+атр2) × 1.15, округлённое математически до целого»; «+15% к защите
 * от магии огня рассчитываются как −15% входящего урона от атаки со
 * свойством стихии огня». Проценты суммируются и применяются к базе одним
 * множителем. Режим округления — аргумент (по умолчанию математическое);
 * с патча 284 сеттинг диктует и направление. Чистая функция: база → итог.
 */
export const applyPercent = (
  base: number,
  percents: readonly number[],
  mode: RoundingMode = 'math',
): number => {
  if (percents.length === 0) return roundValue(base, mode);
  const sum = percents.reduce((acc, p) => acc + p, 0);
  return roundValue(base * (1 + sum / 100), mode);
};
