import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, Image, SafeAreaView, FlatList, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import useCharacterStore from '../../../src/store/characterStore';
import { selectCarryWeight } from '../../../src/store/selectors';
import { selectItemsByEquipped } from '../../../src/store/selectors';
import { useShallow } from 'zustand/react/shallow';
import SellItemModal from './modals/SellItemModal';
import AddItemModal from './modals/AddItemModal';
import BuyItemModal from './modals/BuyItemModal';
// 413: ремонт по книге — модалка с тестом/материалами/донором (кнопки
// «Починить» больше не чинят мгновенно и бесплатно).
import { resolveTargetLayer, blocksArmorOver } from '../../../domain/equippedArmor';
// 404: «Заряжай и стреляй» — единая точка прибавки скорострельности.
import { getSettingService } from '../../../domain/registry';
import { formatInventoryText, tInventory } from './logic/inventoryI18n';
import { pickRandomItem } from '../../../domain/randomItem';
import { useLocale, useModuleLocale, useModuleCatalogRevision } from '../../../i18n/locale';
import { getEquipmentCatalog } from '../../../i18n/equipmentCatalog';
import { getItemId } from '../../../domain/itemIdentity';
import { resolveItem, inferItemType, getItemPrice, getItemWeight } from '../../../domain/resolveItem';
import { canConsumeOnSelf, canConsumeOnOther } from '../../../domain/itemfitRules';
import { showAlert as showCatalogAlert, showRawAlert, confirmAlert } from '../../alerts/alertService';
import { canEquipArmor, canEquipClothing, canEquipWeapon } from '../../../domain/equipEquip';
import styles from '../../../styles/InventoryScreen.styles';
import useAppSettingsStore from '../../../src/store/appSettingsStore';

const NO_DURABILITY_SETTINGS = Object.freeze({
  randomQualityEnabled: false,
  durabilityLossEnabled: false,
});
const selectNoDurabilitySettings = () => NO_DURABILITY_SETTINGS;
const selectNoCharacterEquipmentSettings = () => false;
const NO_SETTING_ACTION = () => undefined;

const flattenItemParams = (item, settingParameterFields = []) => {
  if (!item) return item;
  const flat = { ...item };
  [
    'damage',
    'fireRate',
    ...(Array.isArray(settingParameterFields)
      ? settingParameterFields.filter((field) => typeof field === 'string')
      : []),
  ].forEach((field) => {
    if (flat[field] && typeof flat[field] === 'object') {
      flat[field] = flat[field].total ?? flat[field].base;
    }
  });
  return flat;
};

const CurrencySection = ({ amount, onAdd, onSubtract, onCraft, currencyIcon, showCraft }) => (
  <View style={styles.currencyRow}>
    <View style={styles.currencyContainer}>
      {currencyIcon ? (
        <Image
          source={currencyIcon}
          style={styles.currencyIcon}
          resizeMode="contain"
        />
      ) : null}
      <TouchableOpacity style={styles.currencyButton} onPress={onSubtract}>
        <Text style={styles.currencyButtonText}>{tInventory('screen.currency.subtract')}</Text>
      </TouchableOpacity>
      <Text style={styles.currencyValue}>{amount}</Text>
      <TouchableOpacity style={styles.currencyButton} onPress={onAdd}>
        <Text style={styles.currencyButtonText}>{tInventory('screen.currency.add')}</Text>
      </TouchableOpacity>
    </View>
    {showCraft ? (
      <TouchableOpacity style={styles.craftButton} onPress={onCraft}>
        <MaterialCommunityIcons name="wrench" size={14} color="#fff" />
        <Text style={styles.craftButtonText}>{tInventory('screen.craft.label')}</Text>
      </TouchableOpacity>
    ) : null}
  </View>
);

