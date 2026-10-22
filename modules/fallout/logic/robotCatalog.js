import { getSettingData } from 'engine:domain/registry';

const EMPTY_ARRAY = Object.freeze([]);
const EMPTY_OBJECT = Object.freeze({});

/**
 * Build the Fallout robot-equipment lookup view from the active package data.
 * The engine registry only exposes generic setting-data access.
 */
export function getFalloutRobotLimbCatalog() {
  const equipment = getSettingData('equipment') ?? EMPTY_OBJECT;
  const robot = equipment.robot ?? EMPTY_OBJECT;
  const robotArmor = robot.armor ?? EMPTY_OBJECT;
  const robotPlating = robot.armorPlating ?? EMPTY_OBJECT;
  const robotFrames = robot.frames ?? EMPTY_OBJECT;
  const robotWeaponMods = robot.weaponMods ?? EMPTY_ARRAY;
  const regularWeaponMods = equipment.weaponMods ?? EMPTY_ARRAY;
  return {
    limbs: robot.limbs ?? EMPTY_ARRAY,
    weaponAsLimb: robot.weaponAsLimb ?? EMPTY_ARRAY,
    weapons: robot.weapons ?? EMPTY_ARRAY,
    generalWeapons: equipment.weapons ?? EMPTY_ARRAY,
    weaponMods: [...regularWeaponMods, ...robotWeaponMods],
    robotWeaponMods,
    armorLayers: [
      ...(robotArmor.armor ?? []),
      ...(robotPlating.plating ?? []),
      ...(robotFrames.frames ?? []),
    ],
  };
}
