// src/lootTrade/grantCharacterItems.js
// Применение полученной добычи из контейнера Мастера и завершённых сделок
// с торговцем Мастера к активному персонажу игрока в characterStore.
//
// Соблюдает все каноны инвентаря:
// - поисковые перки («Халявщик», «Кладоискатель», «Фармацевт», «Мясник»,
//   «Консервный нож») крутятся поверх базовой добычи ящика (source === 'loot');
// - у торговца (source === 'buy') новое снаряжение при «Произвольном качестве»
//   имеет прочность 100%, а перекупленное б/у сохраняет свою прочность/моды;
// - списание проданных предметов идёт через adjustItemQuantity (закон 344 —
//   установленные моды уходят вместе с проданным оружием/бронёй).

import useCharacterStore from '../store/characterStore';
import { selectItemsByEquipped } from '../store/selectors';
import useAppSettingsStore, {
  selectRandomWeaponQualityEnabled,
} from '../store/appSettingsStore';
import { getEquipmentCatalog } from '../../i18n/equipmentCatalog';
import { getCurrentModuleLocale } from '../../i18n/locale';
import { resolveItem, findCatalogEntry, getItemPrice, getItemWeight } from '../../domain/resolveItem';
import { generateStackKey, getItemId } from '../../domain/itemIdentity';
import {
  isFusionCoreItem,
  fusionCoreStackKey,
  isPowerArmorFrame,
  powerArmorPieceStackKey,
  powerArmorFrameStackKey,
  rollNewFusionCoreCharges,
} from '../../domain/powerArmor';
import { getPowerArmorData } from '../../domain/registry';
import { isAmmoWeapon, rollWeaponDurability } from '../../domain/weaponDurability';
import {
  pickRandomItem,
  rollFoundItemBonuses,
  sumFoundItemBonus,
} from '../../domain/foundItemBonus';
import { getPerkDisplay } from '../../modules/fallout/screens/PerksAndTraitsScreen/perksDisplay';
import {
  formatInventoryText,
  tInventory,
} from '../../components/screens/InventoryScreen/logic/inventoryI18n';
import { showRawAlert } from '../../components/alerts/alertService';

const getPaCatalogById = () => Object.fromEntries(
  Object.values(getPowerArmorData() || {})
    .flatMap((set) => set?.pieces || [])
    .map((piece) => [piece.id, piece]),
);

export const inferStoreItemType = (item) => {
  if (item?.itemType === 'chems') return 'chem';
  if (item?.itemType) return item.itemType;
  if (item?.effectType || item?.durationInScenes || item?.duration || item?.positiveEffect) return 'chem';
  if (item?.type === 'ammo') return 'ammo';
  if (item?.weaponId || item?.damage !== undefined) return 'weapon';
  if (item?.clothingType) return 'clothing';
  if (item?.protectedAreas) return 'armor';
  return 'misc';
};

const getModsSignature = (item) => {
  const applied = item?.appliedMods || {};
  const modIds = Object.values(applied).filter(Boolean).sort();
  return modIds.length ? modIds.join('|') : 'none';
};

const getUiStackKey = (item) => {
  if (isFusionCoreItem(item)) return fusionCoreStackKey(item.charges);
  if (item?.itemType === 'powerArmor') {
    const catalogId = item.weaponId || item.id;
    if (isPowerArmorFrame(item)) {
      return powerArmorFrameStackKey({ ...item, id: catalogId });
    }
    return powerArmorPieceStackKey({
      catalogId,
      appliedMods: item.appliedMods || {},
      hpCurrent: item.hpCurrent,
    });
  }
  const itemType = inferStoreItemType(item);
  const catalogId = item?.id || item?.weaponId || item?.itemId || item?.armorId || item?.clothingId || item?.code || '';
  if (itemType === 'weapon') {
    const storeKey = item?.stackKey || generateStackKey(
      item?.weaponId || item?.id || item?.name || '',
      item?.appliedMods,
      item?.baseName,
      item?.durabilityTracked ? item?.durability : undefined,
      item?.uniqQualities,
    );
    return `weapon:${storeKey}:mods:${getModsSignature(item)}`;
  }
  return `${itemType}:${catalogId}`;
};