const InventoryScreen = () => {
  const inventoryRuntime = getSettingService('inventory') ?? {};
  const flattenStoreItemParams = (item) => flattenItemParams(item, inventoryRuntime.itemParameterFields);
  const consumablesCapability = getSettingService('consumables') ?? {};
  const equipmentEligibilityRuntime = getSettingService('equipmentEligibility') ?? {};
  const inventoryFeatures = inventoryRuntime.features ?? {};
  const inventoryFeatureList = Object.values(inventoryFeatures);
  const getInventoryFeature = (predicate) => inventoryFeatureList.find(predicate) ?? null;
  const craftingFeature = inventoryFeatures.crafting ?? null;
  const repairFeature = inventoryFeatures.repair ?? null;
  const durabilityFeature = inventoryFeatures.durability ?? null;
  const structuredEquipmentFeature = getInventoryFeature((feature) => (
    typeof feature?.getInventoryRows === 'function'
    && typeof feature?.isInventoryRow === 'function'
    && typeof feature?.renderInventoryRow === 'function'
    && typeof feature?.getInventoryState === 'function'
  ));
  const characterEquipmentFeature = getInventoryFeature((feature) => (
    typeof feature?.getWeaponsForDisplay === 'function'
    && typeof feature?.handleWeaponEquip === 'function'
  ));
  const itemBreakdownFeature = inventoryFeatures.itemBreakdown ?? null;
  const itemRarityFeature = inventoryFeatures.itemRarity ?? null;
  const perkDisplayFeature = inventoryFeatures.perkDisplay ?? null;
  const lootBonusesFeature = inventoryFeatures.lootBonuses ?? null;
  const weaponPresentationFeature = inventoryFeatures.weaponPresentation ?? null;
  const consumablesFeature = inventoryFeatures.consumables ?? null;
  const CraftingModal = craftingFeature?.Modal;
  const RepairModal = repairFeature?.Modal;
  const currencyRuntime = inventoryRuntime.currency ?? {};
  const CurrencyModal = currencyRuntime.Modal;
  const currencyIcon = currencyRuntime.icon;
  const getItemTypeId = (role) => inventoryRuntime.itemTypeIds?.[role] ?? null;
  const getItemCapabilities = (item) => inventoryRuntime.classifyItem?.(item) ?? {};
  const isItemKind = (item, role) => {
    const capabilities = getItemCapabilities(item);
    if (Object.hasOwn(capabilities, role)) return Boolean(capabilities[role]);
    const typeId = getItemTypeId(role);
    return typeId !== null && item?.itemType === typeId;
  };

  // Деньги — стор напрямую (Шаг 8а, патч 241; поле в сторе с Шага 2).
  const currency = useCharacterStore((s) => s.currency);
  const earnCurrency = useCharacterStore((s) => s.earnCurrency);
  const spendCurrency = useCharacterStore((s) => s.spendCurrency);
  // Шаг 8а (патч 240): полный конвейер расходника — стор-экшен.
  const applyConsumableFull = useCharacterStore((s) => s.applyConsumableFull);
  // Шаг 8а (часть 3): комплект и модификации предметов — стор напрямую.
  const equipment = useCharacterStore((s) => s.equipment);
  const storeModifiedItems = useCharacterStore((s) => s.modifiedItems);
  const getSettingAction = useCharacterStore((s) => s.getSettingAction);
  const getFeatureAction = (feature, actionKey) => {
    const actionId = feature?.actionIds?.[actionKey];
    return feature?.id && typeof actionId === 'string'
      ? getSettingAction(feature.id, actionId)
      : NO_SETTING_ACTION;
  };
  // Read-хелпер альбома модификаций: с патча 237 альбом только читается
  // (поддержка старых сейвов); новые моды кладут id модов на сам предмет.
  const getModifiedItem = (item) => {
    const base = storeModifiedItems[getItemId(item)] || item;
    return weaponPresentationFeature?.getDisplayItem?.(base, storePerkBonuses) ?? base;
  };
  // Шаг 7: origin/trait — стор напрямую.
  // Optional equipment state and derived weight are exposed by capabilities.
  const characterEquipmentState = useCharacterStore((s) => characterEquipmentFeature?.getState?.(s) ?? null);
  const characterEquipmentSlots = characterEquipmentFeature?.getEquipmentSlots?.(characterEquipmentState) ?? null;
  const setCharacterEquipmentSlots = getFeatureAction(characterEquipmentFeature, 'setSlots');
  const carryWeight = useCharacterStore(selectCarryWeight);
  const trait = useCharacterStore((s) => s.trait);
  const origin = useCharacterStore((s) => s.origin);

  const storeItems = useCharacterStore((state) => state.items);
  // Generic worn-armor data is shared state; setting-owned gear is accessed
  // through the active inventory capabilities below.
  const equippedArmor = useCharacterStore((s) => s.equippedArmor);
  const setEquippedArmor = useCharacterStore((s) => s.setEquippedArmor);
  const structuredEquipmentState = useCharacterStore((s) => structuredEquipmentFeature?.getInventoryState?.(s) ?? null);
  // Надетое оружие (метаданные) — Шаг 3 миграции: напрямую из стора,
  // минуя фасад useCharacter().
  const equippedWeapons = useCharacterStore((s) => s.equippedWeapons);
  const setEquippedWeapons = useCharacterStore((s) => s.setEquippedWeapons);
  const inventoryItems = useMemo(() => selectItemsByEquipped({ items: storeItems }, false), [storeItems]);
  const storeEquippedWeapons = useMemo(() => selectItemsByEquipped({ items: storeItems }, true), [storeItems]);
  const equipItem = useCharacterStore((state) => state.equipItem);
  const unequipItem = useCharacterStore((state) => state.unequipItem);
  const addNewItem = useCharacterStore((state) => state.addNewItem);
  const updateItem = useCharacterStore((state) => state.updateItem);
  const storePerkBonuses = useCharacterStore((state) => state.perkBonuses);
  const [repairTarget, setRepairTarget] = useState(null);
  // The optional repair feature declares which character data affects its row actions.
  useCharacterStore((state) => repairFeature?.selectInventoryDependency?.(state) ?? null);
  // Optional setting feature: if absent, the engine does not subscribe to or
  // display durability fields. The setting supplies its own preferences selector.
  const durabilitySettings = useAppSettingsStore(useShallow(
    durabilityFeature?.selectSettings ?? selectNoDurabilitySettings,
  ));
  const characterEquipmentSettings = useAppSettingsStore(useShallow(
    characterEquipmentFeature?.selectSettings ?? selectNoCharacterEquipmentSettings,
  ));
  const strictEquipmentPartReplacement = Boolean(characterEquipmentSettings);
  const findUnequippedStoreItemByStackKey = useCallback((stackKey) => {
    if (!stackKey) return undefined;
    const direct = inventoryItems.find((item) => (item.stackKey || item.id) === stackKey);
    if (direct) return direct;
    return inventoryRuntime.findUnequippedByDisplayStackKey?.(inventoryItems, stackKey);
  }, [inventoryItems, inventoryRuntime]);

  const adjustStoreItemQuantity = useCallback((itemId, delta) => {
    // 344: количество меняет СТОР (adjustItemQuantity) — удаление при нуле
    // уводит установленные моды вместе с предметом (правило в одной копии).
    useCharacterStore.getState().adjustItemQuantity(itemId, delta);
  }, []);

  const equipWeaponInStore = useCallback((displayWeapon, sourceStackKey) => {
    const storeItem = findUnequippedStoreItemByStackKey(sourceStackKey);
    if (!storeItem) return false;

    if ((storeItem.quantity || 1) > 1) {
      adjustStoreItemQuantity(storeItem.id, -1);
      addNewItem({
        ...flattenStoreItemParams(displayWeapon),
        itemType: getItemTypeId('weapon'),
        stackKey: sourceStackKey,
        equipped: true,
        quantity: 1,
        uniqueId: displayWeapon.uniqueId || createWeaponInstanceId(),
      });
    } else {
      equipItem(storeItem.id);
    }
    return true;
  }, [findUnequippedStoreItemByStackKey, adjustStoreItemQuantity, addNewItem, equipItem]);

  // Optional equipment row projections come from the active capability.
  // Declared before equippedWeaponsForDisplay because that memo consumes it.
  const isCompatibleCharacter = characterEquipmentFeature?.isApplicableCharacter?.({ origin, trait }) ?? false;
  // Персонаж для правил fitProfile (характерType + origin). Профиль берётся из
  // characterType (или origin.fitProfile — полный override).
  const fitCharacter = { origin, trait };

  const equippedWeaponsForDisplay = useMemo(() => {
    const fromStore = storeEquippedWeapons.map(flattenItemParams);
    const settingWeaponRows = characterEquipmentFeature?.getWeaponsForDisplay?.({
      isCompatibleCharacter,
      slots: characterEquipmentSlots || {},
      equippedWeapons: equippedWeapons || [],
    }) ?? (equippedWeapons || []);
    const storeKeys = new Set(fromStore.map((w) => w.uniqueId || w.id || w.stackKey));
    const extras = settingWeaponRows.filter((w) => !storeKeys.has(w.uniqueId || w.id || w.stackKey));
    return [...fromStore, ...extras];
  }, [storeEquippedWeapons, equippedWeapons, isCompatibleCharacter, characterEquipmentSlots, characterEquipmentFeature]);

  // Показ через общий AlertHost — одинаково на вебе и на нативе.
  // Раньше здесь была локальная копия развилки Platform.OS с window.alert,
  // из-за которой на вебе терялись все кнопки кроме первой.
  const showAlert = (title, message = '', buttons) => showRawAlert({ title, message, buttons });
  const showEquipmentEligibilityAlert = (kind, reason) => {
    const alert = equipmentEligibilityRuntime.getAlert?.(kind, reason);
    if (alert) showAlert(alert.title, alert.message);
    else showAlert('', tInventory('screen.alerts.cannotEquipItem'));
  };

  const [isCurrencyModalVisible, setIsCurrencyModalVisible] = useState(false);
  const [currencyOperationType, setCurrencyOperationType] = useState('add');
  const [isSellModalVisible, setIsSellModalVisible] = useState(false);
  const [selectedItemForSale, setSelectedItemForSale] = useState(null);
  const [isAddItemModalVisible, setAddItemModalVisible] = useState(false);
  const [isCraftModalVisible, setCraftModalVisible] = useState(false);
  const [itemSelectionMode, setItemSelectionMode] = useState('loot');
  const [isBuyItemModalVisible, setIsBuyItemModalVisible] = useState(false);
  const [selectedItemForBuy, setSelectedItemForBuy] = useState(null);
  // Optional structured rows may expose an expandable inventory container.
  const [structuredContentsExpanded, setStructuredContentsExpanded] = useState(false);

  useLocale();
  const moduleLocale = useModuleLocale();
  const catalogRevision = useModuleCatalogRevision();
  const equipmentCatalog = useMemo(() => getEquipmentCatalog(moduleLocale), [moduleLocale, catalogRevision]);
  // Read setting data after activation rather than snapshotting package data at
  // module import time; the same engine screen can serve a different package.
  const getItemName = (item) => item?.name || item?.id || '';
  const getItemCatalogId = (item) => inventoryRuntime.getItemCatalogId?.(item) ?? item?.catalogId ?? item?.id ?? '';
  const getItemType = (item) => inferItemType(item);
  const isWeaponItem = (item) => isItemKind(item, 'weapon');
  const getStackKey = (item) => {
    const settingStackKey = structuredEquipmentFeature?.getStackKey?.(item);
    if (settingStackKey != null) return settingStackKey;
    const itemType = getItemType(item);
    if (isWeaponItem(item)) {
      return inventoryRuntime.getDisplayStackKey?.(item)
        ?? `${itemType}:${getItemCatalogId(item)}`;
    }
    return `${itemType}:${getItemCatalogId(item)}`;
  };
  const createWeaponInstanceId = () => `weapon-instance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const createArmorInstanceId = () => `armor-instance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const getArmorInstanceKey = (item, slot, type) =>
    item?.equipInstanceId || `${type || item?.itemType || getItemTypeId('armor')}:${item?.stackKey || getStackKey(item)}:${slot}`;
  const getItemTypeIcon = (itemType) => inventoryRuntime.getItemTypeIcon?.(itemType) ?? '📦';

  const isHiddenCharacterEquipmentItem = (item) => characterEquipmentFeature?.hideInventoryItem?.(item) ?? false;
  const isStructuredEquipmentItem = (item) => structuredEquipmentFeature?.handlesItem?.(item) ?? false;

  // Обогащение инстанса каталожными данными — единая точка (domain/resolveItem):
  // вес/цена/эффект/имя берутся из каталога по id. Локальной копии логики больше нет.
  const resolveLocalizedItem = (item) => resolveItem(item, equipmentCatalog);


  const handleOpenCurrencyModal = (type) => {
    setCurrencyOperationType(type);
    setIsCurrencyModalVisible(true);
  };

  // The active crafting capability owns the optional crafting dialog.
  const handleCraftPress = () => setCraftModalVisible(true);

  const showFoundItemBonusAlerts = (events) => {
    (events || []).forEach((event) => {
      if (!event?.amount || event.extraRandom) return;
      showAlert(formatInventoryText(tInventory('screen.alerts.foundItemBonus'), {
        perkName: perkDisplayFeature?.getForId?.({ id: event.perkId })?.name ?? event.perkId,
        amount: event.amount,
        itemType: Object.hasOwn(event, 'itemName')
          ? event.itemName
          : tInventory(`screen.foundItemTypes.${event.itemType}`),
      }));
    });
  };

  const extraRandomCatalogFor = (itemType) => {
    const settingCatalog = inventoryRuntime.getRandomLootCatalog?.(equipmentCatalog, itemType);
    if (Array.isArray(settingCatalog)) return settingCatalog;
    throw new Error(`[InventoryScreen] Нет каталога случайных предметов для типа ${itemType}`);
  };

  const finishLootBonuses = (events) => {
    (events || []).forEach((event) => {
      if (!event?.extraRandom) return;
      const count = Number(event.amount) || 0;
      const catalog = extraRandomCatalogFor(event.itemType);
      for (let i = 0; i < count; i += 1) {
        const picked = pickRandomItem(catalog);
        handleAddItem(picked, 1, 'perkBonus');
        showFoundItemBonusAlerts([{
          perkId: event.perkId,
          itemType: event.itemType,
          amount: 1,
          itemName: picked.name,
        }]);
      }
    });
    showFoundItemBonusAlerts(events);
  };

  const handleSaveCurrency = (amount) => {
    if (currencyOperationType === 'add') {
      const bonusTargetId = currencyRuntime.lootBonusTargetId;
      const bonusEvents = bonusTargetId
        ? (lootBonusesFeature?.roll?.(storePerkBonuses, bonusTargetId) ?? [])
        : [];
      earnCurrency(amount + (lootBonusesFeature?.sum?.(bonusEvents) ?? 0));
      showFoundItemBonusAlerts(bonusEvents);
      return;
    }
    spendCurrency(amount);
  };

  const handleApplyConsumable = (item) => {
    consumablesFeature?.useFromInventory?.({
      item,
      character: fitCharacter,
      getState: useCharacterStore.getState,
      applyConsumable: applyConsumableFull,
      removeItem: handleRemoveItem,
      getItemName,
      showAlert,
      showChoice: showCatalogAlert,
      consumablesCapability,
      inventoryFeature: consumablesFeature,
    });
  };
  
  const handleRemoveItem = (itemToRemove, quantity) => {
    const stackKey = itemToRemove.stackKey || getStackKey(itemToRemove);
    const storeItem = findUnequippedStoreItemByStackKey(stackKey)
      || inventoryItems.find((i) => (i.id || i.code) === (itemToRemove.id || itemToRemove.code));

    if (storeItem) {
      adjustStoreItemQuantity(storeItem.id, -quantity);
    }
  };

  const handleSellItem = (item) => {
    setSelectedItemForSale(item);
    setIsSellModalVisible(true);
  };

  const handleCharacterEquipmentAction = (item, action) => {
    const stackKey = item.stackKey || getStackKey(item);
    const storeItem = findUnequippedStoreItemByStackKey(stackKey);
    if (!storeItem) return;
    const result = characterEquipmentFeature?.runInventoryAction?.(action, {
      item,
      storeItemId: storeItem.id,
      dispatch: (featureId, actionId, ...args) => {
        const getAction = useCharacterStore.getState()?.getSettingAction;
        return typeof getAction === 'function'
          ? getAction(featureId, actionId)(...args)
          : undefined;
      },
    });
    if (result?.alert) showAlert(result.alert.title, result.alert.message);
  };

  const handleConfirmSale = (quantity, finalPrice) => {
    earnCurrency(finalPrice);

    const stackKey = selectedItemForSale?.stackKey || getStackKey(selectedItemForSale);
    const storeItem = findUnequippedStoreItemByStackKey(stackKey);
    if (storeItem) {
      adjustStoreItemQuantity(storeItem.id, -quantity);
    }

    setIsSellModalVisible(false);
    setSelectedItemForSale(null);
  };

  const handleAddItem = (item, quantity = 1, source = 'loot') => {
    const localizedItem = resolveLocalizedItem(item);
    const bonusEvents = source === 'loot'
      ? (lootBonusesFeature?.roll?.(storePerkBonuses, getItemType(localizedItem), localizedItem) ?? [])
      : [];
    quantity += (lootBonusesFeature?.sum?.(bonusEvents) ?? 0);

    const itemAcquisitions = structuredEquipmentFeature?.initializeAcquisition?.(localizedItem, {
      quantity,
      perkBonuses: storePerkBonuses,
    });
    if (Array.isArray(itemAcquisitions)) {
      for (const preparedItem of itemAcquisitions) {
        const stackKey = preparedItem.stackKey || getStackKey(preparedItem);
        const itemQuantity = Number(preparedItem.quantity) || 1;
        const existingItem = findUnequippedStoreItemByStackKey(stackKey);
        if (existingItem) {
          adjustStoreItemQuantity(existingItem.id, itemQuantity);
        } else {
          addNewItem({
            ...preparedItem,
            quantity: itemQuantity,
            stackKey,
            uniqueId: preparedItem.uniqueId || stackKey,
          });
        }
      }
      finishLootBonuses(bonusEvents);
      return;
    }

    // Optional durability extension: a setting may initialize individual item
    // instances, while settings without this capability keep normal stacking.
    const initializedDurabilityItems = durabilityFeature?.initializeAcquisition?.(
      localizedItem,
      {
        quantity,
        source,
        randomQualityEnabled: durabilitySettings.randomQualityEnabled,
      },
    );
    if (Array.isArray(initializedDurabilityItems)) {
      initializedDurabilityItems.forEach((item) => addNewItem(item));
      finishLootBonuses(bonusEvents);
      return;
    }

    const stackKey = getStackKey(localizedItem);
    const existingItem = findUnequippedStoreItemByStackKey(stackKey);

    if (existingItem) {
      adjustStoreItemQuantity(existingItem.id, quantity);
      finishLootBonuses(bonusEvents);
      return;
    }

    addNewItem({
      ...localizedItem,
      itemType: getItemType(localizedItem),
      quantity,
    });
    finishLootBonuses(bonusEvents);
  };



  const handleSelectCatalogItem = (item, quantity = 1) => {
    if (itemSelectionMode === 'buy') {
      setSelectedItemForBuy(item);
      setIsBuyItemModalVisible(true);
      return;
    }
    handleAddItem(item, quantity);
  };

  const handleConfirmBuy = (quantity, unitPrice) => {
    const finalCost = quantity * unitPrice;
    // Списание атомарно (инвариант стора «нельзя купить на больше, чем
    // есть»): при отказе предмет НЕ выдаётся. Модалка уже проверяет баланс —
    // это вторая линия на случай иного пути вызова.
    const result = spendCurrency(finalCost);
    if (!result.ok) {
      showAlert(
        tInventory('modals.buyItemModal.notEnoughCurrencyTitle'),
        formatInventoryText(tInventory('modals.buyItemModal.notEnoughCurrencyMessage'), { total: finalCost, balance: currency }),
      );
      return;
    }
    handleAddItem({ ...selectedItemForBuy, price: unitPrice, cost: unitPrice }, quantity, 'buy');
    setIsBuyItemModalVisible(false);
    setSelectedItemForBuy(null);
  };

  const parseProtectedAreas = (item) => {
    if (Array.isArray(item?.protectedAreas) && item.protectedAreas.length > 0) {
      return item.protectedAreas;
    }

    return [];
  };

  const getSlotsForArea = (item) => {
    const areas = parseProtectedAreas(item);
    const slots = [];
    if (areas.includes('Head')) slots.push('head');
    if (areas.includes('Body')) slots.push('body');
    if (areas.includes('Hand')) slots.push('leftArm', 'rightArm');
    if (areas.includes('Leg')) slots.push('leftLeg', 'rightLeg');
    return slots;
  };

  const getSingleLimbCandidateSlots = (item) => {
    const areas = parseProtectedAreas(item);
    if (areas.length !== 1) return null;
    if (areas[0] === 'Hand') return ['leftArm', 'rightArm'];
    if (areas[0] === 'Leg') return ['leftLeg', 'rightLeg'];
    return null;
  };

  const collectEquippedArmorInstances = (armorState) => {
    const instanceMap = new Map();
    Object.entries(armorState || {}).forEach(([slotKey, slotData]) => {
      const processItem = (item, type) => {
        if (!item) return;
        const instanceKey = getArmorInstanceKey(item, slotKey, type);
        if (!instanceMap.has(instanceKey)) {
          instanceMap.set(instanceKey, {
            item,
            itemName: getItemName(item),
            itemType: item.itemType || type,
            stackKey: item.stackKey || getStackKey(item),
            slots: [slotKey],
            type,
          });
          return;
        }
        instanceMap.get(instanceKey).slots.push(slotKey);
      };
      processItem(slotData.clothing, 'clothing');
      processItem(slotData.armor, 'armor');
    });
    return instanceMap;
  };

  const handleEquipWeapon = (weaponToEquip) => {
    const displayWeapon = weaponToEquip;
    const equipmentEquipResult = characterEquipmentFeature?.handleWeaponEquip?.(displayWeapon, {
      capability: characterEquipmentFeature,
      origin,
      trait,
      equipmentState: characterEquipmentState,
      inventoryItems,
      equipmentCatalog,
      strictPartReplacement: strictEquipmentPartReplacement,
      getStackKey,
      findUnequippedStoreItemByStackKey,
      getItemTypeId,
      createWeaponInstanceId,
      setEquipmentSlots: setCharacterEquipmentSlots,
      setEquippedWeapons,
      adjustStoreItemQuantity,
      addNewItem,
      flattenStoreItemParams: flattenStoreItemParams,
      showAlert,
    });
    if (equipmentEquipResult?.handled) return;

    const weaponCheck = canEquipWeapon(displayWeapon, { origin, trait });
    if (!weaponCheck.allowed) {
      const alert = equipmentEligibilityRuntime.getAlert?.('weapon', weaponCheck.reason);
      if (alert) showAlert(alert.title, alert.message);
      return;
    }

    const sourceStackKey = weaponToEquip.stackKey || getStackKey(displayWeapon);
    const totalOwned = findUnequippedStoreItemByStackKey(sourceStackKey)?.quantity || 0;
    if (totalOwned <= 0) {
      showAlert(tInventory('screen.alerts.noItemsTitle'), tInventory('screen.alerts.noItemsMessage'));
      return;
    }

    equipWeaponInStore(displayWeapon, sourceStackKey);
  };

  const handleUnequipWeapon = (weapon, slot) => {
    if (weapon?.locked) return;

    const settingResult = characterEquipmentFeature?.handleWeaponUnequip?.(weapon, {
      equipmentState: characterEquipmentState,
      setEquipmentSlots: setCharacterEquipmentSlots,
      getStackKey,
      findUnequippedStoreItemByStackKey,
      adjustStoreItemQuantity,
      addNewItem,
      flattenStoreItemParams,
      getItemTypeId,
    });
    if (settingResult?.handled) return;

    const storeItem = useCharacterStore.getState().items[weapon.id];
    if (storeItem?.equipped) {
      unequipItem(weapon.id);
      return;
    }

    setEquippedWeapons((prev) => {
      const newEquipped = [...prev];
      if (!newEquipped[slot]) return prev;

      const matches = newEquipped[slot].uniqueId === weapon.uniqueId
        || getItemName(newEquipped[slot]) === getItemName(weapon);
      if (!matches) return prev;

      const stackKey = newEquipped[slot].stackKey || getStackKey(newEquipped[slot]);
      const stackMate = findUnequippedStoreItemByStackKey(stackKey);
      if (stackMate) {
        adjustStoreItemQuantity(stackMate.id, 1);
      } else {
        addNewItem({
          ...flattenStoreItemParams(newEquipped[slot]),
          itemType: getItemTypeId('weapon'),
          stackKey,
          equipped: false,
          quantity: 1,
        });
      }

      newEquipped[slot] = null;
      return newEquipped;
    });
  };

  const handleEquipArmor = (itemToEquipRaw) => {
    // Совместимость сохранений: статические поля (protectedAreas, itemType, …)
    // берём из каталога по id — в старых сохранениях их может не быть, и без них
    // предмет не надевается. Каталог = источник истины.
    const itemToEquip = resolveLocalizedItem(itemToEquipRaw) || itemToEquipRaw;
    const currentEquipped = equippedArmor;
    const equipmentCheck = structuredEquipmentFeature?.getEquipEligibility?.(
      itemToEquip,
      { origin, trait },
    );
    if (equipmentCheck?.handled && !equipmentCheck.allowed) {
      if (equipmentCheck.alert) showAlert(equipmentCheck.alert.title, equipmentCheck.alert.message);
      return;
    }
    // Проверка брони/одежды через доменные функции
    if (isItemKind(itemToEquip, 'armor')) {
      const armorCheck = canEquipArmor(itemToEquip, { origin, trait });
      if (!armorCheck.allowed) {
        showEquipmentEligibilityAlert('armor', armorCheck.reason);
        return;
      }
    }
    if (isItemKind(itemToEquip, 'clothing')) {
      const clothingCheck = canEquipClothing(itemToEquip, { origin, trait });
      if (!clothingCheck.allowed) {
        showEquipmentEligibilityAlert('clothing', clothingCheck.reason);
        return;
      }
    }
    // ПРАВИЛО (от владельца): слот экипировки определяется ВИДОМ предмета
    // (domain/equippedArmor.resolveTargetLayer): броня — в armor, одежда — в clothing.
    // Запрет брони поверх обмундирования — вычисляемый (blocksArmorOver);
    // одежда больше не «переезжает» в слот брони, чтобы вытеснять её.
    // Предмет неизвестного вида (null) не экипируется вовсе — фоллбэков нет.
    const targetSlotType = resolveTargetLayer(itemToEquip);
    if (!targetSlotType) {
      showAlert('', tInventory('screen.alerts.cannotEquipItem'));
      return;
    }
    const equippedInstances = collectEquippedArmorInstances(currentEquipped);
    const ownedCount = findUnequippedStoreItemByStackKey(itemToEquip.stackKey || getStackKey(itemToEquip))?.quantity || 0;
    const equippedCount = Array.from(equippedInstances.values()).filter((entry) => {
      if (isItemKind(itemToEquip, 'armor') || isItemKind(itemToEquip, 'clothing')) {
        return entry.stackKey === (itemToEquip.stackKey || getStackKey(itemToEquip));
      }
      return false;
    }).length;

    if (ownedCount <= equippedCount) {
      showAlert(tInventory('screen.alerts.noItemsTitle'), tInventory('screen.alerts.noItemsMessage'));
      return;
    }

    const executeEquip = async (slotsToOccupy) => {
      // ПРАВИЛО (владелец): молчаливых падений нет. Пустой список слотов —
      // дефект данных предмета (нет protectedAreas): сообщаем, а не no-op.
      if (!slotsToOccupy || slotsToOccupy.length === 0) {
        showAlert('', tInventory('screen.alerts.cannotEquipItem'));
        return;
      }
      const instancesToUnequip = new Set();
      const markForUnequip = (slot, type) => {
        const slotItem = currentEquipped?.[slot]?.[type];
        if (!slotItem) return;
        instancesToUnequip.add(getArmorInstanceKey(slotItem, slot, type));
      };

      if (targetSlotType === 'clothing') {
          // Одежда заменяет одежду в тех же слотах...
          slotsToOccupy.forEach(slot => {
              if (currentEquipped[slot].clothing) markForUnequip(slot, 'clothing');
          });
          // ...а обмундирование (запрещает броню поверх) вытесняет и броню.
          // Костюм (носящийся под бронёй) броню не трогает.
          if (blocksArmorOver(itemToEquip)) {
            slotsToOccupy.forEach(slot => {
                if (currentEquipped[slot].armor) markForUnequip(slot, 'armor');
            });
          }
      } else {
          // Броня заменяет броню в тех же слотах...
          slotsToOccupy.forEach(slot => {
              if (currentEquipped[slot].armor) markForUnequip(slot, 'armor');
          });
          // ...и вытесняет надетое обмундирование (оно запрещает броню поверх).
          // Костюм из-под брони не вытесняется — ПРАВИЛО (от владельца).
          slotsToOccupy.forEach(slot => {
              if (currentEquipped[slot].clothing && blocksArmorOver(currentEquipped[slot].clothing)) {
                  markForUnequip(slot, 'clothing');
              }
          });
      }

      const performEquip = () => {
          const finalEquipped = JSON.parse(JSON.stringify(currentEquipped));
          const slotsByInstance = new Map();
          Object.entries(currentEquipped || {}).forEach(([slotKey, slotData]) => {
            const addSlot = (item, type) => {
              if (!item) return;
              const key = getArmorInstanceKey(item, slotKey, type);
              if (!slotsByInstance.has(key)) slotsByInstance.set(key, []);
              slotsByInstance.get(key).push({ slot: slotKey, type });
            };
            addSlot(slotData.clothing, 'clothing');
            addSlot(slotData.armor, 'armor');
          });

          instancesToUnequip.forEach((instanceKey) => {
            (slotsByInstance.get(instanceKey) || []).forEach(({ slot, type }) => {
              finalEquipped[slot][type] = null;
            });
          });

          const equipInstanceId = createArmorInstanceId();
          slotsToOccupy.forEach(slot => {
              finalEquipped[slot][targetSlotType] = {
                ...itemToEquip,
                itemType: itemToEquip.itemType || targetSlotType,
                stackKey: itemToEquip.stackKey || getStackKey(itemToEquip),
                equipInstanceId,
              };
          });

          setEquippedArmor(finalEquipped);
      };

      if (instancesToUnequip.size > 0) {
          if (await confirmAlert('replaceEquipment')) performEquip();
      } else {
          performEquip();
      }
    };

    const singleLimbSlots = getSingleLimbCandidateSlots(itemToEquip);
    if (!singleLimbSlots) {
      executeEquip(getSlotsForArea(itemToEquip));
      return;
    }

    const freeSlot = singleLimbSlots.find((slot) => !currentEquipped[slot]?.[targetSlotType]);
    if (freeSlot) {
      executeEquip([freeSlot]);
      return;
    }

    const leftSlot = singleLimbSlots[0];
    const rightSlot = singleLimbSlots[1];
    const leftLabel = leftSlot === 'leftArm' ? tInventory('screen.labels.leftArm') : tInventory('screen.labels.leftLeg');
    const rightLabel = rightSlot === 'rightArm' ? tInventory('screen.labels.rightArm') : tInventory('screen.labels.rightLeg');

    // Выбор стороны одинаков на вебе и на нативе. Раньше на вебе стоял
    // window.prompt с вводом «1» или «2» руками.
    showCatalogAlert('bothSlotsBusy', { leftLabel, rightLabel }).then((side) => {
      if (side === 'left') executeEquip([leftSlot]);
      else if (side === 'right') executeEquip([rightSlot]);
    });
  };

  const handleUnequipArmor = (itemToUnequip) => {
    setEquippedArmor(prevEquipped => {
        const newEquipped = JSON.parse(JSON.stringify(prevEquipped));
        Object.keys(newEquipped).forEach((slot) => {
            const clearByType = (type) => {
              const equippedItem = newEquipped[slot]?.[type];
              if (!equippedItem) return;
              const sameInstance = equippedItem.equipInstanceId && itemToUnequip.equipInstanceId && equippedItem.equipInstanceId === itemToUnequip.equipInstanceId;
              const sameNameAndType = getItemName(equippedItem) === getItemName(itemToUnequip)
                && isItemKind(itemToUnequip, type);
              if (sameInstance || sameNameAndType) {
                newEquipped[slot][type] = null;
              }
            };
            clearByType('clothing');
            clearByType('armor');
        });
        return newEquipped;
    });
  };
  
  // Setting-specific container rows are supplied only by the active inventory capability.
  const structuredEquipmentRows = useMemo(() => structuredEquipmentFeature?.getInventoryRows?.({
    equipmentState: structuredEquipmentState,
    equipmentCatalog,
    expanded: structuredContentsExpanded,
  }) ?? [], [structuredEquipmentState, equipmentCatalog, structuredContentsExpanded, structuredEquipmentFeature]);

  const displayItems = useMemo(() => {
    const equippedItemsList = [];
    (equippedWeaponsForDisplay || []).forEach((w, i) => {
        if (w) {
            // Убеждаемся, что у экипированного оружия есть itemType
            const weaponWithType = {
              ...w,
              itemType: getItemType(w)
            };
            
            // Получаем модифицированную версию оружия, если она есть
            const modifiedWeapon = getModifiedItem(weaponWithType);
            const displayWeapon = modifiedWeapon || w;
            
            const equippedWeapon = {
              ...displayWeapon,
              itemType: getItemType(w),
              isEquipped: true, 
              quantity: 1, 
              slot: i, 
              stackKey: w.stackKey || getStackKey(w),
              uniqueId: w.uniqueId || `weapon-${getItemName(w)}-${i}`
            };
            equippedItemsList.push(equippedWeapon);
        }
    });

    const equippedArmorItems = collectEquippedArmorInstances(equippedArmor);

    // Добавляем экипированные предметы в список
    equippedArmorItems.forEach(({ item, type, stackKey }) => {
        // Получаем модифицированную версию предмета, если она есть
        const itemWithType = {
          ...item,
          itemType: item.itemType || type
        };
        const modifiedItem = getModifiedItem(itemWithType);
        const displayItem = modifiedItem || item;
        
        equippedItemsList.push({
            ...displayItem,
            itemType: item.itemType || type,
            stackKey,
            equipInstanceId: item.equipInstanceId,
            isEquipped: true,
            quantity: 1,
            uniqueId: item.equipInstanceId || `${type}-${getItemName(item)}-${stackKey}`
        });
    });

    const inventoryItemsList = inventoryItems
        .map(item => {
            const flatItem = flattenStoreItemParams(item);
            const itemName = getItemName(flatItem);
            
            // Optional character-equipment items may be hidden from the base list.
            if (isCompatibleCharacter && isHiddenCharacterEquipmentItem(flatItem)) {
              return null;
            }

            const itemStackKey = flatItem.stackKey || getStackKey(flatItem);
            const displayItem = flatItem;
            
            // Подсчитываем экипированные предметы
            const equippedCount = equippedItemsList.filter(equippedItem => {
                const equippedName = getItemName(equippedItem);
                const itemName = getItemName(displayItem);
                if (isWeaponItem(displayItem) && isWeaponItem(equippedItem)) {
                  return (equippedItem.stackKey || getStackKey(equippedItem)) === itemStackKey;
                }
                return (equippedItem.stackKey || getStackKey(equippedItem)) === itemStackKey || equippedName === itemName;
            }).length;
            

            
            const remainingQuantity = (flatItem.quantity || 1) - equippedCount;

            if (remainingQuantity > 0) {
                return {
                    ...displayItem,
                    itemType: getItemType(flatItem),
                    stackKey: itemStackKey,
                    quantity: remainingQuantity,
                    isEquipped: false,
                    uniqueId: flatItem.uniqueId || `inv-stack-${itemStackKey}`
                };
            }
            return null;
        })
        .filter(Boolean);

    const merged = [...equippedItemsList, ...structuredEquipmentRows, ...inventoryItemsList];
    // The active capability contributes any setting-owned structured rows.
    return merged;
  }, [inventoryItems, equippedWeaponsForDisplay, equippedArmor, getModifiedItem, getStackKey, isCompatibleCharacter, structuredEquipmentRows, structuredEquipmentFeature]);

  const renderTableHeader = () => {
    return (
      <View style={styles.tableHeader}>
        <Text style={[styles.headerText, { flex: 0.7 }]}>{tInventory('screen.labels.item')}</Text>
        <Text style={[styles.headerText, { flex: 0.3, textAlign: 'center' }]}>{tInventory('screen.labels.action')}</Text>
      </View>
    );
  };

  // Optional item-breakdown feature handles its own action/result presentation.
  const handleItemBreakdownPress = (rowItem) => {
    const result = itemBreakdownFeature?.execute?.(rowItem.id);
    const report = itemBreakdownFeature?.buildReport?.(result);
    if (report) showAlert(report.title, report.message);
  };

  const renderItem = ({ item }) => {
    if (structuredEquipmentFeature?.isInventoryRow?.(item)) {
      const rowActions = structuredEquipmentFeature.getInventoryRowActions?.(item, {
        getAction: (actionKey) => getFeatureAction(structuredEquipmentFeature, actionKey),
        setExpanded: setStructuredContentsExpanded,
        openRepair: setRepairTarget,
      }) ?? {};
      return structuredEquipmentFeature.renderInventoryRow?.({
        item,
        styles,
        getItemTypeIcon,
        repairFeature,
        itemRarityFeature,
        expanded: structuredContentsExpanded,
        onRepairPiece: setRepairTarget,
        ...rowActions,
      }) ?? null;
    }

    // Ensure an item type is available before shared catalog rendering.
    const itemWithType = {
      ...item,
      itemType: getItemType(item)
    };
    
    // Получаем модифицированную версию предмета, если она есть
    const modifiedItem = getModifiedItem(itemWithType);
    const displayItem = modifiedItem || item;
    
    const localizedDisplayItem = resolveLocalizedItem(displayItem);
    const itemName = getItemName(localizedDisplayItem) || tInventory('screen.labels.unknownItem');
    const itemIcon = getItemTypeIcon(item.itemType);
    const structuredItemPresentation = structuredEquipmentFeature?.getInventoryItemPresentation?.(item) ?? {};
    const itemNameSuffix = structuredItemPresentation.nameSuffix ?? '';
    const structuredDurability = structuredItemPresentation.durability ?? null;
    const showStructuredRepair = Boolean(
      repairFeature
      && !item.isEquipped
      && structuredItemPresentation.needsRepair,
    );
    const durabilityPresentation = durabilityFeature?.getPresentation?.(
      localizedDisplayItem,
      durabilitySettings,
    ) ?? null;
    const showItemDurability = Boolean(durabilityPresentation);
    const weaponDurabilityValue = durabilityPresentation?.current;
    const showItemRepair = Boolean(
      repairFeature
      && durabilityPresentation?.needsRepair,
    );
    // Optional rarity information is projected by the active setting feature.
    const rarityCatalogId = inventoryRuntime.getCatalogItemId?.(item)
      ?? getItemCatalogId(item);
    const cardRarity = itemRarityFeature?.getForItem?.(rarityCatalogId) ?? 0;
    const showCardRarity = cardRarity > 0
      && (isItemKind(item, 'weapon') || isItemKind(item, 'armor') || isStructuredEquipmentItem(item));
    const repairAction = (showItemRepair || showStructuredRepair)
      ? repairFeature?.getInventoryAction?.(item, { available: true }) ?? null
      : null;
    const isEquippable = Boolean(getItemCapabilities(item).equippable || isStructuredEquipmentItem(item));
    const isConsumable = Boolean(
      consumablesCapability.isConsumableItem?.(item)
      ?? (item.healAmount != null),
    );

    const settingInventoryRowState = characterEquipmentFeature?.getInventoryRowState?.(item, {
      origin,
      equipmentState: characterEquipmentState,
    }) ?? {};

    // The active equipment capability may mark setting-owned weapon rows as action-locked.
    const isSettingWeaponActionLocked = characterEquipmentFeature?.isWeaponActionLocked?.(item) ?? false;
    const equipmentFeatureRestriction = characterEquipmentFeature?.getEquipButtonRestriction?.({
      item,
      isCompatibleCharacter,
      isWeapon: isItemKind(item, 'weapon'),
      isEquipped: Boolean(item.isEquipped),
      equipmentState: characterEquipmentState,
      equipmentCatalog,
    }) ?? null;
    const structuredFeatureRestriction = structuredEquipmentFeature?.getEquipButtonRestriction?.(item, {
      isCompatibleCharacter,
      isEquipped: Boolean(item.isEquipped),
      origin,
      trait,
    }) ?? null;
    const equipButtonRestriction = equipmentFeatureRestriction ?? structuredFeatureRestriction;
    const hideEquipButton = equipButtonRestriction?.hidden === true;
    const hideActionButton = item.isEquipped && (
      (isItemKind(item, 'weapon') && isSettingWeaponActionLocked)
      || item.locked
    );

    const handleActionPress = () => {
        if (item.isEquipped) {
            // Specialized equipment containers render their own optional rows.
            if (isItemKind(item, 'weapon')) {
                handleUnequipWeapon(item, item.slot);
            } else {
                handleUnequipArmor(item);
            }
        } else {
            if (isItemKind(item, 'weapon')) {
                handleEquipWeapon(item);
            } else {
                const handledByStructuredEquipment = structuredEquipmentFeature?.equipInventoryItem?.(item, {
                    getAction: (actionKey) => getFeatureAction(structuredEquipmentFeature, actionKey),
                    origin,
                    trait,
                }) ?? false;
                if (!handledByStructuredEquipment) handleEquipArmor(item);
            }
        }
    };
    
    const price = getItemPrice(localizedDisplayItem);
    const weight = getItemWeight(localizedDisplayItem);
    const weaponAmmoNames = weaponPresentationFeature?.getAmmoNames?.(
      localizedDisplayItem,
      equipmentCatalog,
    ) ?? [];
    const itemBreakdownPresentation = itemBreakdownFeature?.getInventoryPresentation?.(
      item,
      useCharacterStore.getState(),
    ) ?? null;

    return (
      <View style={styles.tableRow}>
        <View style={styles.mainRowContent}>
          <View style={styles.itemNameContainer}>
            <Text style={[styles.itemNameText, item.isEquipped && styles.equippedItemText]}>{itemName}{itemNameSuffix}</Text>
            <Text style={styles.itemTypeIcon}>{itemIcon}</Text>
          </View>
        </View>
        <View style={styles.actionContainer}>
          {isEquippable && !hideActionButton && !hideEquipButton && (
              <TouchableOpacity 
                  style={[styles.actionButton, item.isEquipped ? styles.unequipButton : {}]} 
                  onPress={handleActionPress}>
                  <Text style={styles.actionButtonText}>{item.isEquipped ? tInventory('screen.actions.unequip') : tInventory('screen.actions.equip')}</Text>
              </TouchableOpacity>
          )}
          {hideEquipButton && equipButtonRestriction?.message ? (
              <Text style={styles.itemSubText}>{equipButtonRestriction.message}</Text>
          ) : null}

          {repairAction && (
              <TouchableOpacity
                  style={[styles.actionButton, styles.applyButton, !repairAction.enabled && styles.applyButtonDisabled]}
                  disabled={!repairAction.enabled}
                  onPress={() => setRepairTarget(repairAction.target)}>
                  <Text style={styles.actionButtonText}>{repairAction.label}</Text>
              </TouchableOpacity>
          )}

          {itemBreakdownPresentation?.button && (
              <TouchableOpacity
                  style={[
                    styles.actionButton,
                    styles.applyButton,
                    !itemBreakdownPresentation.button.enabled && styles.applyButtonDisabled,
                  ]}
                  disabled={!itemBreakdownPresentation.button.enabled}
                  onPress={() => handleItemBreakdownPress(item)}>
                  <Text style={styles.actionButtonText}>{itemBreakdownPresentation.button.label}</Text>
              </TouchableOpacity>
          )}
          {isConsumable && !item.isEquipped
            && (canConsumeOnSelf(localizedDisplayItem, fitCharacter)
                || canConsumeOnOther(localizedDisplayItem, fitCharacter)) && (
              <TouchableOpacity 
                  style={[styles.actionButton, styles.applyButton]} 
                  onPress={() => handleApplyConsumable(localizedDisplayItem)}>
                  <Text style={styles.actionButtonText}>{tInventory('screen.actions.apply')}</Text>
              </TouchableOpacity>
          )}
          {(settingInventoryRowState.actions ?? []).map((action, index) => (
              <TouchableOpacity
                  key={action.id ?? index}
                  style={[styles.actionButton, styles.applyButton]}
                  onPress={() => handleCharacterEquipmentAction(item, action)}>
                  <Text style={styles.actionButtonText}>{action.label}</Text>
              </TouchableOpacity>
          ))}
          {!item.isEquipped && (
              <TouchableOpacity style={[styles.actionButton, styles.sellButton]} onPress={() => handleSellItem(item)}>
                  <Text style={styles.actionButtonText}>{tInventory('screen.actions.sell')}</Text>
              </TouchableOpacity>
          )}
        </View>
        <View style={styles.itemSubRow}>
          {structuredDurability && (
            <Text style={styles.itemSubText}>
              {tInventory('screen.labels.durability')}: {structuredDurability.current}/{structuredDurability.maximum}
            </Text>
          )}
          {showItemDurability && (
            <Text style={styles.itemSubText}>{tInventory('screen.labels.durability')}: {weaponDurabilityValue}/{durabilityPresentation.maximum}</Text>
          )}
          {showCardRarity && (
            <Text style={styles.itemSubText}>{tInventory('screen.labels.rarity')}: {cardRarity}</Text>
          )}
          {durabilityPresentation?.statusNote ? (
            <Text style={[styles.itemSubText, { color: '#e8a33d' }]}>
              {durabilityPresentation.statusNote}
            </Text>
          ) : null}
          {settingInventoryRowState.statusLabel && (
            <Text style={[styles.itemSubText, { color: '#e8a33d' }]}>
              {settingInventoryRowState.statusLabel}
            </Text>
          )}
          <Text style={styles.itemSubText}>{tInventory('screen.labels.quantity')}: {item.isEquipped ? 1 : item.quantity} {tInventory('screen.labels.pieces')}</Text>
          <Text style={styles.itemSubText}>{tInventory('screen.labels.price')}: {item.isEquipped ? price : (price * item.quantity)}</Text>
          <Text style={styles.itemSubText}>{tInventory('screen.labels.weight')}: {item.isEquipped ? Number(weight.toFixed(3)) : Number((weight * item.quantity).toFixed(3))}</Text>
          {weaponAmmoNames.length > 0 && (
            <Text style={styles.itemSubText}>{tInventory('screen.labels.ammo')}: {weaponAmmoNames.join(', ')}</Text>
          )}
          {itemBreakdownPresentation?.subline ? (
            <Text style={styles.itemSubText}>{itemBreakdownPresentation.subline}</Text>
          ) : null}
        </View>
      </View>
    );
  };

  const renderFooter = () => (
  <View style={styles.footerActionsRow}>
    <TouchableOpacity
      style={styles.addActionCell}
      onPress={() => {
        setItemSelectionMode('loot');
        setAddItemModalVisible(true);
      }}
    >
      <Text style={styles.addActionIcon}>+</Text>
      <Text style={styles.addActionLabel}>{tInventory('screen.actions.addLoot')}</Text>
    </TouchableOpacity>
    <TouchableOpacity
      style={styles.addActionCell}
      onPress={() => {
        setItemSelectionMode('buy');
        setAddItemModalVisible(true);
      }}
    >
      <Text style={styles.addActionIcon}>+</Text>
      <Text style={styles.addActionLabel}>{tInventory('screen.actions.buyItems')}</Text>
    </TouchableOpacity>
  </View>
);
  const totalWeight = useMemo(() => {
    let total = 0;
    
    total += inventoryItems.reduce((acc, item) => {
      const flatItem = flattenStoreItemParams(item);
      const itemWithType = { ...flatItem, itemType: flatItem.itemType || getItemTypeId('weapon') };
      const modifiedItem = getModifiedItem(itemWithType);
      const displayItem = resolveLocalizedItem(modifiedItem || flatItem);
      const weight = getItemWeight(displayItem);
      return acc + (weight * (flatItem.quantity || 1));
    }, 0);

    equippedWeaponsForDisplay.forEach(weapon => {
      if (weapon) {
        const weaponWithType = {
          ...weapon,
          itemType: weapon.itemType || getItemTypeId('weapon')
        };
        const modifiedWeapon = getModifiedItem(weaponWithType);
        const displayWeapon = resolveLocalizedItem(modifiedWeapon || weapon);
        total += getItemWeight(displayWeapon);
      }
    });
    
    Object.values(equippedArmor).forEach(slotData => {
      if (slotData.armor) {
        total += getItemWeight(resolveLocalizedItem(slotData.armor));
      }
      if (slotData.clothing) {
        total += getItemWeight(resolveLocalizedItem(slotData.clothing));
      }
    });
    
    return Number(total.toFixed(3));
  }, [inventoryItems, equippedWeaponsForDisplay, equippedArmor, getModifiedItem, equipmentCatalog]);
  
  const totalPrice = useMemo(() => {
    let total = 0;

    total += inventoryItems.reduce((acc, item) => {
      const flatItem = flattenStoreItemParams(item);
      const itemWithType = { ...flatItem, itemType: flatItem.itemType || getItemTypeId('weapon') };
      const modifiedItem = getModifiedItem(itemWithType);
      const displayItem = resolveLocalizedItem(modifiedItem || flatItem);
      const price = getItemPrice(displayItem);
      return acc + (price * (flatItem.quantity || 1));
    }, 0);

    equippedWeaponsForDisplay.forEach(weapon => {
      if (weapon) {
        const weaponWithType = {
          ...weapon,
          itemType: weapon.itemType || getItemTypeId('weapon')
        };
        const modifiedWeapon = getModifiedItem(weaponWithType);
        const displayWeapon = resolveLocalizedItem(modifiedWeapon || weapon);
        total += getItemPrice(displayWeapon);
      }
    });
    
    Object.values(equippedArmor).forEach(slotData => {
      if (slotData.armor) {
        total += getItemPrice(resolveLocalizedItem(slotData.armor));
      }
      if (slotData.clothing) {
        total += getItemPrice(resolveLocalizedItem(slotData.clothing));
      }
    });
    
    return total;
  }, [inventoryItems, equippedWeaponsForDisplay, equippedArmor, getModifiedItem, equipmentCatalog]);

  return (
    <View style={styles.background}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <CurrencySection 
            amount={currency}
            onAdd={() => handleOpenCurrencyModal('add')}
            onSubtract={() => handleOpenCurrencyModal('subtract')}
            onCraft={handleCraftPress}
            currencyIcon={currencyIcon}
            showCraft={Boolean(craftingFeature)}
          />
          <View style={styles.tableContainer}>
            {renderTableHeader()}
            <FlatList
              data={displayItems}
              extraData={moduleLocale}
              renderItem={renderItem}
              keyExtractor={(item, index) => item.uniqueId || `${getItemName(item)}-${index}`}
              style={styles.list}
              ListEmptyComponent={<Text style={styles.emptyListText}>{tInventory('screen.labels.inventoryEmpty')}</Text>}
              ListFooterComponent={renderFooter}
            />
          </View>
          <View style={styles.summaryContainer}>
            <Text style={styles.summaryText}>{tInventory('screen.labels.totalWeight')}: {totalWeight}/{carryWeight ?? 0}</Text>
            <Text style={styles.summaryText}>{tInventory('screen.labels.totalPrice')}: {totalPrice}</Text>
          </View>
        </View>
        {CurrencyModal ? (
          <CurrencyModal
            visible={isCurrencyModalVisible}
            onClose={() => setIsCurrencyModalVisible(false)}
            onSave={handleSaveCurrency}
            operationType={currencyOperationType}
            balance={currency}
          />
        ) : null}
        <SellItemModal
            visible={isSellModalVisible}
            onClose={() => setIsSellModalVisible(false)}
            item={selectedItemForSale}
            onConfirmSale={handleConfirmSale}
        />
        <AddItemModal
          visible={isAddItemModalVisible}
          onClose={() => setAddItemModalVisible(false)}
          onSelectItem={handleSelectCatalogItem}
          selectionMode={itemSelectionMode}
          maxRarity={itemSelectionMode === 'buy' ? (equipment?.purchaseMaxRarity ?? null) : null}
          rootTitleKey={itemSelectionMode === 'buy' ? 'modals.addItemModal.buyTitle' : 'modals.addItemModal.title'}
        />
        {CraftingModal ? (
          <CraftingModal
            visible={isCraftModalVisible}
            onClose={() => setCraftModalVisible(false)}
          />
        ) : null}
        {RepairModal && repairTarget != null && (
          <RepairModal
            target={repairTarget}
            onClose={() => setRepairTarget(null)}
          />
        )}
        <BuyItemModal
          visible={isBuyItemModalVisible}
          onClose={() => {
            setIsBuyItemModalVisible(false);
            setSelectedItemForBuy(null);
          }}
          item={selectedItemForBuy}
          balance={currency}
          onConfirmBuy={handleConfirmBuy}
        />

      </SafeAreaView>
    </View>
  );
};

export default InventoryScreen; 
