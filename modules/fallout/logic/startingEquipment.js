import { getEquipmentCatalog } from 'engine:i18n/equipmentCatalog';
import { getCurrentModuleLocale } from 'engine:i18n/locale';

/**
 * Returns Fallout's built-in unarmed weapon for characters that need one.
 * Robots use a manipulator/limb from their equipment slots instead.
 *
 * @returns {{ id: string, isBuiltin: true, itemType: 'weapon' } | null}
 */
export function getBuiltinBaseWeapon(character) {
  if (character?.origin?.characterType === 'robot') return null;
  const base = (getEquipmentCatalog(getCurrentModuleLocale())?.weapons || [])
    .find((weapon) => weapon.id === 'unarmed_human');
  if (!base?.name) {
    throw new Error('[origins] Для встроенного оружия "unarmed_human" нет перевода');
  }
  return {
    id: 'unarmed_human',
    isBuiltin: true,
    itemType: 'weapon',
    name: base.name,
  };
}