const findUnequippedByStackKey = (stackKey) => {
  if (!stackKey) return undefined;
  const unequipped = selectItemsByEquipped(
    { items: useCharacterStore.getState().items },
    false,
  );
  const direct = unequipped.find((item) => (item.stackKey || item.id) === stackKey);
  if (direct) return direct;
  const match = String(stackKey).match(/^[^:]+:(.+?):mods:/);
  const catalogId = match ? match[1] : null;
  if (!catalogId) return undefined;
  const byStackKey = unequipped.find((item) => item.stackKey === catalogId && !item.equipped);
  if (byStackKey) return byStackKey;
  return unequipped.find(
    (item) => (item.weaponId || item.id) === catalogId && !item.equipped,
  );
};

const formatBonusLine = (event) => {
  if (!event?.amount || event.extraRandom) return null;
  let perkName = event.perkId;
  try {
    perkName = getPerkDisplay({ id: event.perkId })?.name || event.perkId;
  } catch {
    perkName = event.perkId;
  }
  const itemLabel = Object.hasOwn(event, 'itemName')
    ? event.itemName
    : tInventory(`screen.foundItemTypes.${event.itemType}`);
  return formatInventoryText(tInventory('screen.alerts.foundItemBonus'), {
    perkName,
    amount: event.amount,
    itemType: itemLabel,
  });
};

