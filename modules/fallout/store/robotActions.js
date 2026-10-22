/**
 * @file robotActions.js
 * @description Fallout-owned actions for the robot equipment extension.
 *
 * Goal (Fix #2): make the Zustand store the single source of truth for robot
 * equipment, replacing the useState fields in CharacterContext
 * (equippedRobotSlots / equippedRobotModules). Screens should READ via selectors
 * and never mutate slot objects in place.
 *
 * All robot rules are delegated to the active setting's robotEquipment feature;
 * this slice only owns state transitions + immutability.
 *
 * State shape:
 *   robot: {
 *     bodyPlan : string | null            // e.g. 'protectron'
 *     slots    : { [slotKey]: SlotData }  // { limb, armor, plating, frame, heldWeapon }
 *     modules  : object[]                 // installed robot modules
 *   }
 */

import { modIdList } from 'engine:src/engine/items/weaponMods';
import { getSettingService } from 'engine:domain/registry';
import { robotWeaponHostKey } from '../logic/robotWeaponMods.js';
import { debugLog } from '../debug.js';
import {
  FALLOUT_ROBOT_STATE_EXTENSION_KEY,
  createInitialFalloutRobotState,
  getFalloutRobotState,
} from './robotState.js';

const readRobotState = (get) =>
  getFalloutRobotState(get()) ?? createInitialFalloutRobotState();

const writeRobotState = (set, get, updater) => {
  const current = readRobotState(get);
  const next = typeof updater === 'function' ? updater(current) : updater;
  set((state) => ({
    stateExtensions: {
      ...(state.stateExtensions || {}),
      [FALLOUT_ROBOT_STATE_EXTENSION_KEY]: next,
    },
  }));
};

const getRobotEquipmentFeature = () => (
  getSettingService('inventory')?.features?.robotEquipment ?? null
);
const callRobotEquipment = (method, ...args) => {
  const action = getRobotEquipmentFeature()?.[method];
  return typeof action === 'function' ? action(...args) : undefined;
};

/**
 * 359 (закон 343/344 на робо-оружии): снять привязку модов с оружия, которое
 * покидает слот (замена конечности / опустошение ладони). Моды возвращаются
 * в сумку (uninstallArmorMod — только снимает флаги, предметы не удаляет).
 */
const releaseRobotSlotMods = (get, slots, slotKey) => {
  const slotData = slots?.[slotKey];
  if (!slotData) return;
  const leaving = [
    ...(Array.isArray(slotData.limb?.builtinWeapons) ? slotData.limb.builtinWeapons : []),
    ...(slotData.heldWeapon ? [slotData.heldWeapon] : []),
  ];
  const { uninstallArmorMod } = get();
  for (const weapon of leaving) {
    const weaponId = weapon?.weaponId || weapon?.id;
    if (!weaponId) continue;
    const hostKey = robotWeaponHostKey(slotKey, weaponId);
    for (const modId of modIdList(weapon)) {
      uninstallArmorMod({ modId, hostKey });
    }
  }
};

/**
 * Factory that returns Fallout robot actions, bound to the host store's set/get.
 * @param {function} set - Zustand set
 * @param {function} get - Zustand get
 */
