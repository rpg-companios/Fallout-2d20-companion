import { tInventory } from '../../../components/screens/InventoryScreen/logic/inventoryI18n.js';

const ALERTS_BY_REASON = Object.freeze({
  'equip.error.robotCannotUseStandardWeapon': [
    'screen.alerts.robotArmorOnlyTitle',
    'screen.alerts.robotArmorOnlyMessage',
  ],
  'equip.error.robotOnlyWeapon': [
    'screen.alerts.robotOnlyWeaponTitle',
    'screen.alerts.robotOnlyWeaponMessage',
  ],
  'equip.error.robotCannotWearStandardArmor': [
    'screen.alerts.robotArmorOnlyTitle',
    'screen.alerts.robotArmorOnlyMessage',
  ],
  'equip.error.mutantCannotWearStandardArmor': [
    'screen.alerts.mutantCannotWearStandardArmorTitle',
    'screen.alerts.mutantCannotWearStandardArmorMessage',
  ],
  'equip.error.robotCannotWearClothing': [
    'screen.alerts.robotArmorOnlyTitle',
    'screen.alerts.robotArmorOnlyMessage',
  ],
});

/** Translate a setting-owned equipment denial without exposing its reason codes to engine UI. */
export const getFalloutEquipmentAlert = (_kind, reason) => {
  const keys = ALERTS_BY_REASON[reason];
  if (!keys) return null;
  return {
    title: tInventory(keys[0]),
    message: tInventory(keys[1]),
  };
};
