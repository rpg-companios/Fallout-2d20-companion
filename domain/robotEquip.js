// domain/robotEquip.js
// Pure functions for robot equipment logic.
// No React, no UI dependencies. All reason strings are i18n keys.

// ---------------------------------------------------------------------------
// Slot schemas per body plan
// ---------------------------------------------------------------------------

const BODY_PLAN_SLOTS = {
  protectron:  ['leftArm', 'head', 'rightArm', 'leftLeg', 'body', 'rightLeg'],
  assaultron:  ['leftArm', 'head', 'rightArm', 'leftLeg', 'body', 'rightLeg'],
  sentryBot:   ['leftArm', 'head', 'rightArm', 'leftLeg', 'body', 'rightLeg'],
  misterHandy: ['head', 'body', 'arm1', 'arm2', 'arm3', 'thruster'],
  robobrain:   ['head', 'body', 'leftArm', 'rightArm', 'chassis'],
};


// ---------------------------------------------------------------------------
// Простые хелперы
// ---------------------------------------------------------------------------

export function isRobotCharacter(character) {
  return Boolean(character?.origin?.isRobot);
}

export function getRobotSlotKeys(bodyPlan) {
  return BODY_PLAN_SLOTS[bodyPlan] ?? BODY_PLAN_SLOTS.protectron;
}

export function createEmptyRobotSlots(bodyPlan) {
  const keys = getRobotSlotKeys(bodyPlan);
  return keys.reduce((slots, key) => {
    slots[key] = { limb: null, armor: null, plating: null, frame: null, heldWeapon: null };
    return slots;
  }, {});
}

export function getSlotForDirection(bodyPlan, direction) {
  const slotKeys = getRobotSlotKeys(bodyPlan);
  if (direction === 'left') return slotKeys.find((k) => k === 'leftArm' || k === 'arm1') ?? null;
  if (direction === 'right') return slotKeys.find((k) => k === 'rightArm' || k === 'arm2') ?? null;
  if (direction === 'center') return slotKeys.find((k) => k === 'arm3') ?? null;
  return null;
}

// ---------------------------------------------------------------------------
// Простая инициализация слотов
// ---------------------------------------------------------------------------



// ---------------------------------------------------------------------------
// buildArmLimb — normalize a robotarms catalog entry into a slot-ready limb
// with builtinWeapons resolved from the weapons catalog.
// ---------------------------------------------------------------------------

/**
 * Resolve a robotarms catalog entry into a `limb` object suitable for placing
 * in a slot. Resolves `builtinWeaponId` against `weaponsCatalog` so that
 * `getBuiltinWeaponsFromSlots` can produce attack cards.
 *
 * @param {object} armEntry        - entry from data/equipment/robot/robotarms.json (optionally merged with i18n)
 * @param {object[]} weaponsCatalog - entries from data/equipment/robot/weapons.json (optionally merged with i18n)
 * @returns {object} normalized limb object
 */
export function buildArmLimb(armEntry, weaponsCatalog = []) {
  if (!armEntry) return armEntry;
  const list = Array.isArray(weaponsCatalog) ? weaponsCatalog : [];
  const weaponStats = armEntry.builtinWeaponId
    ? list.find((w) => w.id === armEntry.builtinWeaponId) || null
    : null;
  const builtinWeapons = weaponStats
    ? [{ ...weaponStats, isBuiltin: true }]
    : (Array.isArray(armEntry.builtinWeapons) ? armEntry.builtinWeapons : []);
  return {
    ...armEntry,
    itemType: 'robotArm',
    builtinWeapons,
    canHoldWeapons: armEntry.canHoldWeapons ?? (armEntry.weaponSlots > 0),
    weaponSlots: armEntry.weaponSlots ?? 0,
  };
}

// ---------------------------------------------------------------------------
// initRobotSlots
// ---------------------------------------------------------------------------