const addResolvedItemToStore = (rawItem, quantity = 1, source = 'loot', bonusMessages = []) => {
  const catalog = getEquipmentCatalog(getCurrentModuleLocale());
  const localizedItem = resolveItem(rawItem, catalog);
  const itemType = inferStoreItemType(localizedItem);
  const storeState = useCharacterStore.getState();
  const storePerkBonuses = storeState.perkBonuses;
  const randomWeaponQualityEnabled = selectRandomWeaponQualityEnabled(useAppSettingsStore.getState());

  const bonusEvents = source === 'loot' && !isFusionCoreItem(localizedItem)
    ? rollFoundItemBonuses(storePerkBonuses, itemType, localizedItem)
    : [];
  const finalQuantity = Math.max(0, Math.floor(Number(quantity) || 0) + sumFoundItemBonus(bonusEvents));

  const collectAlerts = (events) => {
    (events || []).forEach((ev) => {
      if (ev?.extraRandom) {
        const extraCatalog = (ev.itemType === 'chem' || ev.itemType === 'chems') ? (catalog?.chems || []) : [];
        const count = Number(ev.amount) || 0;
        for (let i = 0; i < count && extraCatalog.length > 0; i += 1) {
          const picked = pickRandomItem(extraCatalog);
          addResolvedItemToStore({ ...picked, itemType: 'chem' }, 1, 'perkBonus', bonusMessages);
          const line = formatBonusLine({
            perkId: ev.perkId,
            itemType: ev.itemType,
            amount: 1,
            itemName: picked.name,
          });
          if (line) bonusMessages.push(line);
        }
        return;
      }
      const line = formatBonusLine(ev);
      if (line) bonusMessages.push(line);
    });
  };

  if (finalQuantity <= 0) {
    collectAlerts(bonusEvents);
    return;
  }

  // 1. Ядерный Блок
  if (isFusionCoreItem(localizedItem)) {
    const explicitCharges = Number(localizedItem.charges);
    const hasExplicitCharges = Number.isFinite(explicitCharges) && explicitCharges > 0;
    for (let i = 0; i < finalQuantity; i += 1) {
      const fcBonus = Number(storePerkBonuses?.fusionCoreChargeBonus) || 0;
      const charges = hasExplicitCharges
        ? explicitCharges
        : rollNewFusionCoreCharges(localizedItem.maxCharges, fcBonus);
      const stackKey = fusionCoreStackKey(charges);
      const existing = findUnequippedByStackKey(stackKey);
      if (existing) {
        useCharacterStore.getState().adjustItemQuantity(existing.id, 1);
      } else {
        useCharacterStore.getState().addNewItem({
          ...localizedItem,
          itemType: 'ammo',
          quantity: 1,
          charges,
          stackKey,
          uniqueId: stackKey,
        });
      }
    }
    collectAlerts(bonusEvents);
    return;
  }

  // 2. Силовая броня
  if (itemType === 'powerArmor') {
    const paCatalog = getPaCatalogById();
    const catalogId = localizedItem.weaponId || localizedItem.id;
    const prepared = isPowerArmorFrame(localizedItem)
      ? {
          ...localizedItem,
          id: catalogId,
          appliedMods: localizedItem.appliedMods || {},
          installedPieces: localizedItem.installedPieces || {
            head: null,
            body: null,
            hands: null,
            legs: null,
          },
          installedCore: localizedItem.installedCore ?? null,
        }
      : {
          ...localizedItem,
          id: catalogId,
          appliedMods: localizedItem.appliedMods || {},
          hpCurrent: localizedItem.hpCurrent ?? paCatalog[catalogId]?.hp,
        };
    const stackKey = getUiStackKey({ ...prepared, itemType: 'powerArmor' });
    const existing = findUnequippedByStackKey(stackKey);
    if (existing) {
      useCharacterStore.getState().adjustItemQuantity(existing.id, finalQuantity);
    } else {
      useCharacterStore.getState().addNewItem({
        ...prepared,
        itemType: 'powerArmor',
        quantity: finalQuantity,
        stackKey,
        uniqueId: stackKey,
      });
    }
    collectAlerts(bonusEvents);
    return;
  }

  // 3. Оружие/броня с индивидуальной прочностью (если не перекуплен готовый экземпляр с прочностью)
  const hasPreservedDurability = Boolean(
    localizedItem.durabilityTracked && Number.isFinite(Number(localizedItem.durability)),
  );
  if (
    !hasPreservedDurability
    && randomWeaponQualityEnabled
    && (itemType === 'weapon' || itemType === 'armor')
    && (itemType === 'armor' || isAmmoWeapon(localizedItem))
  ) {
    for (let i = 0; i < finalQuantity; i += 1) {
      const durability = source === 'buy' ? 100 : rollWeaponDurability();
      useCharacterStore.getState().addNewItem({
        ...localizedItem,
        itemType,
        quantity: 1,
        durabilityTracked: true,
        durability,
        durabilityAmmoRemainder: 0,
        durabilityWearRemainder: 0,
      });
    }
    collectAlerts(bonusEvents);
    return;
  }

  // 4. Обычная стопка (включая перекупленный экземпляр с модами/прочностью)
  const itemForStore = {
    ...localizedItem,
    itemType,
  };
  const stackKey = getUiStackKey(itemForStore);
  const existing = findUnequippedByStackKey(stackKey);
  if (existing && !itemForStore.appliedMods && !hasPreservedDurability) {
    useCharacterStore.getState().adjustItemQuantity(existing.id, finalQuantity);
  } else {
    useCharacterStore.getState().addNewItem({
      ...itemForStore,
      quantity: finalQuantity,
    });
  }
  collectAlerts(bonusEvents);
};

const buildRawItemFromContainerEntry = (entry) => {
  const snapshot = entry?.itemSnapshot && typeof entry.itemSnapshot === 'object'
    ? { ...entry.itemSnapshot }
    : {};
  const catalogId = snapshot.weaponId || snapshot.id || entry.itemId;
  return {
    ...snapshot,
    id: catalogId,
    weaponId: snapshot.weaponId || catalogId,
    itemType: entry.itemType || snapshot.itemType || 'misc',
    name: entry.name || snapshot.name,
    cost: Number(entry.cost ?? snapshot.cost ?? 0) || 0,
    weight: Number(entry.weight ?? snapshot.weight ?? 0) || 0,
    equipped: false,
    locked: false,
  };
};

/**
 * Начисляет персонажу игрока предметы и крышки, взятые из контейнера добычи,
 * с автоприменением поисковых перков поверх базового содержимого Мастера.
 */
