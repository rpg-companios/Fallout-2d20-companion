// domain/counters.js
// ДВИЖОК. Форма «каунтера» — числового ресурса персонажа — и три действия
// над ним. Ни React, ни данных конкретного сеттинга здесь нет.
//
// Здоровье, радиация, крышки, патроны, заряд ядерного блока, мана следующего
// мира — это одна и та же вещь: число с текущим значением, потолком и нижней
// границей, которое тратится и восполняется по событию. Движок знает эту форму
// ОДИН раз; сеттинг называет ресурсы и решает, когда их менять.
//
// Чего движок НЕ знает:
//   - почему списывают (покупка, урон, заклинание) — это событие сеттинга;
//   - как считается потолок — формула приходит от сеттинга и вызывается как
//     чёрный ящик;
//   - какие каунтеры существуют — список объявляет сеттинг, движок его не
//     хранит;
//   - обмен между каунтерами (100 меди = 1 серебро) — сознательно не делаем
//     до явного решения владельца.

/**
 * Приводит значение к конечному числу. Возвращает null, если это не число:
 * вызывающий сам решает, чем это для него является (обычно «нет границы»).
 */
const toFiniteOrNull = (value) => {
  // null/'' /пробелы Number() молча превращает в 0 — для «нет потолка» это
  // означало бы потолок 0 и обнуляло ресурс. Отсекаем такие значения явно.
  if (value === null || value === undefined || value === '') return null;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : null;
};

/**
 * Вычисляет потолок каунтера.
 *
 * `max` может быть:
 *   - числом            → потолок как есть;
 *   - функцией сеттинга → вызывается как чёрный ящик, движок не знает формулы;
 *   - null/undefined    → потолка нет (пример: крышки).
 *
 * Если формула вернула не число, это трактуется как «потолка нет»: движок не
 * додумывает за сеттинг и не роняет приложение из-за неготовой формулы.
 *
 * @param {object} counter
 * @param {*} [context] аргумент формулы (атрибуты, уровень и т.п.)
 * @returns {number|null}
 */
export const resolveMax = (counter, context) => {
  const max = counter?.max;
  if (typeof max === 'function') return toFiniteOrNull(max(context));
  return toFiniteOrNull(max);
};

/**
 * Нижняя граница. По умолчанию 0 — ресурс не уходит в минус.
 */
export const resolveMin = (counter) => {
  const min = toFiniteOrNull(counter?.min);
  return min === null ? 0 : min;
};

/**
 * Зажимает значение между min и max каунтера.
 * Если max не задан (или формула его не дала) — ограничение только снизу.
 */
export const clampToBounds = (counter, value, context) => {
  const num = toFiniteOrNull(value);
  const min = resolveMin(counter);
  if (num === null) return min;
  const max = resolveMax(counter, context);
  const lowerBounded = Math.max(min, num);
  return max === null ? lowerBounded : Math.min(max, lowerBounded);
};

/**
 * Создаёт каунтер. Сеттинг задаёт имя ресурса и границы; текущее значение
 * сразу приводится к границам, чтобы некорректных состояний не существовало.
 *
 * @param {object} spec
 * @param {string} spec.id      имя ресурса внутри сеттинга: 'health', 'caps'
 * @param {number} [spec.current]
 * @param {number|function|null} [spec.max] число, формула сеттинга или null
 * @param {number} [spec.min]   нижняя граница, по умолчанию 0
 * @param {*} [context]         аргумент формулы потолка
 * @returns {{id: string, current: number, max: *, min: number}}
 */
export const createCounter = ({ id, current = 0, max = null, min = 0 }, context) => {
  if (!id || typeof id !== 'string') {
    throw new Error('[counters] Каунтеру нужен строковый id ресурса');
  }
  const shape = { id, max, min: toFiniteOrNull(min) === null ? 0 : Number(min) };
  return { ...shape, current: clampToBounds(shape, current, context) };
};

// ---------------------------------------------------------------------------
// Три действия. Каждое возвращает НОВЫЙ каунтер — исходный не мутируется,
// поэтому результат безопасно класть в состояние и сериализовать в сейв.
// ---------------------------------------------------------------------------

/**
 * Списать `amount`. Не уходит ниже min. Отрицательный amount игнорируется:
 * «списать минус пять» — это ошибка вызывающего, а не скрытое восполнение.
 */
export const consume = (counter, amount, context) => {
  const delta = toFiniteOrNull(amount);
  if (delta === null || delta <= 0) return counter;
  return { ...counter, current: clampToBounds(counter, counter.current - delta, context) };
};

/**
 * Вернуть `amount`. Не поднимается выше max (если потолок задан).
 * Отрицательный amount игнорируется — симметрично consume.
 */
export const restore = (counter, amount, context) => {
  const delta = toFiniteOrNull(amount);
  if (delta === null || delta <= 0) return counter;
  return { ...counter, current: clampToBounds(counter, counter.current + delta, context) };
};

/**
 * Поставить значение напрямую (лечение до полного, обнуление радиации),
 * зажатое между min и max.
 */
export const set = (counter, value, context) => ({
  ...counter,
  current: clampToBounds(counter, value, context),
});

// ---------------------------------------------------------------------------
// Вспомогательное для UI и правил. Сюда НЕ добавляем игровые смыслы —
// только вопросы к форме каунтера.
// ---------------------------------------------------------------------------

/** Сколько ещё можно списать, не упершись в min. */
export const availableToConsume = (counter, context) =>
  counter.current - resolveMin(counter);

/** Хватает ли ресурса на списание `amount` (покупка, стоимость заклинания). */
export const canConsume = (counter, amount, context) => {
  const delta = toFiniteOrNull(amount);
  if (delta === null || delta <= 0) return true;
  return availableToConsume(counter, context) >= delta;
};

/** Каунтер на потолке: лечить до полного уже нечего. */
export const isFull = (counter, context) => {
  const max = resolveMax(counter, context);
  return max !== null && counter.current >= max;
};

/** Каунтер на нижней границе: тратить больше нечего. */
export const isEmpty = (counter, context) => counter.current <= resolveMin(counter);
