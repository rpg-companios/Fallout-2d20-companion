import {
  FALLOUT_ITEM_TYPE_IDS,
  inferFalloutItemTypeFromId,
} from '../logic/itemType.js';
import {
  fusionCoreStackKey,
  isFalloutPowerArmorItem,
  isFusionCoreItem,
  isPowerArmorFrame,
  powerArmorFrameStackKey,
  powerArmorPieceStackKey,
  rollNewFusionCoreCharges,
} from '../logic/powerArmor.js';

const isFalloutPowerArmorItemType = (item) => (
  item?.itemType === FALLOUT_ITEM_TYPE_IDS.powerArmor
  || inferFalloutItemTypeFromId(item?.weaponId || item?.id) === FALLOUT_ITEM_TYPE_IDS.powerArmor
);

/** Fallout power armor/fusion-core item acquisition, including legacy save fields. */
export const initializeFalloutPowerArmorAcquisition = (
  item,
  { quantity = 1, perkBonuses = {}, getCatalogItemData } = {},
) => {
  if (isFusionCoreItem(item)) {
    const records = [];
    const count = Math.max(0, Number(quantity) || 0);
    for (let index = 0; index < count; index += 1) {
      const charges = rollNewFusionCoreCharges(
        item.maxCharges,
        Number(perkBonuses?.fusionCoreChargeBonus) || 0,
      );
      const stackKey = fusionCoreStackKey(charges);
      records.push({
        ...item,
        itemType: FALLOUT_ITEM_TYPE_IDS.ammo,
        quantity: 1,
        charges,
        stackKey,
        uniqueId: stackKey,
      });
    }
    return records;
  }

  if (!isFalloutPowerArmorItemType(item)) return null;

  const catalogId = item.weaponId || item.id;
  const prepared = isPowerArmorFrame(item)
    ? {
      ...item,
      appliedMods: item.appliedMods || {},
      installedPieces: { head: null, body: null, hands: null, legs: null },
      installedCore: null,
    }
    : {
      ...item,
      appliedMods: item.appliedMods || {},
      hpCurrent: item.hpCurrent ?? getCatalogItemData?.(item)?.hp,
    };
  const stackKey = isPowerArmorFrame(item)
    ? powerArmorFrameStackKey({ ...prepared, id: catalogId })
    : powerArmorPieceStackKey({
      catalogId,
      appliedMods: prepared.appliedMods,
      hpCurrent: prepared.hpCurrent,
    });

  return [{
    ...prepared,
    itemType: FALLOUT_ITEM_TYPE_IDS.powerArmor,
    quantity,
    stackKey,
    uniqueId: stackKey,
  }];
};

/** Fusion cores do not receive Fallout's found-item perk quantity bonuses. */
export const isFalloutLootBonusEligibleItem = (item) => !isFusionCoreItem(item);

export const getFalloutPowerArmorStackKey = (item) => {
  if (isFusionCoreItem(item)) return fusionCoreStackKey(item?.charges);
  if (!isFalloutPowerArmorItemType(item)) return null;

  const catalogId = item.weaponId || item.id;
  return isPowerArmorFrame(item)
    ? powerArmorFrameStackKey({ ...item, id: catalogId })
    : powerArmorPieceStackKey({
      catalogId,
      appliedMods: item.appliedMods || {},
      hpCurrent: item.hpCurrent,
    });
};

export const getFalloutPowerArmorInventoryItemPresentation = (item, getCatalogItemData) => {
  if (isFusionCoreItem(item)) {
    return {
      nameSuffix: item.charges != null ? ` (${item.charges}/${item.maxCharges})` : '',
    };
  }
  if (!isFalloutPowerArmorItemType(item) || isPowerArmorFrame(item)) return {};

  const maximum = getCatalogItemData?.(item)?.hp;
  if (!Number.isFinite(Number(maximum))) return {};
  const current = item.hpCurrent ?? Number(maximum);
  return {
    durability: { current, maximum: Number(maximum) },
    needsRepair: Number(current) < Number(maximum),
  };
};

export const isFalloutPackedPowerArmorItem = (item) => Boolean(
  isFalloutPowerArmorItemType(item) && item?.paContainer,
);

export const equipFalloutPowerArmorInventoryItem = (
  item,
  { equipPackage, equipPiece } = {},
) => {
  if (!isFalloutPowerArmorItem(item)) return false;
  if (isPowerArmorFrame(item)) equipPackage?.(item);
  else equipPiece?.(item);
  return true;
};
