import { FALLOUT_RESOURCE_FIELDS, getFalloutRadiation } from '../logic/radiationResource.js';
import { getFalloutRobotState } from '../store/robotState.js';
import { selectFalloutPowerArmorState } from '../store/powerArmorState.js';

/**
 * Fallout-owned fields in the persistent character snapshot.
 * The package projects its internal extension payload back onto unchanged
 * legacy save keys; the engine does not type or interpret those keys.
 */
export const getFalloutCharacterSnapshotFields = (state) => {
  const extensions = state?.stateExtensions || {};
  const robot = getFalloutRobotState(state);
  const powerArmor = selectFalloutPowerArmorState(state);
  const slots = robot?.slots ?? null;
  const hasRobotState = Boolean(
    (slots && Object.keys(slots).length > 0)
    || (robot?.modules?.length > 0)
    || robot?.mk2Installed,
  );

  return {
    [FALLOUT_RESOURCE_FIELDS.radiation]: getFalloutRadiation(state),
    ...(Object.hasOwn(extensions, 'survival') ? { survival: extensions.survival } : {}),
    ...(Object.hasOwn(extensions, 'chemDosesLog') ? { chemDosesLog: extensions.chemDosesLog } : {}),
    ...(Object.hasOwn(extensions, 'lastDiseaseResistAt')
      ? { lastDiseaseResistAt: extensions.lastDiseaseResistAt }
      : {}),
    ...(hasRobotState ? {
      equippedRobotSlots: slots,
      equippedRobotModules: robot?.modules ?? [],
      mk2Installed: robot?.mk2Installed ?? false,
    } : {}),
    equippedArmor: state.equippedArmor,
    equippedPowerArmor: powerArmor.equippedPowerArmor,
    powerArmorRuntime: powerArmor.powerArmorRuntime,
    // Keep the historical on-disk key while the engine stores generic currency.
    caps: state.currency,
  };
};