export const createFalloutRobotActions = (set, get) => ({
  // --- Initialization ---

  /**
   * Initialize robot slots for a body plan (empty slots, no kit).
   * @param {string} bodyPlan
   */
  initRobot: (bodyPlan) => {
    if (!bodyPlan) return;
    const slots = callRobotEquipment('createEmptyRobotSlots', bodyPlan);
    if (!slots) return;
    writeRobotState(set, get, {
      bodyPlan,
      slots,
      modules: [],
      mk2Installed: readRobotState(get).mk2Installed ?? false,
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
    const initialized = callRobotEquipment(
      'initRobotSlots',
      bodyPlan,
      resolvedKitItems,
      robotCatalog,
    );
    if (!initialized) return { inventoryItems: resolvedKitItems || [] };
    const { slots, modules, inventoryItems } = initialized;
    writeRobotState(set, get, {
      bodyPlan,
      slots,
      modules,
      mk2Installed: readRobotState(get).mk2Installed ?? false,
    });
    return { inventoryItems: inventoryItems || [] };
  },

  /**
   * Load robot state directly (e.g. from a legacy DB snapshot).
   * @param {{ bodyPlan?: string, slots?: object, modules?: object[] }} robotState
   */
  loadRobotState: (robotState) => {
    if (!robotState) return;
    // 360: худая форма слотов из сейва разворачивается здесь, а не только в
    // deserializeState — в памяти слоты всегда ПОЛНЫЕ (как после комплекта).
    // Иначе ветки записи модов (setInstalledWeaponMods: limb.builtinWeapons)
    // молча не срабатывают на слоте, который пришёл худым.
    const slots = {};
    for (const [slotKey, slotData] of Object.entries(robotState.slots ?? {})) {
      slots[slotKey] = callRobotEquipment('isSlimSlot', slotData)
        ? callRobotEquipment('deserializeSlot', slotData)
        : slotData;
    }
    const currentRobot = readRobotState(get);
    writeRobotState(set, get, {
      bodyPlan: robotState.bodyPlan ?? currentRobot.bodyPlan ?? null,
      slots,
      modules: robotState.modules ?? [],
      mk2Installed: robotState.mk2Installed ?? currentRobot.mk2Installed ?? false,
    });
  },

  /**
   * Заменить слоты робота целиком: значением или функцией от предыдущих
   * (функциональный апдейтер — обязательное требование к новым сеттерам,
   * прецедент setEquippedWeapons). bodyPlan и mk2Installed сохраняются.
   * До Шага 8а экраны писали через useState-обёртку CharacterContext с
   * зеркалом в loadRobotState; теперь это прямое действие стора.
   */
  setEquippedRobotSlots: (updater) => {
    const robot = readRobotState(get);
    const prev = robot.slots || {};
    const next = typeof updater === 'function' ? updater(prev) : (updater || {});
    writeRobotState(set, get, { ...robot, slots: next || {} });
  },

  /** Заменить модули робота целиком (значение или функция); остальное robot сохраняет. */
  setEquippedRobotModules: (updater) => {
    const robot = readRobotState(get);
    const prev = Array.isArray(robot.modules) ? robot.modules : [];
    const next = typeof updater === 'function' ? updater(prev) : (updater || []);
    writeRobotState(set, get, { ...robot, modules: next || [] });
  },

  resetRobot: () => writeRobotState(set, get, createInitialFalloutRobotState()),

  // --- Mk II operating system (Securitron) ---

  /**
   * Apply the Mk II OS driver to a Securitron.
   * Consumes one `robot_item_mk2_driver` from the inventory and activates the
   * `requiresMkII` weapons (missile launcher, grenade launcher) for attacks.
   * Only the Securitron body plan can accept the driver.
   * @param {string} itemId - store id of the driver item
   * @returns {{ ok: boolean, reason?: string }}
   */
  applyMk2Driver: (itemId) => {
    const result = callRobotEquipment('applyMk2Driver', { ...get(), robot: readRobotState(get) }, itemId);
    if (!result) return { ok: false, reason: 'setting.featureUnavailable' };
    if (result.ok && result.patch) {
      const { robot: updatedRobot, ...hostPatch } = result.patch;
      set((state) => ({
        ...hostPatch,
        ...(updatedRobot ? {
          stateExtensions: {
            ...(state.stateExtensions || {}),
            [FALLOUT_ROBOT_STATE_EXTENSION_KEY]: updatedRobot,
          },
        } : {}),
      }));
    }
    return result.ok ? { ok: true } : { ok: false, reason: result.reason };
  },

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
    const robot = readRobotState(get);
    const slots = robot?.slots || {};
    const check = callRobotEquipment('canReplaceLimb', slotKey, newLimb, character);
    if (!check) return { ok: false, reason: 'setting.featureUnavailable' };
    if (!check.allowed) return { ok: false, reason: check.reason };

    // 359 (закон 343/344): конечность уходит вместе с установленным оружием —
    // его моды возвращаются в сумку (снятие привязки к робо-носителю).
    releaseRobotSlotMods(get, slots, slotKey);

    const replacement = callRobotEquipment('applyLimbReplacement', slots, slotKey, newLimb, weaponsCatalog);
    if (!replacement) return { ok: false, reason: 'setting.featureUnavailable' };
    writeRobotState(set, get, { ...robot, slots: replacement.slots });
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
    const robot = readRobotState(get);
    const slots = robot?.slots || {};
    const slotData = slots[slotKey];
    if (!slotData) return { ok: false, reason: 'equip.error.invalidSlot' };

    const check = callRobotEquipment('canEquipWeaponToSlot', weapon, slotData, character);
    if (!check) return { ok: false, reason: 'setting.featureUnavailable' };
    if (!check.allowed) return { ok: false, reason: check.reason };

    const nextSlots = {
      ...slots,
      [slotKey]: { ...slotData, heldWeapon: weapon },
    };
    writeRobotState(set, get, { ...robot, slots: nextSlots });
    return { ok: true };
  },

  /**
   * Remove the held weapon from a slot (built-in weapons are NOT removable).
   * @param {string} slotKey
   */
  unequipHeldWeapon: (slotKey) => {
    const robot = readRobotState(get);
    const slots = robot?.slots || {};
    const slotData = slots[slotKey];
    if (!slotData || !slotData.heldWeapon) return;
    // 359 (закон 343/344): оружие покидает ладонь — его моды снова в сумке.
    releaseRobotSlotMods(get, slots, slotKey);
    const nextSlots = {
      ...slots,
      [slotKey]: { ...slotData, heldWeapon: null },
    };
    writeRobotState(set, get, { ...robot, slots: nextSlots });
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
    const robot = readRobotState(get);
    const slots = robot?.slots || {};
    const slotData = slots[slotKey];
    if (!slotData) return { ok: false, reason: 'equip.error.invalidSlot' };

    if (armorItem) {
      const check = callRobotEquipment('canEquipRobotArmor', armorItem, slotKey, layer, slots);
      if (!check) return { ok: false, reason: 'setting.featureUnavailable' };
      if (!check.allowed) return { ok: false, reason: check.reason };
    }

    const nextSlots = {
      ...slots,
      [slotKey]: { ...slotData, [layer]: armorItem ?? null },
    };
    writeRobotState(set, get, { ...robot, slots: nextSlots });
    return { ok: true };
  },

  // Install a mod on an installed robot weapon. Its host is a stable synthetic
  // identity because the weapon itself is nested in the robot equipment payload.
  installRobotWeaponMod: ({ modId, hostKey } = {}) => {
    if (!modId || !hostKey) return null;
    const items = { ...(get().items || {}) };
    const entry = Object.entries(items).find(([, item]) => (
      item?.weaponId === modId && !item.equipped && !item.installedOn
    ));
    if (!entry) return null;
    const [key, item] = entry;
    items[key] = { ...item, equipped: true, installedOn: hostKey };
    set({ items });
    debugLog('robotWeaponMod.installed', { modId, instanceKey: key, hostKey });
    return key;
  },

  // --- Modules ---

  addRobotModule: (module) => {
    if (!module) return;
    const robot = readRobotState(get);
    const modules = Array.isArray(robot?.modules) ? robot.modules : [];
    if (module.id && modules.some((m) => m.id === module.id)) return; // no duplicates by id
    writeRobotState(set, get, { ...robot, modules: [...modules, module] });
  },

  removeRobotModule: (moduleId) => {
    const robot = readRobotState(get);
    const modules = Array.isArray(robot?.modules) ? robot.modules : [];
    writeRobotState(set, get, { ...robot, modules: modules.filter((m) => m.id !== moduleId) });
  },
});
