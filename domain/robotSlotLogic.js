// RobotSlotLogic.js
// Pure logic extracted from RobotSlot for testability (no React, no UI deps).

import { tWeaponsAndArmorScreen } from '../modules/fallout/screens/WeaponsAndArmorScreen/weaponsAndArmorScreenI18n';
import { getBodyPlan } from './bodyplan';
import { getRobotSlotDamageResistance } from './robotDamageResistance';

/**
 * Builds the slot title, limb name, and stats array for a RobotSlot.
 *
 * Stats shown (in order):
 *   1. Физ.СУ  — physicalDR from limb
 *   2. Энрг.СУ — energyDR from limb
 *   3. Рад.СУ  — radDR from limb
 *   4. Кнопка "Конечность"
 *   5. Кнопка "Броня" (opens picker for plating/armor/frame)
 *
 * @param {string} slotKey
 * @param {object|null|undefined} slotData - { limb, armor, plating, frame, heldWeapon }
 * @param {object} callbacks - { onUpgradeLimb, onOpenArmorPicker, t, hasRadImmunity }
 * @returns {{ slotTitle: string, slotSubtitle: string, limbName: string|null, stats: object[] }}
 */
export const buildRobotSlotStats = (slotKey, slotData, callbacks = {}) => {
  const { onUpgradeLimb, onUpgradeArmor, onOpenArmorPicker, t = tWeaponsAndArmorScreen, hasRadImmunity = false, bodyPlan } = callbacks;

  const limb = slotData?.limb;

  if (limb != null && (typeof limb.name !== 'string' || limb.name.length === 0)) {
    throw new Error(`[robotSlotLogic] Для детали робота "${limb.id}" нет локализованного имени`);
  }
  const limbName = limb != null
    ? limb.name
    : t('robotSlot.noLimb');

  const slotTitle = t(`robotSlot.slotNames.${slotKey}`) || slotKey;
  // Диапазоны попаданий (d20) — из плана тела, если он их объявляет (секьюритрон),
  // иначе общий словарь armor.slots (человекоподобная таблица).
  const planHitLocation = bodyPlan ? getBodyPlan(bodyPlan)?.hitLocations?.[slotKey] : null;
  const slotSubtitle = planHitLocation ?? (t(`armor.slots.${slotKey}.subtitle`) || '');

  const stats = [];

  // --- Итоговая СУ слота: конечность + совместимые защитные слои ---
  // Раньше здесь бралась ТОЛЬКО СУ конечности, поэтому броня/обшивка/рама
  // не влияли на карточку слота (баг «ставлю броню — статы не меняются»).
  // Теперь считаем итог (см. domain/robotDamageResistance.js): конечность +
  // вклад слоёв, совместимых по incompatibleLayers (броня+рама, либо обшивка).
  const slotDR = getRobotSlotDamageResistance(slotData);
  const physDR = slotDR.physical;
  const energyDR = slotDR.energy;
  const radDR = slotDR.rad;

  stats.push({
    label: t('armor.fields.physical'),
    value: String(physDR),
    type: 'value',
  });
  stats.push({
    label: t('armor.fields.energy'),
    value: String(energyDR),
    type: 'value',
  });
  stats.push({
    label: t('armor.fields.radiation'),
    value: hasRadImmunity ? '∞' : String(radDR),
    type: 'value',
  });

  // --- Кнопка модернизации конечности ---
  stats.push({
    label: t('robotSlot.buttons.upgradeLimb'),
    value: '⋯',
    type: 'button',
    onPress: () => onUpgradeLimb && onUpgradeLimb(slotKey),
  });

  // --- Единая кнопка "Броня" (обшивка / броня / рама) ---
  const openPicker = onOpenArmorPicker || ((sk) => {
    // fallback: если передан только onUpgradeArmor, открываем броню напрямую
    onUpgradeArmor && onUpgradeArmor('armor');
  });
  stats.push({
    label: t('robotSlot.buttons.upgradeArmor'),
    value: '⋯',
    type: 'button',
    onPress: () => openPicker(slotKey),
  });

  return { slotTitle, slotSubtitle, limbName, stats };
};
