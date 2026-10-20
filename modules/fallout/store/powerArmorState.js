import {
  createEmptyEquippedPowerArmor,
  createEmptyPowerArmorRuntime,
} from '../logic/powerArmor.js';

export const FALLOUT_POWER_ARMOR_STATE_EXTENSION_KEY = 'falloutPowerArmor';

export const createInitialFalloutPowerArmorState = () => ({
  equippedPowerArmor: createEmptyEquippedPowerArmor(),
  powerArmorRuntime: createEmptyPowerArmorRuntime(),
  pendingCoreChoice: null,
});

export const hydrateFalloutPowerArmorState = (value) => {
  const state = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    ...createInitialFalloutPowerArmorState(),
    ...state,
    equippedPowerArmor: state.equippedPowerArmor || createEmptyEquippedPowerArmor(),
    powerArmorRuntime: state.powerArmorRuntime || createEmptyPowerArmorRuntime(),
    // Dialog state is session-only and must never be revived from storage.
    pendingCoreChoice: null,
  };
};

export const serializeFalloutPowerArmorState = (value) => {
  const state = hydrateFalloutPowerArmorState(value);
  return {
    equippedPowerArmor: state.equippedPowerArmor,
    powerArmorRuntime: state.powerArmorRuntime,
  };
};

export const getFalloutPowerArmorState = (state) =>
  state?.stateExtensions?.[FALLOUT_POWER_ARMOR_STATE_EXTENSION_KEY] ?? null;

const EMPTY_FALLOUT_POWER_ARMOR_STATE = Object.freeze({
  equippedPowerArmor: Object.freeze(createEmptyEquippedPowerArmor()),
  powerArmorRuntime: Object.freeze(createEmptyPowerArmorRuntime()),
  pendingCoreChoice: null,
});

export const selectFalloutPowerArmorState = (state) =>
  getFalloutPowerArmorState(state) ?? EMPTY_FALLOUT_POWER_ARMOR_STATE;

export const updateFalloutPowerArmorState = (set, get, updater) => {
  const current = getFalloutPowerArmorState(get()) ?? createInitialFalloutPowerArmorState();
  const next = typeof updater === 'function' ? updater(current) : { ...current, ...updater };
  set((state) => ({
    stateExtensions: {
      ...(state.stateExtensions || {}),
      [FALLOUT_POWER_ARMOR_STATE_EXTENSION_KEY]: next,
    },
  }));
};
