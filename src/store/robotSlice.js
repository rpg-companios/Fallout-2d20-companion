/**
 * @file robotSlice.js
 * @description Zustand slice for robot equipment state (slots, modules, body plan).
 *
 * Goal (Fix #2): make the Zustand store the single source of truth for robot
 * equipment, replacing the useState fields in CharacterContext
 * (equippedRobotSlots / equippedRobotModules). Screens should READ via selectors
 * and never mutate slot objects in place.
 *
 * All mutating actions delegate to the pure functions in domain/robotEquip.js;
 * this slice only owns state transitions + immutability.
 *
 * State shape:
 *   robot: {
 *     bodyPlan : string | null            // e.g. 'protectron'
 *     slots    : { [slotKey]: SlotData }  // { limb, armor, plating, frame, heldWeapon, capabilities }
 *     modules  : object[]                 // installed robot modules
 *   }
 */

import {
  createEmptyRobotSlots,
  getRobotSlotKeys,
  initRobotSlots,
  applyLimbReplacement,
  canReplaceLimb,
  canEquipRobotArmor,
  canEquipWeaponToSlot,
  getBuiltinWeaponsFromSlots,
} from '../../domain/robotEquip';

export const createInitialRobotState = () => ({
  robot: {
    bodyPlan: null,
    slots: {},
    modules: [],
  },
});

/**
 * Factory that returns the robot actions, bound to the store's set/get.
 * @param {function} set - Zustand set
 * @param {function} get - Zustand get
 */
export const createRobotActions = (set, get) => ({
  // --- Initialization ---

  /**
   * Initialize robot slots for a body plan (empty slots, no kit).
   * @param {string} bodyPlan
   */
  initRobot: (bodyPlan) => {
    if (!bodyPlan) return;
    set({
      robot: {
        bodyPlan,
        slots: createEmptyRobotSlots(bodyPlan),
        modules: [],
      },
    });
  },

  /**
   * Initialize robot state from already-resolved kit items.
   * Delegates to the pure initRobotSlots(); also collects non-robot inventory
   * items so the caller can route them into addNewItem().
   * @param {string} bodyPlan
   * @param {object[]} resolvedKitItems
   * @param {object} robotCatalog - { heads, bodies, arms, legs, weapons }
   * @returns {{ inventoryItems: object[] }} leftover items for the normal inventory
   */
  initRobotFromKit: (bodyPlan, resolvedKitItems = [], robotCatalog = {}) => {
    const { slots, modules, inventoryItems } = initRobotSlots(
      bodyPlan,
      resolvedKitItems,
      robotCatalog,
    );
    set({ robot: { bodyPlan, slots, modules } });
    return { inventoryItems: inventoryItems || [] };
  },

  /**
   * Load robot state directly (e.g. from a legacy DB snapshot).
   * @param {{ bodyPlan?: string, slots?: object, modules?: object[] }} robotState
   */
  loadRobotState: (robotState) => {
    if (!robotState) return;
    set({
      robot: {
        bodyPlan: robotState.bodyPlan ?? get().robot?.bodyPlan ?? null,
        slots: robotState.slots ?? {},
        modules: robotState.modules ?? [],
      },
    });
  },

  resetRobot: () => set(createInitialRobotState()),

  // --- Limbs ---

  /**
   * Replace the limb in a slot. Validates body-plan compatibility.
   * @param {string} slotKey
   * @param {object} newLimb
   * @param {object} character - { origin: { robotBodyPlan } }
   * @param {object[]} weaponsCatalog
   * @returns {{ ok: boolean, reason?: string }}
   */
  replaceLimb: (slotKey, newLimb, character, weaponsCatalog = []) => {
    const robot = get().robot;
    const slots = robot?.slots || {};
    const check = canReplaceLimb(slotKey, newLimb, character);
    if (!check.allowed) return { ok: false, reason: check.reason };

    const { slots: nextSlots } = applyLimbReplacement(slots, slotKey, newLimb, weaponsCatalog);
    set({ robot: { ...robot, slots: nextSlots } });
    return { ok: true };
  },

  // --- Held weapons (weapons.json placed in arm limbs that canHoldWeapons) ---

  /**
   * Equip a held weapon into a slot, if the slot's limb can hold it.
   * @param {string} slotKey
   * @param {object} weapon
   * @param {object} character
   * @returns {{ ok: boolean, reason?: string }}
   */
  equipHeldWeapon: (slotKey, weapon, character) => {
    const robot = get().robot;
    const slots = robot?.slots || {};
    const slotData = slots[slotKey];
    if (!slotData) return { ok: false, reason: 'equip.error.invalidSlot' };

    const check = canEquipWeaponToSlot(weapon, slotData, character);
    if (!check.allowed) return { ok: false, reason: check.reason };

    const nextSlots = {
      ...slots,
      [slotKey]: { ...slotData, heldWeapon: weapon },
    };
    set({ robot: { ...robot, slots: nextSlots } });
    return { ok: true };
  },

  /**
   * Remove the held weapon from a slot (built-in weapons are NOT removable).
   * @param {string} slotKey
   */
  unequipHeldWeapon: (slotKey) => {
    const robot = get().robot;
    const slots = robot?.slots || {};
    const slotData = slots[slotKey];
    if (!slotData || !slotData.heldWeapon) return;
    const nextSlots = {
      ...slots,
      [slotKey]: { ...slotData, heldWeapon: null },
    };
    set({ robot: { ...robot, slots: nextSlots } });
  },

  // --- Armor layers (plating / armor / frame) ---

  /**
   * Set (or clear) an armour layer on a slot. Enforces incompatibleLayers.
   * @param {string} slotKey
   * @param {'plating'|'armor'|'frame'} layer
   * @param {object|null} armorItem - pass null to clear the layer
   * @returns {{ ok: boolean, reason?: string }}
   */
  setRobotArmorLayer: (slotKey, layer, armorItem) => {
    const robot = get().robot;
    const slots = robot?.slots || {};
    const slotData = slots[slotKey];
    if (!slotData) return { ok: false, reason: 'equip.error.invalidSlot' };

    if (armorItem) {
      const check = canEquipRobotArmor(armorItem, slotKey, layer, slots);
      if (!check.allowed) return { ok: false, reason: check.reason };
    }

    const nextSlots = {
      ...slots,
      [slotKey]: { ...slotData, [layer]: armorItem ?? null },
    };
    set({ robot: { ...robot, slots: nextSlots } });
    return { ok: true };
  },

  // --- Modules ---

  addRobotModule: (module) => {
    if (!module) return;
    const robot = get().robot;
    const modules = Array.isArray(robot?.modules) ? robot.modules : [];
    if (module.id && modules.some((m) => m.id === module.id)) return; // no duplicates by id
    set({ robot: { ...robot, modules: [...modules, module] } });
  },

  removeRobotModule: (moduleId) => {
    const robot = get().robot;
    const modules = Array.isArray(robot?.modules) ? robot.modules : [];
    set({ robot: { ...robot, modules: modules.filter((m) => m.id !== moduleId) } });
  },
});

// --- Selectors (read-only; safe to use from screens) ---

export const selectRobotSlots = (state) => state.robot?.slots || {};
export const selectRobotModules = (state) => state.robot?.modules || [];
export const selectRobotBodyPlan = (state) => state.robot?.bodyPlan ?? null;
export const selectRobotSlotKeysOrdered = (state) =>
  getRobotSlotKeys(state.robot?.bodyPlan);

/** All robot attack-list weapons (built-in + manipulators + held). */
export const selectRobotWeapons = (state) =>
  getBuiltinWeaponsFromSlots(state.robot?.slots || {});
