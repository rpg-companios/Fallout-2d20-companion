/**
 * Универсальный механизм списания зарядов за выстрел (патч 296).
 *
 *   mechAmmoSpend = [условие1 + условие2 + ...]
 *
 * Расход за выстрел — сумма условий, и условие бывает двух видов:
 *
 *   - безусловное (fixed): списывается всегда, без вопросов.
 *     Частная формула: пожиратель патронов quality_ammo-hungry_x
 *     («тратит X за выстрел»).
 *
 *   - с запросом (ask): у условия есть потолок, ячейка списания
 *     спрашивает пользователя «сколько максимум из доступного потратить»,
 *     и после утверждения списывается указанное количество.
 *     Частные формулы: ammoPerAttack (конденсатор Головного лазера
 *     Штурмотрона — N зарядов за атаку) и crank_x (заводная рукоятка
 *     лазерного мушкета — до N зарядов на обороты).
 *
 * Механизм расширяется: новое правило расхода = новый читатель в
 * buildMechAmmoSpend (или в резолвере модов), контракт ячейки списания
 * при этом не меняется. Оружие без особых условий жрёт один заряд за
 * выстрел — как и до патча.
 */

import { getRobotLimbCatalog } from './registry';
import { toModIds } from './robotSlots';

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
  // не суммируются — действует сильнейшее (как и до патча: Math.max(1, value)).
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
