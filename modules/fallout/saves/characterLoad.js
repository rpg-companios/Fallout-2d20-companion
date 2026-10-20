import { resolveBodyPlan } from '../logic/bodyplan.js';
import { getBuiltinBaseWeapon } from '../logic/startingEquipment.js';
import { CHEM_DOSE_WINDOW_MS } from '../consumables/orchestration.js';
import { debugLog } from '../debug.js';
import { FALLOUT_RESOURCE_FIELDS, getFalloutRadiation } from '../logic/radiationResource.js';
import {
  FALLOUT_ROBOT_STATE_EXTENSION_KEY,
  hydrateFalloutRobotState,
} from '../store/robotState.js';
import {
  FALLOUT_POWER_ARMOR_STATE_EXTENSION_KEY,
  hydrateFalloutPowerArmorState,
} from '../store/powerArmorState.js';

/**
 * Prepare Fallout-owned equipment and robot state after a character save has
 * been decoded. The engine owns the store actions; this package owns the rules
 * for equipped weapons, robot slots, armor-save fields, and setting-owned logs.
 */
export const prepareFalloutCharacterLoad = ({
  data,
  origin,
  trait,
  equippedWeapons = [],
}) => {
  let loadedWeapons = Array.isArray(equippedWeapons) ? equippedWeapons : [];
  const savedChemDoses = Array.isArray(data?.chemDosesLog) ? data.chemDosesLog : [];
  // Preserve Fallout's existing rolling-window cleanup during character load.
  const loadedChemDoses = Number.isFinite(CHEM_DOSE_WINDOW_MS) && CHEM_DOSE_WINDOW_MS > 0
    ? savedChemDoses.filter((dose) => Date.now() - dose.takenAt < CHEM_DOSE_WINDOW_MS)
    : savedChemDoses;

  // Old saves may contain robot weapons copied into equippedWeapons. The live
  // copies in robot slots are authoritative; discard these stale duplicates.
  const ghostCount = loadedWeapons.filter((weapon) => weapon?.sourceSlot).length;
  if (ghostCount > 0) {
    loadedWeapons = loadedWeapons.filter((weapon) => !weapon?.sourceSlot);
    debugLog('character.load.robotGhostPurged', { count: ghostCount });
  }

  // Preserve the setting's built-in unarmed weapon (e.g. fists for non-robots).
  const builtin = getBuiltinBaseWeapon({ origin, trait });
  if (builtin && !loadedWeapons.some((weapon) => weapon?.id === builtin.id)) {
    loadedWeapons = [builtin, ...loadedWeapons];
  }

  return {
    equippedWeapons: loadedWeapons,
    // Read the unchanged legacy save key and return a generic store field.
    currency: data?.caps ?? 0,
    rewardedSkills: Array.isArray(data.rewardedSkills) ? data.rewardedSkills : [],
    stateExtensions: {
      [FALLOUT_RESOURCE_FIELDS.radiation]: getFalloutRadiation(data),
      chemDosesLog: loadedChemDoses,
      lastDiseaseResistAt: data.lastDiseaseResistAt ?? null,
      [FALLOUT_ROBOT_STATE_EXTENSION_KEY]: hydrateFalloutRobotState({
        bodyPlan: resolveBodyPlan({ origin, trait }),
        slots: data.equippedRobotSlots ?? {},
        modules: data.equippedRobotModules ?? [],
        mk2Installed: data.mk2Installed ?? false,
      }),
      [FALLOUT_POWER_ARMOR_STATE_EXTENSION_KEY]: hydrateFalloutPowerArmorState({
        equippedPowerArmor: data.equippedPowerArmor,
        powerArmorRuntime: data.powerArmorRuntime,
      }),
    },
  };
};
