// domain/repairEngine.js
//
// Универсальный движок механики «ремонт» (патч 413, механика от владельца).
//
// Книжное правило: тест ИНТ + Ремонт со сложностью, равной редкости
// предмета (+1 за каждую установленную модификацию; разборка донора —
// второго предмета того же типа — даёт материалы и снижает сложность
// на 1). Время — полчаса; при успехе можно потратить 2 ОД и сократить
// вдвое (до 15 минут); осложнение добавляет ещё 15 минут.
//
// Таблица материалов по редкости — ЗНАНИЕ СЕТТИНГА, движок получает план
// снаружи (materialsPlan: [{itemId, count}]); id материалов ему непрозрачны.
//
// Разрешение осложнения (правило владельца из механики): при УСПЕХЕ
// бросается д20 — 19–20 означает потерю дополнительных материалов
// (сверх потраченных — ещё один такой же комплект), иначе ремонт занял
// больше времени (+15 минут). При провале потеря нечему (материалы
// остаются в сумке — закон верстака, 323) — только время.
//
// Формы результата (контракт для экранов и тестов):
//   { done: true,  check, complications, resolution, spent, donorSpent }
//   { done: false, stage: 'gate', reasons }
//   { done: false, stage: 'check', reason: 'check-failed', check, complications }

import { resolveD20Check } from './d20Checks';

const MIN_LOSS_FACE = 19;
const MAX_LOSS_FACE = 20;

export const REPAIR_ENGINE_LIMITS = { minLossFace: MIN_LOSS_FACE, maxLossFace: MAX_LOSS_FACE };

const assertPlan = (materialsPlan) => {
  for (const entry of materialsPlan || []) {
    if (typeof entry?.itemId !== 'string' || !entry.itemId
      || !Number.isInteger(entry.count) || entry.count <= 0) {
      throw new Error('[repairEngine] materialsPlan entries must be { itemId, count > 0 }');
    }
  }
};

/**
 * Гейты и сводка для окна: сложность (уже с модами и донором — считает
 * адаптер, движку важно число), доступность материалов.
 */
export const evaluateRepair = ({
  complexity,
  materialsPlan = [],
  inventoryCounts = {},
}) => {
  if (!Number.isInteger(complexity) || complexity < 0) {
    throw new Error('[repairEngine] complexity must be an integer >= 0');
  }
  assertPlan(materialsPlan);
  const blocked = [];
  const materials = materialsPlan.map(({ itemId, count }) => {
    const have = Math.max(0, Number(inventoryCounts?.[itemId]) || 0);
    const enough = have >= count;
    if (!enough) blocked.push({ code: 'missing-material', itemId, need: count, have });
    return { itemId, need: count, have, enough };
  });
  return {
    difficulty: complexity,
    auto: complexity === 0,
    blocked,
    materials,
    ready: blocked.length === 0,
  };
};

/**
 * Полный проход ремонта: проверка → обмен через порты. При провале
 * материалы НЕ сгорают (закон верстака): потрачено только время.
 * zeroDifficulty — как в крафте (356): 'auto' | 'roll'.
 * complicationRoll — бросок д20 разрешения осложнения (19–20 = потеря
 * дополнительных материалов, иначе +15 минут). Отсутствует — кубик настоящий.
 */
export const runRepair = ({
  complexity,
  materialsPlan = [],
  inventoryCounts = {},
  attributeValue = 0,
  skillValue = 0,
  isTagged = false,
  zeroDifficulty = 'auto',
  rollD20,
  complicationRoll,
  spend,
  spendDonor,
}) => {
  if (typeof spendDonor !== 'function') {
    throw new Error('[repairEngine] port { spendDonor } is required');
  }
  const evaluation = evaluateRepair({ complexity, materialsPlan, inventoryCounts });
  if (!evaluation.ready) {
    return { done: false, stage: 'gate', reasons: evaluation.blocked, check: null };
  }

  let check = null;
  if (!evaluation.auto || zeroDifficulty === 'roll') {
    check = resolveD20Check({
      attributeValue,
      skillValue: Math.max(0, Number(skillValue) || 0),
      isTagged,
      difficulty: evaluation.difficulty,
      diceCount: 2,
      ...(rollD20 ? { rollD20 } : {}),
    });
  }
  const passed = (evaluation.auto && !check) || check.passed;

  // Осложнения разрешаются ТОЛЬКО при успехе (см. шапку модуля).
  let resolution = null;
  let donorSpent = false;
  if (passed) {
    const complications = check?.complicationCount ?? 0;
    if (complications > 0) {
      const face = complicationRoll
        ? complicationRoll()
        : Math.floor(Math.random() * 20) + 1;
      resolution = (face >= MIN_LOSS_FACE && face <= MAX_LOSS_FACE)
        ? { kind: 'lost-materials', face }
        : { kind: 'extra-minutes', face };
    }
    // Донор вместо материалов: предмет уходит целиком (моды — с ним).
    if (materialsPlan.length === 0) {
      const donorResult = spendDonor();
      if (!donorResult || donorResult.ok !== true) {
        return { done: false, stage: 'store', reason: 'donor-refused', check };
      }
      donorSpent = true;
    } else {
      const spendResult = spend(materialsPlan.map(({ itemId, count }) => ({ itemId, count })));
      if (!spendResult || spendResult.ok !== true) {
        return { done: false, stage: 'store', reason: 'spend-refused', storeReason: spendResult?.reason ?? null, check };
      }
    }
  }

  return {
    done: passed,
    stage: passed ? undefined : 'check',
    reason: passed ? undefined : 'check-failed',
    check,
    complications: check?.complicationCount ?? 0,
    resolution,
    donorSpent,
    spent: passed && materialsPlan.length > 0
      ? materialsPlan.map(({ itemId, count }) => ({ itemId, count }))
      : [],
  };
};
