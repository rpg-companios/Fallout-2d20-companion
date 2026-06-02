// RobotSlotLogic.js
// Pure logic extracted from RobotSlot for testability (no React, no UI deps).

import { tWeaponsAndArmorScreen } from '../components/screens/WeaponsAndArmorScreen/weaponsAndArmorScreenI18n';

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
  const { onUpgradeLimb, onUpgradeArmor, onOpenArmorPicker, t = tWeaponsAndArmorScreen, hasRadImmunity = false } = callbacks;

  const limb = slotData?.limb;

  const limbName = limb != null
    ? t(`robotLimbs.${limb.id}`, limb.name ?? limb.id)
    : t('robotSlot.noLimb');

  const slotTitle = t(`robotSlot.slotNames.${slotKey}`) || slotKey;
  const slotSubtitle = t(`armor.slots.${slotKey}.subtitle`) || '';

  const stats = [];

  // --- DR из конечности ---
  const physDR = limb?.physicalDR ?? null;
  const energyDR = limb?.energyDR ?? null;
  const radDR = limb?.radDR ?? null;

  stats.push({
    label: t('armor.fields.physical'),
    value: physDR !== null ? String(physDR) : t('common.none'),
    type: 'value',
  });
  stats.push({
    label: t('armor.fields.energy'),
    value: energyDR !== null ? String(energyDR) : t('common.none'),
    type: 'value',
  });
  stats.push({
    label: t('armor.fields.radiation'),
    value: hasRadImmunity ? '∞' : (radDR !== null ? String(radDR) : t('common.none')),
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
