// domain/packMerge.js
// Фундамент для пользовательских пакетов правил («свои правила»).
//
// Этап 0: только чистые функции слияния + применение override'ов. К поведению
// приложения пока НЕ подключено — база работает как раньше. Подключение к
// загрузчикам данных (loadTraitsData/loadOriginsData/getEquipmentCatalog)
// будет добавляться постепенно, вместе с новым контентом.
//
// Семантика deep merge:
//   - вложенные объекты сливаются рекурсивно (override дополняет базу);
//   - примитивы/числа/строки заменяются значением override;
//   - массивы заменяются ЦЕЛИКОМ (списки проще переопределять).
// Пакет имеет приоритет над базой.

/**
 * Глубокое слияние override в base (base не мутируется).
 * Объекты сливаются рекурсивно; массивы и примитивы — заменяются.
 */
export function deepMerge(base, override) {
  if (override === undefined || override === null) return base;
  if (base === null || base === undefined) return override;

  const isPlainObject = (v) =>
    v !== null && typeof v === 'object' && !Array.isArray(v);

  if (!isPlainObject(base) || !isPlainObject(override)) {
    // Массивы и примитивы: override заменяет base целиком.
    return override;
  }

  const out = { ...base };
  for (const key of Object.keys(override)) {
    const baseVal = out[key];
    const overrideVal = override[key];
    if (isPlainObject(baseVal) && isPlainObject(overrideVal)) {
      out[key] = deepMerge(baseVal, overrideVal);
    } else {
      out[key] = overrideVal;
    }
  }
  return out;
}

/**
 * Применяет override'ы пакета к массиву data-записей по id.
 * data — массив объектов с id; packOverrides — объект { [id]: override }.
 * Для каждого id из override'ов: если запись существует — deepMerge;
 * если записи нет — override игнорируется (валидатор должен был отсечь).
 */
export function applyOverridesById(data = [], overrides = {}) {
  const byId = new Map(data.map((entry) => [entry.id, entry]));
  const out = data.map((entry) => {
    const override = overrides[entry.id];
    return override !== undefined ? deepMerge(entry, override) : entry;
  });
  // Дополнительные записи из override'ов, которых нет в базе, НЕ добавляются
  // автоматически — новые записи объявляются отдельными списками (origins и т.п.).
  void byId;
  return out;
}

/**
 * Проверка, что все ключи overrides существуют в базе (по id).
 * Возвращает список неизвестных id (пустой — всё ок).
 */
export function findUnknownOverrideIds(data = [], overrides = {}) {
  const known = new Set(data.map((entry) => entry.id));
  return Object.keys(overrides || {}).filter((id) => !known.has(id));
}
