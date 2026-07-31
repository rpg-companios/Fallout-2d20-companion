/**
 * powerArmor.js — константы и доменная логика силовой брони.
 * Специфика: docs/architecture/power-armor-plan.md
 *
 * Патч 1 (данные): здесь только константы; механика добавляется следующими патчами.
 */

// Расход зарядов Ядерного блока каркасом, зарядов в час. Временное значение (§3.3 плана).
export const PA_CORE_DRAIN_PER_HOUR = 5;

// Бросок зарядов нового Ядерного блока.
// Запись — конвенция diceRollsLogic.rollByType(rollType, rollValue):
// rollType — какой кубик (rollD20 / rollCD), rollValue — сколько бросков. Раздельно, как в проекте.
// Максимум подписи берётся НЕ отсюда, а из данных предмета (maxCharges у ammo_fusion_core).
export const FUSION_CORE_CHARGES_ROLL = { rollType: 'rollD20', rollValue: 1 };
