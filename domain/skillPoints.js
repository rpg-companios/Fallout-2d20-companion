// domain/skillPoints.js
// Патч 552: очки навыков от перков и «долг» при снятии перка.
//
// Правила (решения владельца, 2026-11-07):
//   • «Тренированный» даёт +2 очка навыков за каждый действующий ранг (551).
//   • Снятие перка забирает его очки. Если они уже потрачены — игрок сам
//     выбирает, с каких навыков снять, но не больше 2 очков суммарно
//     (2 с одного навыка или 1 с двух).
//   • Минимумы навыков соблюдаются: 0 обычный, 2 тегированный.
//   • Старые сейвы (перк взят до 551) получают пропущенные очки один раз:
//     распределение навыков открывается заново, ждать нового уровня не надо.
//
// Здесь — чистая арифметика без стора и UI: стор и экраны передают значения.

import {
  calculateSkillPointsUsed,
  getSkillPointsAvailable,
} from './characterCreation.js';

/**
 * Сколько очков навыков игрок ещё не потратил.
 * Отрицательное значение — долг (навыки распределены сверх пула).
 *
 * @param {object} input
 * @param {Array<{name: string, value: number}>} input.attributes — legacy-массив
 * @param {number} input.level
 * @param {{skillPoints?: number}} input.perkBonuses
 * @param {Array<{name: string, value: number}>} input.skills — legacy-массив
 * @param {string[]} input.selectedSkills
 * @param {string[]} input.extraTaggedSkills
 * @returns {number}
 */
export function pendingSkillPoints({
  attributes = [],
  level = 1,
  perkBonuses = {},
  skills = [],
  selectedSkills = [],
  extraTaggedSkills = [],
} = {}) {
  const available = getSkillPointsAvailable(attributes, level, perkBonuses);
  const used = calculateSkillPointsUsed(skills, selectedSkills, extraTaggedSkills);
  return available - used;
}

/**
 * Нужно ли открыть распределение навыков повторно (старый сейв, очки от
 * перков появились уже после того, как навыки были сохранены).
 *
 * Условия: атрибуты и навыки сохранены (создание персонажа завершено),
 * в пуле есть нераспределённые очки. Открытие идемпотентно: как только
 * skillsSaved снят, повторная загрузка ничего не меняет — цикла нет.
 */
export function shouldUnlockSkillDistribution({ attributesSaved, skillsSaved, pending } = {}) {
  return Boolean(attributesSaved && skillsSaved && Number(pending) > 0);
}

/** Минимум навыка: тегированные навыки начинаются с 2, остальные с 0. */
export function skillFloor(isTagged) {
  return isTagged ? 2 : 0;
}

/** Сколько очков вообще можно снять с навыков (суммарный запас до минимумов). */
export function skillRefundCapacity(skills = [], taggedSkills = []) {
  const tagged = new Set(taggedSkills || []);
  return (skills || []).reduce((sum, skill) => {
    const floor = skillFloor(tagged.has(skill.name));
    return sum + Math.max(0, Number(skill?.value) - floor);
  }, 0);
}

/**
 * Сколько очков забрать у навыков при снятии перка.
 * Сначала «съедаются» нераспределённые очки: если перк дал 2, а 1 ещё
 * лежит в пуле, с навыков снимается только 1. Больше, чем дал перк,
 * не забираем никогда.
 */
export function perkRemovalRefund({ grantedPoints = 0, pending = 0 } = {}) {
  const granted = Math.max(0, Number(grantedPoints) || 0);
  const free = Math.max(0, Number(pending) || 0);
  return Math.max(0, granted - free);
}

/**
 * План снятия перка: сколько очков вернуть и хватает ли запаса навыков.
 * possible === false — снять перк нельзя без нарушения минимумов,
 * экран обязан объяснить это игроку, а не списывать «в минус».
 */
export function planPerkRemovalSkillRefund({
  grantedPoints = 0,
  pending = 0,
  skills = [],
  taggedSkills = [],
} = {}) {
  const refund = perkRemovalRefund({ grantedPoints, pending });
  const capacity = skillRefundCapacity(skills, taggedSkills);
  return { refund, capacity, possible: refund <= capacity };
}

/** Сумма выбранных к снятию очков. */
export function totalRefund(refunds = {}) {
  return Object.values(refunds || {}).reduce(
    (sum, value) => sum + Math.max(0, Math.floor(Number(value) || 0)),
    0,
  );
}

/**
 * Применить выбранное игроком снятие очков к legacy-массиву навыков.
 * Возвращает новый массив; значения не опускаются ниже минимумов.
 */
export function applySkillRefund(skills = [], taggedSkills = [], refunds = {}) {
  const tagged = new Set(taggedSkills || []);
  return (skills || []).map((skill) => {
    const take = Math.max(0, Math.floor(Number(refunds?.[skill.name]) || 0));
    if (take === 0) return skill;
    const floor = skillFloor(tagged.has(skill.name));
    return { ...skill, value: Math.max(floor, Number(skill.value) - take) };
  });
}
