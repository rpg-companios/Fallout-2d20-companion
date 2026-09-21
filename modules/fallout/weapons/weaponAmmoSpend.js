/**
 * Формулы расхода зарядов за выстрел — качества и моды оружия (патч 296,
 * перенос в модуль по правилу владельца — патч 298).
 *
 * ПРАВИЛО (владелец): формула конкретного качества — это формула МОДУЛЯ,
 * а не движка. Качества записаны в модуле, здесь же живут их формулы
 * расхода. Формула применяется, пока качество есть на оружии, и исчезает
 * вместе с ним: качества модов надеваются/снимаются конвейером обогащения
 * (domain/enrichItem.js), а эти читатели смотрят на итоговые качества.
 *
 * Движок (экран со списком зарядов + characterStore.spendAmmoForWeapon)
 * знает только контракт плана:
 *
 *   {
 *     fixed: number,                  // безусловное списание за выстрел
 *     asks: [{ source, max,           // запрос «сколько максимум из
 *              maxAvailable }],       // доступного потратить»
 *     totalFor(answers)               // итог при утверждённых ответах
 *   }
 *
 * Частные формулы (сейчас):
 *   - quality_ammo-hungry_x — пожиратель патронов: безусловно X за выстрел;
 *   - quality_crank_x — заводная рукоятка: до X зарядов, по утверждению;
 *   - ammoPerAttack у мода робо-оружия (конденсатор Головного лазера
 *     Штурмотрона): до X зарядов за атаку, по утверждению.
 *
 * Добавить новое качество (пример — полуавтомат, «от 1 до 3 выстрелов
 * за раз»):
 *   1) читатель ниже по образцу crank_x:
 *        const SEMI_AUTO_QUALITY_ID = 'quality_semi-auto_x';
 *        ...
 *        asks.push({ source: 'semi-auto', max: Math.max(1, toNumber(q?.value) || 1) });
 *   2) ключ weapon.ammoSpend.source.semi-auto в i18n ru-RU и en-EN
 *      (экран подставляет метку по ключу источника сам).
 * Всё: степпер в диалоге станет 1..X, списание — утверждённое число.
 *
 * Конвенция данных: суффикс «_x» — «качество со значением», value —
 * потолок; без value или при нуле получается 1.
 */

import { getRobotLimbCatalog } from '../../../domain/registry';
import { toModIds } from '../../../domain/robotSlots';

const toNumber = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

// Пожиратель патронов: безусловно X зарядов за выстрел.
const HUNGRY_QUALITY_ID = 'quality_ammo-hungry_x';
// Заводная рукоятка: до X зарядов за выстрел, по утверждению пользователя.
const CRANK_QUALITY_ID = 'quality_crank_x';

/**
 * Собирает план списания из условий.
 *
 * @param {object} params
 * @param {Array}  params.qualities — качества оружия (после модов)
 * @param {Array}  params.mods      — разрешённые объекты установленных модов
 *                                    (для ammoPerAttack)
 * @param {number} params.available — сколько зарядов доступно (для потолка)
 * @returns {{ fixed: number,
 *             asks: Array<{ source: string, max: number, maxAvailable: number }>,
 *             totalFor: (answers?: number[]) => number }}
 */
export const buildMechAmmoSpend = ({ qualities = [], mods = [], available = Infinity } = {}) => {
  const list = Array.isArray(qualities) ? qualities : [];

  // Безусловное списание: пожиратель патронов. Несколько таких качеств
  // не суммируются — действует сильнейшее.
  let fixed = 0;
  for (const q of list) {
    if ((q?.qualityId || q?.id) !== HUNGRY_QUALITY_ID) continue;
    fixed = Math.max(fixed, Math.max(1, toNumber(q?.value) || 1));
  }

  // Условия с запросом: рукоятка и конденсатор.
  const asks = [];
  for (const q of list) {
    if ((q?.qualityId || q?.id) !== CRANK_QUALITY_ID) continue;
    asks.push({ source: 'crank', max: Math.max(1, toNumber(q?.value) || 1) });
  }
  for (const mod of Array.isArray(mods) ? mods : []) {
    const perAttack = toNumber(mod?.ammoPerAttack);
    if (perAttack > 0) {
      asks.push({ source: 'ammoPerAttack', max: perAttack, modId: mod?.id ?? null });
    }
  }

  // Оружие без особых условий жрёт один заряд за выстрел.
  if (fixed === 0 && asks.length === 0) fixed = 1;

  const avail = Number.isFinite(available) ? Math.max(0, Math.floor(available)) : Infinity;
  const capped = asks.map((ask) => ({
    ...ask,
    maxAvailable: Math.min(ask.max, avail),
  }));

  const clampAnswer = (answer, ask) => Math.min(
    Math.max(1, Math.floor(toNumber(answer) || 1)),
    Math.max(1, ask.maxAvailable),
  );

  return {
    fixed,
    asks: capped,
    /**
     * Итоговое списание: безусловная часть + утверждённые ответы по
     * каждому запросу (по одному числу на элемент asks).
     */
    totalFor: (answers = []) => fixed + capped.reduce(
      (sum, ask, index) => sum + clampAnswer(answers[index], ask),
      0,
    ),
  };
};

/**
 * План списания для конкретного оружия: качества берутся как есть,
 * установленные моды робо-оружия разрешаются из пула каталога
 * (appliedMods/modIds — обе формы, см. toModIds).
 *
 * @param {object} weapon  — обогащённое оружие экрана (qualities, appliedMods…)
 * @param {object} options — { available, catalog? }
 */
export const mechAmmoSpendForWeapon = (weapon, { available, catalog = getRobotLimbCatalog() } = {}) => {
  const modIds = toModIds(weapon);
  const pool = catalog?.weaponMods || [];
  const mods = modIds
    .map((id) => pool.find((mod) => mod?.id === id))
    .filter(Boolean);

  return buildMechAmmoSpend({
    qualities: weapon?.qualities,
    mods,
    available,
  });
};
