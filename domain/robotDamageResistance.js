// domain/robotDamageResistance.js
// Расчёт итоговой защиты (СУ) слота робота.
// Pure functions — no React, no UI, no modules/fallout зависимости.
//
// МОДЕЛЬ ДАННЫХ СЛОТА:
//   slot = { limb, armor, plating, frame, heldWeapon }
//   - limb   (конечность): physicalDR / energyDR / radDR  (числа; может не быть)
//   - armor / plating / frame (защитные слои): damageResistance = { physical, energy }
//     и собственный incompatibleLayers (массив слоёв, с которыми НЕ совместим).
//
// ПРАВИЛО ВЛАДЕЛЬЦА (подтверждено данными + пользователем):
//   Итоговая СУ слота = СУ конечности + вклад совместимых защитных слоёв.
//   Конфликт задаётся на самом предмете через `incompatibleLayers`:
//     - обшивка (plating) объявляет ['armor', 'frame'] → НЕ совместима с бронёй/рамой;
//     - броня (armor) и рама (frame) не объявляют конфликтов → совместимы между собой.
//   Итог: либо «броня + рама», либо «обшивка»; конфликтующие слои НЕ суммируются
//   (в легаси-сейвах возможна несовместимая комбинация — её приводим к валидной).

import { activeArmorLayers, totalDR } from './robotSlots';

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Активные защитные слои без конфликтов (читает и старое, и новое состояние
 * слота; понимает слои, записанные идентификатором).
 * @param {object} slotData - { armor?, plating?, frame?, limb? }
 * @returns {{ key: string, layer: object }[]}
 */
export const getActiveRobotLayers = (slotData) => activeArmorLayers(slotData);

/**
 * СУ конечности (limb) как числа { physical, energy, rad }.
 * Возвращает нули для отсутствующих полей (рука-оружие без СУ → 0).
 */
export const getLimbDamageResistance = (limb) => ({
  physical: toNumber(limb?.physicalDR),
  energy: toNumber(limb?.energyDR),
  rad: toNumber(limb?.radDR),
});

/**
 * Итоговая СУ слота: конечность + совместимые слои.
 * У слоёв есть только physical/energy (радиационной СУ у них нет — берём только
 * от конечности, 0 для слоёв).
 * @param {object} slotData - { limb, armor?, plating?, frame? }
 * @returns {{ physical: number, energy: number, rad: number }}
 */
export const getRobotSlotDamageResistance = (slotData) => {
  // СУ = конечность + совместимые слои, и только там, где защита законна
  // (нет конечности или слот занят оружием — вклада нет). Радиационная СУ
  // берётся только от конечности: слои её не несут.
  return totalDR(slotData);
};
