import { classifyModWritePlan } from 'engine:src/engine/items/weaponMods';
import { deserializeSlot, isSlimSlot } from './robotSlots.js';

/** Stable host identity for a weapon nested in a Fallout robot equipment slot. */
export const robotWeaponHostKey = (slotKey, weaponId) =>
  `robotSlot:${slotKey}:${weaponId ?? 'unknown'}`;

/** Extend the shared item-location plan with Fallout robot-slot targets. */
export const classifyFalloutModWritePlan = (ref = {}, context = {}) => {
  const weaponId = ref.weaponId ?? ref.id ?? null;
  if (ref.sourceSlot) {
    let role = ref.attackRole ?? null;
    if (!role) {
      role = ref.isBuiltin ? 'installed' : (context.slotHasHeldWeapon ? 'held' : null);
    }
    if (role) {
      return { kind: 'robotSlot', slotKey: ref.sourceSlot, role, weaponId };
    }
  }
  return classifyModWritePlan(ref);
};

const modIdsOf = (weapon) => {
  const ids = [];
  if (Array.isArray(weapon?.modIds)) {
    ids.push(...weapon.modIds.filter((id) => typeof id === 'string'));
  }
  if (weapon?.appliedMods && typeof weapon.appliedMods === 'object') {
    ids.push(...Object.values(weapon.appliedMods).filter((id) => typeof id === 'string'));
  }
  return ids;
};

const getSavedRobotSlots = (state) => {
  const robot = state?.stateExtensions?.robot || state?.robot || state?.robots;
  const extensionSlots = robot?.slots;
  if (extensionSlots && Object.keys(extensionSlots).length > 0) return extensionSlots;
  return state?.equippedRobotSlots ?? extensionSlots ?? {};
};

/**
 * Fallout-owned modifier targets that are not shared item instances:
 * armor's named modifier fields and weapon instances nested in robot slots.
 */
export const getFalloutAdditionalModifierRoles = (state, modifierIds) => {
  const roles = [];
  const items = state?.items && typeof state.items === 'object' ? state.items : {};
  const armorFields = [
    ['appliedArmorModId', 'armor'],
    ['appliedUniqueArmorModId', 'uniqueArmor'],
    ['appliedClothingModId', 'clothing'],
  ];
  for (const [hostKey, item] of Object.entries(items)) {
    if (!item || typeof item !== 'object') continue;
    const hostCatalogId = String(item.weaponId || '');
    if (hostCatalogId.startsWith('weapon_') && !modifierIds?.has(hostCatalogId)
        && item.appliedMods && typeof item.appliedMods === 'object') {
      for (const [slotId, modifierId] of Object.entries(item.appliedMods)) {
        roles.push({ targetId: hostKey, modifierId, slotId });
      }
    }
    for (const [field, slotId] of armorFields) {
      const modifierId = item[field];
      if (typeof modifierId === 'string' && modifierId) {
        roles.push({ targetId: hostKey, modifierId, slotId });
      }
    }
  }

  for (const [slotKey, storedSlot] of Object.entries(getSavedRobotSlots(state) || {})) {
    if (!storedSlot || typeof storedSlot !== 'object') continue;
    const slot = isSlimSlot(storedSlot) ? deserializeSlot(storedSlot) : storedSlot;
    const weapons = [
      ...(Array.isArray(slot?.limb?.builtinWeapons) ? slot.limb.builtinWeapons : []),
      ...(slot?.heldWeapon ? [slot.heldWeapon] : []),
    ];
    for (const weapon of weapons) {
      if (!weapon || typeof weapon !== 'object') continue;
      const weaponId = weapon.weaponId || weapon.id || null;
      const targetId = robotWeaponHostKey(slotKey, weaponId);
      for (const modifierId of modIdsOf(weapon)) {
        roles.push({ targetId, modifierId, slotId: null });
      }
    }
  }
  return roles;
};

/** Fallout modifier records use the legacy field names kept in existing saves. */
export const getFalloutModifierRecordId = (item) =>
  item?.weaponId || item?.catalogId || item?.id || null;

/** Create one missing instance in the exact legacy save/store shape. */
export const createFalloutModifierInstance = ({
  id,
  modifierId,
  targetId,
  slotId,
  stackKey,
}) => ({
  id,
  instanceId: id,
  weaponId: modifierId,
  itemType: 'weaponMod',
  quantity: 1,
  equipped: true,
  installedOn: targetId,
  ...(slotId ? { installedSlot: slotId } : {}),
  stackKey,
});

/** Robot-slot hosts are opaque to the engine reconciler and are released by the package. */
export const shouldPreserveFalloutUnmatchedModifier = (item) =>
  typeof item?.installedOn === 'string' && item.installedOn.startsWith('robotSlot:');

/** Catalog-backed modifier identities used by save-load reconciliation. */
export const getFalloutModifierIdSets = (catalog) => {
  const collect = (items) => (Array.isArray(items) ? items : [])
    .map((entry) => entry?.id)
    .filter((id) => typeof id === 'string' && id.length > 0);
  const weaponModifierIds = new Set(collect(catalog?.weaponMods));
  const allModifierIds = new Set([
    ...weaponModifierIds,
    ...collect(catalog?.armorMods),
    ...collect(catalog?.uniqArmorMods),
  ]);
  return { allModifierIds, weaponModifierIds };
};