/**
 * Resolves a kit's already-resolved items into robot slot state.
 *
 * @param {string} bodyPlan - e.g. "protectron", "misterHandy", "robobrain"
 * @param {object[]} resolvedKitItems - items already resolved by kitResolver
 * @param {object} robotCatalog - { heads, bodies, arms, legs } arrays of limb catalog entries
 * @returns {{ slots: object, weapons: object[], modules: object[], inventoryItems: object[] }}
 */
export function initRobotSlots(bodyPlan, resolvedKitItems = [], robotCatalog = {}) {
  const slots = createEmptyRobotSlots(bodyPlan);
  const slotKeys = getRobotSlotKeys(bodyPlan);
  const modules = [];
  const inventoryItems = [];

  const armSlotKeys = slotKeys.filter((key) => key.toLowerCase().includes('arm'));

  // Lookup helpers for robotarms catalog and weapons catalog
  const armscatalog = Array.isArray(robotCatalog.arms) ? robotCatalog.arms : [];
  const weaponsCatalog = Array.isArray(robotCatalog.weapons) ? robotCatalog.weapons : [];

  // Resolve a weapon's stats from weapons catalog by id
  const resolveWeaponStats = (weaponId) => {
    if (!weaponId) return null;
    return weaponsCatalog.find((w) => w.id === weaponId) || null;
  };

  // Resolve arm entry from robotarms catalog by id
  const resolveArmEntry = (id) => {
    if (!id) return null;
    return armscatalog.find((a) => a.id === id) || null;
  };

  // Find a free compatible slot for an arm entry
  const findFreeCompatibleSlot = (armEntry) => {
    const compatible = Array.isArray(armEntry?.compatibleSlots) ? armEntry.compatibleSlots : armSlotKeys;
    return compatible.find((s) => slotKeys.includes(s) && slots[s]?.limb === null) || null;
  };

  // Build a limb object from a robotarms entry + its weapon stats
  const buildLimbFromArmEntry = (armEntry) => buildArmLimb(armEntry, weaponsCatalog);

  const buildBuiltinWeapons = (weaponData) => {
    if (Array.isArray(weaponData?.builtinWeapons) && weaponData.builtinWeapons.length > 0) {
      return weaponData.builtinWeapons;
    }

    const details = Object.entries(weaponData || {})
      .filter(([key, value]) => /^weaponDetails\d+$/i.test(key) && value && typeof value === 'object')
      .map(([, value]) => value);
    if (details.length > 0) return details;

    // Weapon-as-limb defaults to one attack card based on itself.
    return [{ ...weaponData }];
  };

  // Простая обработка предметов
  for (const item of resolvedKitItems) {
    const itype = item.itemType;

    // Конечности
    if (['robotArm', 'robotHead', 'robotBody', 'robotLeg', 'robotLegs'].includes(itype)) {
      let targetKey = null;

      if (itype === 'robotHead') {
        targetKey = 'head';
      } else if (itype === 'robotBody') {
        targetKey = 'body';
      } else if (itype === 'robotLeg' || itype === 'robotLegs') {
        targetKey = slotKeys.find(k => 
          k.toLowerCase().includes('leg') || k === 'chassis' || k === 'thruster'
        );
      } else if (itype === 'robotArm') {
        // Просто: left/right или первый свободный
        if (item.slot === 'left') {
          targetKey = slotKeys.find(k => k === 'leftArm' || k === 'arm1');
        } else if (item.slot === 'right') {
          targetKey = slotKeys.find(k => k === 'rightArm' || k === 'arm2');
        } else {
          targetKey = slotKeys.find(k => 
            k.toLowerCase().includes('arm') && slots[k].limb === null
          );
        }
      }

      if (targetKey && slots[targetKey] !== undefined) {
        if (itype === 'robotArm') {
          // Build the limb so that builtinWeaponId is resolved into builtinWeapons.
          // Preserve any kit-level overrides (e.g. slot, name) that came on `item`.
          const armEntry = resolveArmEntry(item.id) || item;
          const limbFromArm = buildLimbFromArmEntry(armEntry);
          slots[targetKey].limb = {
            ...limbFromArm,
            ...item,
            builtinWeapons: limbFromArm.builtinWeapons,
            canHoldWeapons: limbFromArm.canHoldWeapons,
            weaponSlots: limbFromArm.weaponSlots,
            itemType: 'robotArm',
          };
        } else {
          // For heads (and other non-arm limbs): resolve builtinWeaponId into builtinWeapons
          let limbData = item;
          if (item.builtinWeaponId && (!Array.isArray(item.builtinWeapons) || item.builtinWeapons.length === 0)) {
            const weaponStats = resolveWeaponStats(item.builtinWeaponId);
            if (weaponStats) {
              limbData = { ...item, builtinWeapons: [{ ...weaponStats, isBuiltin: true }] };
            }
          }
          slots[targetKey].limb = limbData;
        }
      }
      continue;
    }

    // Оружие
    if (itype === 'weapon') {
      const weaponData = item._weapon ?? item;
      // Встроенное в голову оружие — пропускаем, оно придёт через builtinWeapons головы
      if (weaponData.builtinToHead) continue;
      const armEntry = resolveArmEntry(weaponData.id ?? item.weaponId);
      if (armEntry) {
        const targetKey = findFreeCompatibleSlot(armEntry);
        if (targetKey && slots[targetKey] !== undefined) {
          const limbFromArm = buildLimbFromArmEntry(armEntry);
          slots[targetKey].limb = {
            ...limbFromArm,
            name: weaponData.name || limbFromArm.name || limbFromArm.id,
          };
          slots[targetKey].heldWeapon = null;
          continue;
        }
      }

      // Иначе как обычное оружие в руке.
      const targetKey = slotKeys.find((k) =>
        k.toLowerCase().includes('arm') && slots[k].limb?.canHoldWeapons && slots[k].heldWeapon == null
      );
      if (targetKey && slots[targetKey] !== undefined) slots[targetKey].heldWeapon = weaponData;
      else inventoryItems.push(item);
      continue;
    }

    // Броня
    if (['plating', 'armor', 'frame'].includes(itype)) {
      const armorData = item._armor ?? item;
      const location = armorData.robotLocation ?? item.robotLocation;
      const layer = armorData.layer ?? itype;
      
      // Простое распределение
      for (const k of slotKeys) {
        if (location === 'Main Body' && k === 'body') {
          slots[k][layer] = armorData;
        } else if (location === 'Optics' && k === 'head') {
          slots[k][layer] = armorData;
        } else if (location === 'Arms' && k.toLowerCase().includes('arm')) {
          slots[k][layer] = armorData;
        } else if (location === 'Legs' && (k.toLowerCase().includes('leg') || k === 'chassis' || k === 'thruster')) {
          slots[k][layer] = armorData;
        } else if (location === 'Thruster' && k === 'thruster') {
          slots[k][layer] = armorData;
        }
      }
      continue;
    }

    // Модули
    if (itype === 'module') {
      modules.push(item);
      continue;
    }

    // Всё остальное → инвентарь
    if (itype !== 'robotPart') {
      inventoryItems.push(item);
    }
  }

  // Автозаполнение недостающих конечностей
  const { heads = [], bodies = [], legs = [] } = robotCatalog;

  const defaultHead = heads.find(h => h.defaultForBodyPlan === bodyPlan);
  const defaultBody = bodies.find(b => b.robotBodyPlan === bodyPlan);
  const defaultLeg = legs.find(l => 
    l.compatibleBodyPlans?.includes(bodyPlan) || l.defaultForBodyPlan === bodyPlan
  );

  for (const k of slotKeys) {
    if (slots[k].limb !== null) continue;

    if (k === 'head' && defaultHead) {
      // Resolve builtinWeaponId for the default head (e.g. robobrain mesmetron)
      let headLimb = defaultHead;
      if (defaultHead.builtinWeaponId && (!Array.isArray(defaultHead.builtinWeapons) || defaultHead.builtinWeapons.length === 0)) {
        const weaponStats = resolveWeaponStats(defaultHead.builtinWeaponId);
        if (weaponStats) {
          headLimb = { ...defaultHead, builtinWeapons: [{ ...weaponStats, isBuiltin: true }] };
        }
      }
      slots[k].limb = headLimb;
    } else if (k === 'body' && defaultBody) {
      slots[k].limb = defaultBody;
    } else if (
      (k.toLowerCase().includes('leg') || k === 'chassis' || k === 'thruster') &&
      defaultLeg
    ) {
      slots[k].limb = defaultLeg;
    }
  }

  // Собираем оружия
  const weapons = getBuiltinWeaponsFromSlots(slots);

  return { slots, weapons, modules, inventoryItems };
}

