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
 * Разворачивает «варианты» предметов: запись вида { id, trueItemId, modifiers }
 * — НЕ самостоятельный предмет: 90% параметров наследуются из истинного
 * предмета (trueItemId), а modifiers точечно меняют отдельные параметры.
 *
 * Пример: { id: 'weapon_straight_razor', trueItemId: 'weapon_switchblade',
 *           modifiers: { replaceOriginalNameTo: 'weapon_straight_razor' } }
 * → полная запись бритвы с характеристиками выкидного ножа и своим именем
 * (замена имени обрабатывается там, где доступны i18n-словари).
 *
 * В инвентаре вариант живёт под ИСТИННЫМ id (для программы это нож: моды,
 * слоты, качество — всё от ножа), а стек разделяется именем (см. стек-ключи).
 */
export function expandTrueItems(entries = [], baseEntries = []) {
  const baseById = new Map();
  (baseEntries || []).forEach((entry) => {
    if (entry?.id) baseById.set(entry.id, entry);
  });
  return (entries || []).map((entry) => {
    if (!entry || !entry.trueItemId) return entry;
    const base = baseById.get(entry.trueItemId);
    if (!base) return entry;
    // trueItemId сохраняем в развёрнутой записи — имя/механика ссылаются на него.
    const merged = deepMerge(base, { ...entry, trueItemId: base.id });
    return applyVariantModifiers(merged, entry.modifiers);
  });
}

// Поля предмета, которые можно точечно менять модификатором вида
// { damageModifier: { op, value } } — числовые характеристики.
const VARIANT_NUMERIC_FIELDS = ['damage', 'fireRate', 'weight', 'cost', 'rarity'];

const applyOp = (current, op, value) => {
  const numeric = Number(current) || 0;
  const delta = Number(value) || 0;
  switch (op) {
    case '-': return numeric - delta;
    case '*': return numeric * delta;
    case '/': return delta !== 0 ? numeric / delta : numeric;
    default: return numeric + delta; // '+' и всё остальное — как сложение
  }
};

/**
 * Применяет точечные модификаторы варианта к развёрнутой записи.
 * Каждый ключ вида `<Поле>Modifier: { op, value }` меняет одно числовое поле
 * (damage/fireRate/weight/cost/rarity). replaceOriginalNameTo обрабатывается
 * на уровне каталога (нужен i18n-словарь) — здесь пропускается.
 */
export function applyVariantModifiers(entry, modifiers = {}) {
  if (!entry || !modifiers || typeof modifiers !== 'object') return entry;
  let out = entry;
  for (const [key, value] of Object.entries(modifiers)) {
    if (key === 'replaceOriginalNameTo') continue;
    const field = key.endsWith('Modifier') ? key.slice(0, -'Modifier'.length) : null;
    if (!field || !VARIANT_NUMERIC_FIELDS.includes(field)) continue;
    if (value && typeof value === 'object' && 'value' in value) {
      out = { ...out, [field]: applyOp(out[field], value.op, value.value) };
    } else if (typeof value === 'number') {
      out = { ...out, [field]: value }; // простое число — замена значения
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
