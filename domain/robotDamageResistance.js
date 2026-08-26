// domain/robotDamageResistance.js
// Расчёт итоговой защиты (СУ) слота робота.
// Pure functions — no React, no UI, no modules/fallout зависимости.
//
// МОДЕЛЬ ДАННЫХ СЛОТА:
//   slot = { limb, armor, plating, frame, heldWeapon, capabilities }
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

/**
 * Приоритет выбора активных защитных слоёв.
 * armor и frame совместимы (нет incompatibleLayers), поэтому идут первыми;
 * plating конфликтует с ними — добавляется только если armor/frame не заняты.
 */
const LAYER_ORDER = ['armor', 'frame', 'plating'];

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const getLayerKeys = (slotData) =>
  LAYER_ORDER.filter((key) => slotData?.[key] && typeof slotData[key] === 'object');

/**
 * Активные защитные слои без конфликтов.
 * Набор строится в LAYER_ORDER; слой пропускается, если его incompatibleLayers
 * пересекается с уже принятыми слоями.
 * @param {object} slotData - { armor?, plating?, frame?, limb? }
 * @returns {{ key: string, layer: object }[]}
 */
export const getActiveRobotLayers = (slotData) => {
  const keys = getLayerKeys(slotData);
  const active = [];
  for (const key of keys) {
    const layer = slotData[key];
    const incompatible = Array.isArray(layer.incompatibleLayers) ? layer.incompatibleLayers : [];
    const conflicts = incompatible.some((blocked) => active.some((a) => a.key === blocked));
    if (conflicts) continue;
    active.push({ key, layer });
  }
  return active;
};

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
  const result = getLimbDamageResistance(slotData?.limb);
  const active = getActiveRobotLayers(slotData);
  for (const { layer } of active) {
    const dr = layer.damageResistance || {};
    result.physical += toNumber(dr.physical);
    result.energy += toNumber(dr.energy);
  }
  // Радиация: только от конечности/иммунитета — слои радиационной СУ не несут.
  return result;
};
