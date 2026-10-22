import { canEquipFalloutWeapon } from '../logic/equipEligibility.js';
import { isRobotCharacter } from '../logic/originTypes.js';
import { formatInventoryText, tInventory } from 'engine:components/screens/InventoryScreen/logic/inventoryI18n';

const toWeight = (value) => parseFloat(String(value ?? 0).replace(',', '.')) || 0;

const showInventoryAlert = (context, titleKey, messageKey, params) => {
  const translate = context.translate ?? tInventory;
  const format = context.format ?? formatInventoryText;
  const title = translate(titleKey);
  const messageTemplate = translate(messageKey);
  context.showAlert?.(
    title,
    params ? format(messageTemplate, params) : messageTemplate,
  );
};

const returnWeaponToInventory = (weapon, context) => {
  const stackKey = weapon.stackKey || context.getStackKey(weapon);
  const stackMate = context.findUnequippedStoreItemByStackKey(stackKey);
  if (stackMate) {
    context.adjustStoreItemQuantity(stackMate.id, 1);
    return;
  }
  context.addNewItem({
    ...context.flattenStoreItemParams(weapon),
    itemType: context.getItemTypeId('weapon'),
    stackKey,
    equipped: false,
    quantity: 1,
  });
};

/** Handle Fallout-only robot weapon installation. Non-robot weapons fall back to the engine flow. */
export const handleFalloutRobotWeaponEquip = (weaponToEquip, context = {}) => {
  const displayWeapon = weaponToEquip;
  const character = { origin: context.origin, trait: context.trait };
  const weaponCheck = canEquipFalloutWeapon(displayWeapon, character);
  if (!weaponCheck.allowed) {
    if (weaponCheck.reason === 'equip.error.robotOnlyWeapon') {
      showInventoryAlert(context, 'screen.alerts.robotOnlyWeaponTitle', 'screen.alerts.robotOnlyWeaponMessage');
    } else if (weaponCheck.reason === 'equip.error.robotCannotUseStandardWeapon') {
      showInventoryAlert(context, 'screen.alerts.robotArmorOnlyTitle', 'screen.alerts.robotArmorOnlyMessage');
    } else {
      showInventoryAlert(context, 'screen.alerts.robotOnlyWeaponTitle', 'screen.alerts.robotOnlyWeaponMessage');
    }
    return { handled: true };
  }

  const capability = context.capability ?? {};
  const isRobot = capability.isApplicableCharacter?.(character) ?? isRobotCharacter(character);
  if (!isRobot) return { handled: false };

  const bodyConfiguration = capability.getBodyConfiguration?.(
    context.origin,
    context.inventoryItems,
    context.equipmentCatalog,
  ) ?? { bodyPlan: null, upgrade: null };
  const bodyPlan = bodyConfiguration.bodyPlan;
  const bodyUpgrade = bodyConfiguration.upgrade;
  const robotState = context.equipmentState ?? {};
  const slots = robotState.slots ?? {};
  const isRobotOnlyItem = capability.isRobotOnlyItem?.(displayWeapon, context.equipmentCatalog) ?? false;
  const armDef = capability.getArmForWeapon?.(displayWeapon, context.equipmentCatalog) ?? null;

  if (isRobotOnlyItem && Array.isArray(bodyUpgrade?.allowedRobotWeaponIds)) {
    const allowedWeaponIds = bodyUpgrade.allowedRobotWeaponIds;
    if (displayWeapon?.id && !allowedWeaponIds.includes(displayWeapon.id)) {
      showInventoryAlert(
        context,
        'screen.alerts.robotBodyWeaponMismatchTitle',
        'screen.alerts.robotBodyWeaponMismatchMessage',
      );
      return { handled: true };
    }
  }

  if (armDef) {
    const slotKeys = Object.keys(slots);
    if (capability.isArmAttachment?.(displayWeapon)) {
      const armEntries = slotKeys
        .map((key) => [key, slots[key]])
        .filter(([, slotData]) => slotData?.limb?.canHoldWeapons === true);
      if (armEntries.length === 0) {
        showInventoryAlert(context, 'screen.alerts.robotArmRequiredTitle', 'screen.alerts.robotArmRequiredMessage');
        return { handled: true };
      }

      let target = armEntries.find(([, slotData]) => slotData?.heldWeapon == null);
      let replaced = null;
      if (!target) {
        for (const entry of armEntries) {
          const check = capability.canReplaceArmWeapon?.(entry[1].heldWeapon, displayWeapon, {
            strict: Boolean(context.strictPartReplacement),
          }) ?? { allowed: false };
          if (check.allowed) {
            target = entry;
            replaced = entry[1].heldWeapon;
            break;
          }
        }
        if (!target) {
          showInventoryAlert(context, 'screen.alerts.armPartStrictTitle', 'screen.alerts.armPartStrictMessage');
          return { handled: true };
        }
      }

      const [targetKey] = target;
      const sourceStackKey = weaponToEquip.stackKey || context.getStackKey(displayWeapon);
      const totalOwned = context.findUnequippedStoreItemByStackKey(sourceStackKey)?.quantity || 0;
      if (totalOwned <= 0) {
        showInventoryAlert(context, 'screen.alerts.noItemsTitle', 'screen.alerts.noItemsMessage');
        return { handled: true };
      }
      const weaponEntry = {
        ...displayWeapon,
        itemType: context.getItemTypeId('weapon'),
        stackKey: sourceStackKey,
        uniqueId: displayWeapon.uniqueId || context.createWeaponInstanceId(),
        sourceSlot: targetKey,
      };
      context.setEquipmentSlots({
        ...slots,
        [targetKey]: { ...slots[targetKey], heldWeapon: weaponEntry },
      });
      if (replaced) returnWeaponToInventory(replaced, context);
      const storeItem = context.findUnequippedStoreItemByStackKey(sourceStackKey);
      if (storeItem) context.adjustStoreItemQuantity(storeItem.id, -1);
      return { handled: true };
    }

    const compatibleSlots = capability.slotsForLimbType?.(bodyPlan, armDef.limbType ?? 'arm') ?? [];
    const finalTargets = compatibleSlots.filter((key) => slotKeys.includes(key) && !slots[key]?.limb);
    if (finalTargets.length === 0) {
      showInventoryAlert(
        context,
        'screen.alerts.manipulatorRequiredTitle',
        'screen.alerts.robotNoHandlingLimbMessage',
      );
      return { handled: true };
    }

    const sourceStackKey = weaponToEquip.stackKey || context.getStackKey(displayWeapon);
    const totalOwned = context.findUnequippedStoreItemByStackKey(sourceStackKey)?.quantity || 0;
    if (totalOwned <= 0) {
      showInventoryAlert(context, 'screen.alerts.noItemsTitle', 'screen.alerts.noItemsMessage');
      return { handled: true };
    }

    const updatedSlots = { ...slots };
    const weaponLimb = {
      ...armDef,
      itemType: context.getItemTypeId('robotArm'),
      builtinWeaponId: armDef.builtinWeaponId || displayWeapon.id,
    };
    finalTargets.forEach((key) => {
      if (!updatedSlots[key]) return;
      updatedSlots[key] = { ...updatedSlots[key], limb: weaponLimb, heldWeapon: null };
    });
    context.setEquipmentSlots(updatedSlots);
    context.setEquippedWeapons(capability.getBuiltinWeaponsFromSlots?.(updatedSlots) ?? []);
    const storeItem = context.findUnequippedStoreItemByStackKey(sourceStackKey);
    if (storeItem) context.adjustStoreItemQuantity(storeItem.id, -1);
    return { handled: true };
  }

  if (!isRobotOnlyItem) {
    const occupiedSourceSlots = Object.values(slots)
      .filter((slotData) => slotData?.heldWeapon?.sourceSlot)
      .map((slotData) => slotData.heldWeapon.sourceSlot);
    const armWithHoldCapability = capability.findFreeWeaponHand?.(slots, occupiedSourceSlots) ?? null;
    if (!armWithHoldCapability) {
      showInventoryAlert(
        context,
        'screen.alerts.manipulatorRequiredTitle',
        'screen.alerts.robotNoHandlingLimbMessage',
      );
      return { handled: true };
    }

    const [armSlotKey, armSlotData] = armWithHoldCapability;
    const armLimb = armSlotData.limb;
    let replacedPalmItem = null;
    if (armSlotData?.heldWeapon) {
      const replaceCheck = capability.canReplaceArmWeapon?.(armSlotData.heldWeapon, displayWeapon, {
        strict: Boolean(context.strictPartReplacement),
      }) ?? { allowed: false };
      if (!replaceCheck.allowed) {
        showInventoryAlert(context, 'screen.alerts.armPartStrictTitle', 'screen.alerts.armPartStrictMessage');
        return { handled: true };
      }
      replacedPalmItem = armSlotData.heldWeapon;
    }

    const qualities = String(displayWeapon?.qualities || '').toLowerCase();
    const isTwoHandedWeapon = ['двуруч', 'two-handed', 'two handed'].some((token) => qualities.includes(token));
    const candidateWeight = toWeight(displayWeapon.weight);
    if (Boolean(armLimb?.excludeTwoHanded) && isTwoHandedWeapon) {
      showInventoryAlert(
        context,
        'screen.alerts.manipulatorWeightTitle',
        'screen.alerts.robotCannotUseTwoHandedMessage',
      );
      return { handled: true };
    }
    const maxWeightRaw = armLimb?.maxHandelWeaponWeight;
    if (maxWeightRaw !== null && maxWeightRaw !== undefined && maxWeightRaw !== '' && maxWeightRaw !== 'unlimited') {
      const maxHeldWeight = toWeight(maxWeightRaw);
      if (candidateWeight > maxHeldWeight) {
        showInventoryAlert(
          context,
          'screen.alerts.manipulatorWeightTitle',
          'screen.alerts.manipulatorWeightMessage',
          { maxHeldWeight },
        );
        return { handled: true };
      }
    }

    const sourceStackKey = weaponToEquip.stackKey || context.getStackKey(displayWeapon);
    const totalOwned = context.findUnequippedStoreItemByStackKey(sourceStackKey)?.quantity || 0;
    if (totalOwned <= 0) {
      showInventoryAlert(context, 'screen.alerts.noItemsTitle', 'screen.alerts.noItemsMessage');
      return { handled: true };
    }
    const weaponEntry = {
      ...displayWeapon,
      itemType: context.getItemTypeId('weapon'),
      stackKey: sourceStackKey,
      uniqueId: displayWeapon.uniqueId || context.createWeaponInstanceId(),
      sourceSlot: armSlotKey,
    };
    context.setEquipmentSlots({
      ...slots,
      [armSlotKey]: { ...slots[armSlotKey], heldWeapon: weaponEntry },
    });
    if (replacedPalmItem) returnWeaponToInventory(replacedPalmItem, context);
    const storeItem = context.findUnequippedStoreItemByStackKey(sourceStackKey);
    if (storeItem) context.adjustStoreItemQuantity(storeItem.id, -1);
    return { handled: true };
  }

  return { handled: true };
};
