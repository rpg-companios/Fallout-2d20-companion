import { registerStateExtension } from 'engine:src/store/stateExtensions';
import useCharacterStore from 'engine:src/store/characterStore';
import { FALLOUT_RESOURCE_FIELDS } from '../logic/radiationResource.js';
import {
  FALLOUT_ROBOT_STATE_EXTENSION_KEY,
  createInitialFalloutRobotState,
  hydrateFalloutRobotState,
} from '../store/robotState.js';
import {
  FALLOUT_POWER_ARMOR_STATE_EXTENSION_KEY,
  createInitialFalloutPowerArmorState,
  hydrateFalloutPowerArmorState,
  serializeFalloutPowerArmorState,
} from '../store/powerArmorState.js';

/** Register Fallout-owned runtime and save fields under their existing save keys. */
export const activateFalloutSaveStateExtensions = () => {
  const disposers = [];
  try {
    disposers.push(registerStateExtension({
      id: 'falloutRobotEquipment',
      fieldKey: FALLOUT_ROBOT_STATE_EXTENSION_KEY,
      factory: createInitialFalloutRobotState,
      hydrate: hydrateFalloutRobotState,
      reset: createInitialFalloutRobotState,
    }));
    disposers.push(registerStateExtension({
      id: 'falloutPowerArmor',
      fieldKey: FALLOUT_POWER_ARMOR_STATE_EXTENSION_KEY,
      factory: createInitialFalloutPowerArmorState,
      hydrate: hydrateFalloutPowerArmorState,
      reset: createInitialFalloutPowerArmorState,
      serialize: serializeFalloutPowerArmorState,
    }));
    disposers.push(registerStateExtension({
      id: 'falloutRadiation',
      fieldKey: FALLOUT_RESOURCE_FIELDS.radiation,
      factory: () => 0,
      hydrate: (value) => Math.max(0, Number(value ?? 0) || 0),
      reset: () => 0,
    }));
    disposers.push(registerStateExtension({
      id: 'falloutChemDosesLog',
      fieldKey: 'chemDosesLog',
      factory: () => [],
      hydrate: (value) => (Array.isArray(value) ? value : []),
      reset: () => [],
    }));
    disposers.push(registerStateExtension({
      id: 'falloutLastDiseaseResistAt',
      fieldKey: 'lastDiseaseResistAt',
      factory: () => null,
      hydrate: (value) => value ?? null,
      reset: () => null,
    }));
    useCharacterStore.getState().ensureStateExtensionFields?.();
    let currentStore = useCharacterStore.getState();
    const persistedRobotState = currentStore.stateExtensions?.[FALLOUT_ROBOT_STATE_EXTENSION_KEY];
    if (persistedRobotState) {
      currentStore.setStateExtension?.(
        FALLOUT_ROBOT_STATE_EXTENSION_KEY,
        hydrateFalloutRobotState(persistedRobotState),
      );
      currentStore = useCharacterStore.getState();
    }

    const hasLegacyPowerArmorState = Object.hasOwn(currentStore, 'equippedPowerArmor')
      || Object.hasOwn(currentStore, 'powerArmorRuntime');
    if (hasLegacyPowerArmorState) {
      const powerArmorState = {
        ...(currentStore.stateExtensions?.[FALLOUT_POWER_ARMOR_STATE_EXTENSION_KEY] || {}),
        ...(Object.hasOwn(currentStore, 'equippedPowerArmor')
          ? { equippedPowerArmor: currentStore.equippedPowerArmor }
          : {}),
        ...(Object.hasOwn(currentStore, 'powerArmorRuntime')
          ? { powerArmorRuntime: currentStore.powerArmorRuntime }
          : {}),
      };
      const migratedStore = {
        ...currentStore,
        stateExtensions: {
          ...(currentStore.stateExtensions || {}),
          [FALLOUT_POWER_ARMOR_STATE_EXTENSION_KEY]: hydrateFalloutPowerArmorState(powerArmorState),
        },
      };
      delete migratedStore.equippedPowerArmor;
      delete migratedStore.powerArmorRuntime;
      delete migratedStore.pendingCoreChoice;
      useCharacterStore.setState(migratedStore, true);
      useCharacterStore.getState().recalculateDerivedStats?.();
    } else {
      const persistedPowerArmorState = currentStore.stateExtensions?.[FALLOUT_POWER_ARMOR_STATE_EXTENSION_KEY];
      if (persistedPowerArmorState) {
        currentStore.setStateExtension?.(
          FALLOUT_POWER_ARMOR_STATE_EXTENSION_KEY,
          hydrateFalloutPowerArmorState(persistedPowerArmorState),
        );
      }
    }
  } catch (error) {
    disposers.reverse().forEach((dispose) => dispose?.());
    throw error;
  }

  let active = true;
  return () => {
    if (!active) return;
    active = false;
    disposers.reverse().forEach((dispose) => dispose?.());
  };
};
