// domain/levelBands.js
// ДВИЖОК. Форма «величина, которая считается по-разному на разных уровнях».
// Ни React, ни данных конкретного сеттинга здесь нет.
//
// Одна и та же форма нужна везде, где книга говорит «до N-го уровня так,
// дальше иначе»: стартовые крышки, награда за уровень, лимит переноса,
// стоимость чего-нибудь в следующем мире. Движок знает форму ОДИН раз;
// сеттинг заполняет числа в JSON.
//
// Форма — список полос, читается СВЕРХУ ВНИЗ, побеждает первая подходящая:
//
//   [
//     { "upToLevel": 1,  "base": 100, "perLevel": 0   },
//     { "upToLevel": 20, "base": 0,   "perLevel": 100 },
//     {                  "base": 500, "perLevel": 50  }
//   ]
//
// Полоса без `upToLevel` — «и дальше так»; она должна быть последней, всё
// после неё недостижимо. Итог полосы: base + perLevel * level.
//
// Чего движок НЕ знает:
//   - что за величина считается (крышки, очки, что угодно);
//   - откуда взялся уровень;
//   - почему пороги именно такие — это данные сеттинга.

/**
 * Число или null. Number() молча превращает null/''/пробелы в 0, поэтому
 * пустые значения отсекаем явно: «поле не задано» и «поле равно нулю» —
 * разные вещи.
 */
const toFiniteOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : null;
};

/** Незаданное слагаемое — это 0, а не «сломанные данные». */
const toNumberOrZero = (value) => toFiniteOrNull(value) ?? 0;

/**
 * Первая полоса, подходящая для уровня.
 *
 * Полоса подходит, если `upToLevel` не задан («и дальше так») либо уровень
 * не превышает порог. Список читается сверху вниз — порядок в данных и есть
 * приоритет, движок его не пересортировывает.
 *
 * @param {Array<object>} bands  полосы из данных сеттинга
 * @param {number} level         уровень персонажа
 * @returns {object|null}
 */
export const findLevelBand = (bands, level) => {
  if (!Array.isArray(bands)) return null;
  const lvl = toFiniteOrNull(level);
  if (lvl === null) return null;

  for (const band of bands) {
    if (!band || typeof band !== 'object') continue;
    const upTo = toFiniteOrNull(band.upToLevel);
    if (upTo === null || lvl <= upTo) return band;
  }
  return null;
};

/**
 * Значение величины на данном уровне: `base + perLevel * level`.
 *
 * Принимает три формы, чтобы данные сеттинга не приходилось раздувать ради
 * простых случаев:
 *   - число            → константа, уровень не важен;
 *   - одна полоса      → объект { base, perLevel };
 *   - список полос     → выбирается первая подходящая.
 *
 * Ни одна полоса не подошла (уровень выше всех порогов, а «и дальше так» не
 * задано) → 0. Движок не додумывает за сеттинг.
 *
 * Результат округляется вниз и не опускается ниже нуля: отрицательная выдача
 * ресурса смысла не имеет, а дробные крышки — тем более.
 *
 * @param {number|object|Array<object>} spec  описание величины из данных
 * @param {number} level                      уровень персонажа
 * @returns {number}
 */
export const resolveLevelValue = (spec, level) => {
  const flat = toFiniteOrNull(spec);
  if (flat !== null) return Math.max(0, Math.floor(flat));

  const lvl = toFiniteOrNull(level) ?? 0;
  const band = Array.isArray(spec) ? findLevelBand(spec, lvl) : spec;
  if (!band || typeof band !== 'object') return 0;

  const total = toNumberOrZero(band.base) + toNumberOrZero(band.perLevel) * lvl;
  return Math.max(0, Math.floor(total));
};