export const grantLootEntriesToCharacter = (grantedEntries = []) => {
  const bonusMessages = [];
  let addedCaps = 0;
  const storeState = useCharacterStore.getState();

  for (const entry of grantedEntries) {
    if (!entry || Number(entry.quantity) <= 0) continue;
    if (entry.itemType === 'caps' || entry.itemId === 'caps') {
      const capsBonusEvents = rollFoundItemBonuses(storeState.perkBonuses, 'caps');
      const totalCaps = Math.floor(Number(entry.quantity) || 0) + sumFoundItemBonus(capsBonusEvents);
      addedCaps += totalCaps;
      useCharacterStore.getState().earnCurrency(totalCaps);
      capsBonusEvents.forEach((ev) => {
        const line = formatBonusLine(ev);
        if (line) bonusMessages.push(line);
      });
      continue;
    }

    const rawItem = buildRawItemFromContainerEntry(entry);
    addResolvedItemToStore(rawItem, entry.quantity, 'loot', bonusMessages);
  }

  if (bonusMessages.length > 0) {
    showRawAlert({ title: bonusMessages.join('\n\n') });
  }

  return { addedCaps, bonusMessages };
};

/**
 * Проводит подтверждённую сервером сделку с торговцем в сторе персонажа игрока.
 */
export const applyCommittedMerchantTradeToCharacter = ({
  boughtEntries = [],
  soldItems = [],
  playerCapsDelta = 0,
} = {}) => {
  // 1. Списываем проданные предметы из инвентаря игрока
  for (const sold of soldItems) {
    if (!sold?.clientItemId || Number(sold.quantity) <= 0) continue;
    useCharacterStore.getState().adjustItemQuantity(sold.clientItemId, -Math.floor(Number(sold.quantity)));
  }

  // 2. Выдаём купленные у торговца товары (source = 'buy')
  for (const bought of boughtEntries) {
    if (!bought || Number(bought.quantity) <= 0) continue;
    const rawItem = buildRawItemFromContainerEntry(bought);
    if (Number.isFinite(Number(bought.unitPrice))) {
      rawItem.price = Number(bought.unitPrice);
    }
    addResolvedItemToStore(rawItem, bought.quantity, 'buy', []);
  }

  // 3. Обновляем крышки персонажа
  const delta = Math.round(Number(playerCapsDelta) || 0);
  if (delta > 0) {
    useCharacterStore.getState().earnCurrency(delta);
  } else if (delta < 0) {
    useCharacterStore.getState().spendCurrency(Math.abs(delta));
  }
};

/**
 * Возвращает список доступных к продаже неэкипированных предметов персонажа
 * с вычисленной базовой каталожной стоимостью и весом.
 */
export const getSellablePlayerInventoryItems = (storeItems, moduleLocale = getCurrentModuleLocale()) => {
  const catalog = getEquipmentCatalog(moduleLocale);
  const unequipped = selectItemsByEquipped({ items: storeItems || [] }, false);

  return unequipped
    .filter((item) => (
      item
      && !item.equipped
      && !item.locked
      && !item.isBuiltin
      && !item.isManipulator
      && (Number(item.quantity) || 0) > 0
    ))
    .map((item) => {
      const resolved = resolveItem(item, catalog);
      const catalogId = getItemId(resolved) || resolved.weaponId || resolved.id;
      const itemType = inferStoreItemType(resolved);
      let catalogEntry = null;
      try {
        catalogEntry = findCatalogEntry(catalog, catalogId, itemType);
      } catch {
        catalogEntry = null;
      }
      const catalogCost = Number(catalogEntry?.cost ?? resolved?.cost ?? item?.cost ?? item?.price ?? 0) || 0;
      const weight = getItemWeight(resolved) || 0;
      const cleanSnapshot = {
        ...item,
        id: catalogId || item.id,
        weaponId: item.weaponId || catalogId || item.id,
        itemType,
        cost: catalogCost,
        weight,
        equipped: false,
        locked: false,
      };
      delete cleanSnapshot.uniqueId;

      return {
        id: String(item.id),
        catalogId: String(catalogId || item.id),
        itemType,
        name: resolved?.name || item?.name || catalogId || '—',
        quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)),
        cost: catalogCost,
        price: getItemPrice(resolved) || catalogCost,
        weight,
        durability: item.durabilityTracked ? item.durability : null,
        charges: isFusionCoreItem(item) ? item.charges : null,
        itemSnapshot: cleanSnapshot,
      };
    });
};
