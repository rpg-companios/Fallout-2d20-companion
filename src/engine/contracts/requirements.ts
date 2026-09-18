// КОНТРАКТ ВЫВОДИМОСТИ — требования (МК-1, патч 281).
//
// Требование — гейт «можно ли»: заклинание требует ранг навыка 4, перк —
// атрибут 6. Движок проверяет требование против вычисленных значений и
// возвращает структурированный исход; отказ объясняет, чего не хватило.

/** Требование к параметру: минимум по значению ИЛИ по рангу (bands). */
export interface Requirement {
  /** Полный id параметра ('test.magicSkill'). */
  paramId: string;
  /** Минимальное значение параметра. */
  minValue?: number;
  /** Минимальный ранг (для параметров с потолками рангов). */
  minRank?: number;
}

/** Исход проверки гейта. Отказ перечисляет ВСЕ невыполненные требования. */
export type GateCheck = { ok: true } | { ok: false; unmet: ReadonlyArray<Requirement> };

/** Проверить требования против значений. Чистая функция. */
export const checkRequirements = (
  requirements: readonly Requirement[],
  values: Readonly<Record<string, number>>,
): GateCheck => {
  const unmet: Requirement[] = [];
  for (const req of requirements) {
    const value = values[req.paramId];
    if (value === undefined) {
      unmet.push(req);
      continue;
    }
    if (req.minValue !== undefined && value < req.minValue) unmet.push(req);
    else if (req.minRank !== undefined && value < req.minRank) unmet.push(req);
  }
  return unmet.length === 0 ? { ok: true } : { ok: false, unmet };
};