// ---------------------------------------------------------------------------
// getBuiltinWeaponsFromSlots
// ---------------------------------------------------------------------------

/**
 * Builds the equippedWeapons array from the current robot slot state.
 * Sources:
 *  - limb.builtinWeapons  → встроенные оружия
 *  - slot.heldWeapon      → оружие в руке
 *
 * @param {object} slots - RobotSlotsObject
 * @returns {object[]}
 */
export function getBuiltinWeaponsFromSlots(slots) {
  if (!slots || typeof slots !== 'object') return [];

  const weapons = [];

  for (const [slotKey, slotData] of Object.entries(slots)) {
    if (!slotData) continue;
    const { limb, heldWeapon } = slotData;

    // Встроенные оружия конечности
    if (limb?.builtinWeapons) {
      limb.builtinWeapons.forEach(weapon => {
        weapons.push({
          ...weapon,
          sourceSlot: slotKey,
          sourceLimb: limb.id,
          isBuiltin: true,
          ...(limb._builtinWeapon ?? {}),
        });
      });
    }

    // Оружие в руке
    if (heldWeapon) {
      weapons.push({
        ...heldWeapon,
        sourceSlot: slotKey,
      });
    }
  }

  return weapons;
}

// ---------------------------------------------------------------------------
// canEquipRobotArmor
// ---------------------------------------------------------------------------

