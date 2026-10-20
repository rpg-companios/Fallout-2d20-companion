import { createEmptyEquippedArmor } from '../../domain/equippedArmor.js';

/** Shared worn-armor state; setting-owned equipment payloads live in extensions. */
export const createInitialEquipmentState = () => ({
  equippedArmor: createEmptyEquippedArmor(),
});

/** Common equipped-armor updater. */
export const createEquipmentActions = (set) => ({
  setEquippedArmor: (updater) => set((state) => ({
    equippedArmor: typeof updater === 'function' ? updater(state.equippedArmor) : updater,
  })),
});