/**
 * Checks whether an armor item can be equipped in the given layer of a slot.
 * Uses armorItem.incompatibleLayers to detect conflicts with existing layers.
 *
 * @param {object} armorItem - { incompatibleLayers?: string[], layer?: string }
 * @param {string} slotKey
 * @param {string} layer - 'plating' | 'armor' | 'frame'
 * @param {object} slots - RobotSlotsObject
 * @returns {{ allowed: boolean, reason: string | null }}
 */
export function canEquipRobotArmor(armorItem, slotKey, layer, slots) {
  const slotData = slots?.[slotKey];
  if (!slotData) {
    return { allowed: false, reason: 'equip.error.invalidSlot' };
  }

  const incompatible = armorItem?.incompatibleLayers ?? [];

  for (const blockedLayer of incompatible) {
    if (slotData[blockedLayer] != null) {
      return {
        allowed: false,
        reason: 'equip.error.armorLayerIncompatible',
      };
    }
  }

  // Also check: if the slot already has this layer occupied, it will be replaced (allowed)
  return { allowed: true, reason: null };
}

// ---------------------------------------------------------------------------
// canReplaceLimb
// ---------------------------------------------------------------------------

/**
 * Checks whether a new limb can be placed in the given slot.
 * Validates compatibleBodyPlans / defaultForBodyPlan against the character's body plan.
 *
 * @param {string} slotKey
 * @param {object} newLimb - { compatibleBodyPlans?: string[], defaultForBodyPlan?: string }
 * @param {object} character - { origin: { robotBodyPlan } }
 * @returns {{ allowed: boolean, reason: string | null }}
 */
export function canReplaceLimb(slotKey, newLimb, character) {
  if (!newLimb) {
    return { allowed: false, reason: 'equip.error.noLimb' };
  }

  const bodyPlan = character?.origin?.robotBodyPlan;

  const compatiblePlans = newLimb.compatibleBodyPlans;
  const defaultPlan = newLimb.defaultForBodyPlan;

  // If the limb declares compatibility constraints, enforce them
  if (compatiblePlans && Array.isArray(compatiblePlans)) {
    if (!compatiblePlans.includes(bodyPlan)) {
      return { allowed: false, reason: 'equip.error.limbIncompatibleBodyPlan' };
    }
  } else if (defaultPlan && defaultPlan !== bodyPlan) {
    return { allowed: false, reason: 'equip.error.limbIncompatibleBodyPlan' };
  }

  return { allowed: true, reason: null };
}

// ---------------------------------------------------------------------------
// applyLimbReplacement
// ---------------------------------------------------------------------------

/**
 * Replaces the limb in a slot and rebuilds the weapons array.
 * The old limb's built-in weapons are removed; held weapons are kept if compatible.
 *
 * @param {object} slots   - RobotSlotsObject
 * @param {string} slotKey
 * @param {object} newLimb
 * @returns {{ slots: object, weapons: object[] }}
 */
export function applyLimbReplacement(slots, slotKey, newLimb, weaponsCatalog = []) {
  // If the new limb has a builtinWeaponId that hasn't been resolved yet,
  // normalize it so that getBuiltinWeaponsFromSlots can produce attack cards.
  let normalizedLimb = newLimb;
  if (
    newLimb &&
    (!Array.isArray(newLimb.builtinWeapons) || newLimb.builtinWeapons.length === 0) &&
    newLimb.builtinWeaponId
  ) {
    if (newLimb.itemType === 'robotArm') {
      normalizedLimb = buildArmLimb(newLimb, weaponsCatalog);
    } else {
      const weaponStats = weaponsCatalog.find(w => w.id === newLimb.builtinWeaponId) || null;
      if (weaponStats) {
        normalizedLimb = { ...newLimb, builtinWeapons: [{ ...weaponStats, isBuiltin: true }] };
      }
    }
  }

  const updatedSlots = {
    ...slots,
    [slotKey]: {
      ...slots[slotKey],
      limb: normalizedLimb,
      // Keep held weapon if the new limb can hold weapons; otherwise clear it
      heldWeapon:
        normalizedLimb?.canHoldWeapons ? (slots[slotKey]?.heldWeapon ?? null) : null,
    },
  };

  const weapons = getBuiltinWeaponsFromSlots(updatedSlots);
  return { slots: updatedSlots, weapons };
}

// ---------------------------------------------------------------------------
// canEquipWeaponToSlot
// ---------------------------------------------------------------------------

/**
 * Checks whether a weapon can be held by the given slot's limb.
 * Validates weight limit and two-handed restrictions.
 *
 * @param {object} weapon   - { weight?: number, twoHanded?: boolean }
 * @param {object} slotData - { limb: { canHoldWeapons, maxHandelWeaponWeight, excludeTwoHanded } }
 * @param {object} _character - reserved for future use
 * @returns {{ allowed: boolean, reason: string | null }}
 */
export function canEquipWeaponToSlot(weapon, slotData, _character) {
  const limb = slotData?.limb;

  const hasFreeWeaponSlot = (limb?.weaponSlots ?? (limb?.canHoldWeapons ? 1 : 0)) > 0;
  if (!hasFreeWeaponSlot) {
    return { allowed: false, reason: 'equip.error.limbCannotHoldWeapons' };
  }

  const maxWeight = limb.maxHandelWeaponWeight;
  if (maxWeight != null && (weapon?.weight ?? 0) > maxWeight) {
    return { allowed: false, reason: 'equip.error.weaponTooHeavyForLimb' };
  }

  if (limb.excludeTwoHanded && weapon?.twoHanded) {
    return { allowed: false, reason: 'equip.error.limbExcludesTwoHandedWeapons' };
  }

  return { allowed: true, reason: null };
}
