import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, ImageBackground, SafeAreaView, FlatList, TouchableOpacity, Alert, Platform } from 'react-native';
import { useCharacter } from '../../CharacterContext';
import useCharacterStore from '../../../src/store/characterStore';
import { selectItemsByEquipped } from '../../../src/store/selectors';
import { useShallow } from 'zustand/react/shallow';
import CapsModal from './modals/CapsModal';
import SellItemModal from './modals/SellItemModal';
import AddItemModal from './modals/AddItemModal';
import BuyItemModal from './modals/BuyItemModal';
import { calculateMaxHealth } from '../../../domain/characterCreation';
import { getInstantHealAmount } from '../../../domain/effects';
import { resolveTargetLayer, blocksArmorOver } from '../../../domain/equippedArmor';
import { getProtectionKind, PROTECTION_KINDS } from '../../../domain/protectionKind';
import {
  isFusionCoreItem,
  fusionCoreStackKey,
  isPowerArmorFrame,
  powerArmorPieceStackKey,
  powerArmorFrameStackKey,
  rollNewFusionCoreCharges,
  hasFrame,
  FUSION_CORE_ID,
} from '../../../domain/powerArmor';
import dataPowerArmor from '../../../data/equipment/powerArmor.json';
import { formatInventoryText, tInventory } from './logic/inventoryI18n';
import { debugLog } from '../../../src/debug/falloutDebug';
import { useLocale } from '../../../i18n/locale';
import { getEquipmentCatalog } from '../../../i18n/equipmentCatalog';
import { isRobotCharacter } from '../../../domain/origins';
import { getBuiltinWeaponsFromSlots } from '../../../domain/robotEquip';
import styles from '../../../styles/InventoryScreen.styles';

const PARAM_FIELDS = [
  'damage', 'fireRate', 'physicalDamageRating', 'energyDamageRating', 'radiationDamageRating',
];

// Каталог механики силовой брони по id (макс. прочность частей, зоны защиты).
const PA_CATALOG_BY_ID = Object.fromEntries(
  Object.values(dataPowerArmor).flatMap((set) => set.pieces).map((p) => [p.id, p]),
);

const flattenItemParams = (item) => {
  if (!item) return item;
  const flat = { ...item };
  PARAM_FIELDS.forEach((field) => {
    if (flat[field] && typeof flat[field] === 'object') {
      flat[field] = flat[field].total ?? flat[field].base;
    }
  });
  return flat;
};

const CapsSection = ({ caps, onAdd, onSubtract }) => (
  <View style={styles.capsContainer}>
    <Text style={styles.capsLabel}>{tInventory('screen.caps.title')}</Text>
    <TouchableOpacity style={styles.capsButton} onPress={onSubtract}>
      <Text style={styles.capsButtonText}>{tInventory('screen.caps.subtract')}</Text>
    </TouchableOpacity>
    <Text style={styles.capsValue}>{caps}</Text>
    <TouchableOpacity style={styles.capsButton} onPress={onAdd}>
      <Text style={styles.capsButtonText}>{tInventory('screen.caps.add')}</Text>
    </TouchableOpacity>
  </View>
);

const InventoryScreen = () => {
  const { 
    equippedWeapons, setEquippedWeapons, 
    equippedArmor, setEquippedArmor,
    equippedRobotSlots, setEquippedRobotSlots,
    caps, setCaps,
    attributes, level,
    currentHealth, setCurrentHealth,
    applyConsumableFull,
    getModifiedItem,
    trait,
    origin,
    // Силовая броня: свой слой и свои действия (docs/architecture/power-armor-plan.md).
    equippedPowerArmor,
    equipPowerArmorPackage,
    equipPowerArmorPiece,
    unequipPowerArmorPackage,
    unequipPowerArmorPieceAt,
    repairPowerArmorPieceAt,
    repairPowerArmorStack,
  } = useCharacter();

  const storeItems = useCharacterStore((state) => state.items);
  const inventoryItems = useMemo(() => selectItemsByEquipped({ items: storeItems }, false), [storeItems]);
  const storeEquippedWeapons = useMemo(() => selectItemsByEquipped({ items: storeItems }, true), [storeItems]);
  const equipItem = useCharacterStore((state) => state.equipItem);
  const unequipItem = useCharacterStore((state) => state.unequipItem);
  const addNewItem = useCharacterStore((state) => state.addNewItem);
  const updateItem = useCharacterStore((state) => state.updateItem);

  const findUnequippedStoreItemByStackKey = useCallback((stackKey) => {
    return inventoryItems.find((item) => (item.stackKey || item.id) === stackKey);
  }, [inventoryItems]);

  const adjustStoreItemQuantity = useCallback((itemId, delta) => {
    const { items } = useCharacterStore.getState();
    const item = items[itemId];
    if (!item) return;

    const newQty = (item.quantity || 1) + delta;
    if (newQty <= 0) {
      const updated = { ...items };
      delete updated[itemId];
      useCharacterStore.setState({ items: updated });
      return;
    }
    updateItem(itemId, { quantity: newQty });
  }, [updateItem]);

  const equipWeaponInStore = useCallback((displayWeapon, sourceStackKey) => {
    const storeItem = findUnequippedStoreItemByStackKey(sourceStackKey);
    if (!storeItem) return false;

    if ((storeItem.quantity || 1) > 1) {
      adjustStoreItemQuantity(storeItem.id, -1);
      addNewItem({
        ...flattenItemParams(displayWeapon),
        itemType: 'weapon',
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

  const equippedWeaponsForDisplay = useMemo(() => {
    const fromStore = storeEquippedWeapons.map(flattenItemParams);
    const robotExtras = (equippedWeapons || []).filter(
      (w) => w?.isBuiltin || w?.isManipulator || w?.sourceSlot,
    );
    const storeKeys = new Set(fromStore.map((w) => w.uniqueId || w.id || w.stackKey));
    const extras = robotExtras.filter((w) => !storeKeys.has(w.uniqueId || w.id || w.stackKey));
    return [...fromStore, ...extras];
  }, [storeEquippedWeapons, equippedWeapons]);

  const showAlert = (title, message = '') => {
    const text = message ? `${title}\n\n${message}` : title;
    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert(text);
      return;
    }
    if (message) {
      Alert.alert(title, message);
    } else {
      Alert.alert(title);
    }
  };
  
  const [isCapsModalVisible, setIsCapsModalVisible] = useState(false);
  const [capsOperationType, setCapsOperationType] = useState('add');
  const [isSellModalVisible, setIsSellModalVisible] = useState(false);
  const [selectedItemForSale, setSelectedItemForSale] = useState(null);
  const [isAddItemModalVisible, setAddItemModalVisible] = useState(false);
  const [itemSelectionMode, setItemSelectionMode] = useState('loot');
  const [isBuyItemModalVisible, setIsBuyItemModalVisible] = useState(false);
  const [selectedItemForBuy, setSelectedItemForBuy] = useState(null);
  // Контейнер «Силовая броня» (ПРАВИЛО владельца): надетый пакет — одна строка
  // в общем списке; «Содержание» раскрывает аккордеоном части и Ядерный блок.
  const [paContentsOpen, setPaContentsOpen] = useState(false);
  // Снятые пакеты: каждый — тоже контейнер (ПРАВИЛО владельца), аккордеоны
  // независимы по id стор-записи: { [storeItemId]: true }.

  const locale = useLocale();
  const equipmentCatalog = useMemo(() => getEquipmentCatalog(locale), [locale]);

  const getItemName = (item) => item?.name || item?.id || '';
  const getItemCatalogId = (item) => item?.id || item?.weaponId || item?.itemId || item?.armorId || item?.clothingId || item?.code || '';
  const getItemType = (item) => {
    if (item?.itemType) return item.itemType;
    if (item?.effectType || item?.durationInScenes || item?.duration || item?.positiveEffect) return 'chem';
    if (item?.type === 'ammo') return 'ammo';
    if (item?.weaponId || item?.damage !== undefined) return 'weapon';
    if (item?.clothingType) return 'clothing';
    if (item?.protectedAreas) return 'armor';
    return 'misc';
  };
  const isWeaponItem = (item) => getItemType(item) === 'weapon';
  const getModsSignature = (item) => {
    const applied = item?.appliedMods || {};
    const modIds = Object.values(applied).filter(Boolean).sort();
    return modIds.length ? modIds.join('|') : 'none';
  };
  const getStackKey = (item) => {
    // Ядерный Блок: блоки с разным зарядом лежат отдельными стопками (§2 плана).
    // Ветка ПЕРВАЯ: блок — разновидность ammo, но его подпись строится по зарядам.
    if (isFusionCoreItem(item)) return fusionCoreStackKey(item.charges);
    if (item?.itemType === 'powerArmor') {
      // Каталожный id у стор-предмета живёт в weaponId, у свежего из каталога — в id.
      const catalogId = item.weaponId || item.id;
      if (isPowerArmorFrame(item)) {
        // Пакет: подпись считает домен по составу установленных частей и заряду блока.
        return powerArmorFrameStackKey({ ...item, id: catalogId });
      }
      return powerArmorPieceStackKey({ catalogId, appliedMods: item.appliedMods || {}, hpCurrent: item.hpCurrent });
    }
    const itemType = getItemType(item);
    if (itemType === 'weapon') {
      const baseWeaponId = item?.weaponId || item?.id || getItemName(item);
      return `weapon:${baseWeaponId}:mods:${getModsSignature(item)}`;
    }
    return `${itemType}:${getItemCatalogId(item)}`;
  };
  const createWeaponInstanceId = () => `weapon-instance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const createArmorInstanceId = () => `armor-instance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const getArmorInstanceKey = (item, slot, type) =>
    item?.equipInstanceId || `${type || item?.itemType || 'armor'}:${item?.stackKey || getStackKey(item)}:${slot}`;
  const getItemTypeIcon = (itemType) => {
    if (itemType === 'weapon') return '🔫';
    if (itemType === 'armor') return '🛡️';
    if (itemType === 'clothing' || itemType === 'outfit') return '👕';
    if (itemType === 'chem' || itemType === 'chems') return '💊';
    if (itemType === 'drinks') return '🥤';
    if (itemType === 'food') return '🍖';
    if (itemType === 'ammo') return '🔹';
    if (itemType === 'powerArmor') return '⚡';
    if (itemType === 'misc') return '🔧';
    return '📦';
  };

  const equippedRobotBodyPart = useMemo(() => {
    return inventoryItems.find(
      (item) => String(item?.id || '').startsWith('robot_body_') || item?.itemType === 'robotPart',
    ) || null;
  }, [inventoryItems]);

  // Per docs/schema/02-traits.md T-1: bodyPlan lives on origin.
  // Legacy trait.modifiers.robotBodyPlan was dropped from data.
  const robotBodyPlan = origin?.bodyPlan
    || equippedRobotBodyPart?.robotBodyPlan
    || null;

  // isRobot now reads origin.characterType directly via domain/origins.js.
  // The previous local override (trait.modifiers.isRobot || robotBodyPlan) is gone:
  //   - trait.modifiers.isRobot was removed from all 4 robot traits in this refactor
  //   - robotBodyPlan alone doesn't imply robot (it's a body shape, not the archetype)
  const isRobot = isRobotCharacter({ origin, trait });
  const robotBodyUpgrade = useMemo(() => {
    if (!robotBodyPlan) return null;
    const parts = Array.isArray(equipmentCatalog?.robotPartsUpgrade) ? equipmentCatalog.robotPartsUpgrade : [];
    return parts.find((part) => part?.robotBodyPlan === robotBodyPlan) || null;
  }, [equipmentCatalog, robotBodyPlan]);
  const isRobotLimbItem = (item) => {
    const itype = item?.itemType;
    return itype === 'robotArm' || itype === 'robotHead' || itype === 'robotBody' || itype === 'robotLeg';
  };

  const robotWeaponIds = useMemo(
    () => new Set((equipmentCatalog?.robotWeapons || []).map((entry) => entry.id)),
    [equipmentCatalog],
  );
  const robotArmsById = useMemo(
    () => new Map((equipmentCatalog?.robotArms || []).map((entry) => [entry.id, entry])),
    [equipmentCatalog],
  );
  const isRobotOnlyItem = (item) => Boolean(item?.id && robotWeaponIds.has(item.id));
  const resolveRobotArmFromWeapon = (item) => {
    if (!item?.id) return null;
    return robotArmsById.get(item.id) || null;
  };
  const isRobotLimbWeapon = (item) => Boolean(resolveRobotArmFromWeapon(item));

  // Проверяем наличие руки с canHoldWeapons в слотах робота (Requirement 7.2)
  const robotHasHoldingArm = useMemo(() => {
    if (!isRobot) return true;
    const slots = equippedRobotSlots || {};
    return Object.values(slots).some((slotData) => slotData?.limb?.canHoldWeapons === true);
  }, [isRobot, equippedRobotSlots]);
  // Силовая броня определяется ТОЛЬКО по виду из данных (domain/protectionKind.js).
  // ПРАВИЛО (от владельца, 2026-07-31): эвристик по названию здесь больше нет.
  const isPowerArmorItem = (item) => getProtectionKind(item) === PROTECTION_KINDS.POWER_ARMOR;
  const toWeight = (value) => parseFloat(String(value ?? 0).replace(',', '.')) || 0;
  const flattenMiscellaneousItems = (miscCatalog) => {
    if (Array.isArray(miscCatalog)) return miscCatalog;
    if (Array.isArray(miscCatalog?.miscellaneous)) {
      return miscCatalog.miscellaneous.flatMap((group) => group?.items || []);
    }
    return [];
  };

  const resolveLocalizedItem = (item) => {
    if (!item || !item.id) return item;
    const itemType = getItemType(item);

    if (itemType === 'weapon') {
      const base = (equipmentCatalog?.weapons || []).find((entry) => entry.id === item.id);
      if (!base) return item;
      return {
        ...base,
        ...item,
        name: base.name,
      };
    }

    if (itemType === 'armor') {
      const base = equipmentCatalog?.armorIndex?.byId?.get(item.id);
      if (!base) return item;
      return {
        ...base,
        ...item,
        name: base.name,
      };
    }

    if (itemType === 'clothing' || itemType === 'outfit') {
      const allClothes = (equipmentCatalog?.clothes?.clothes || []).flatMap((group) => group.items || []);
      const base = allClothes.find((entry) => entry.id === item.id);
      if (!base) return item;
      return {
        ...base,
        ...item,
        name: base.name,
      };
    }

    if (itemType === 'chem' || itemType === 'chems') {
      const base = (equipmentCatalog?.chems || []).find((entry) => entry.id === item.id);
      if (!base) {
        console.log('[resolveLocalizedItem] No chem base found for:', item.id, 'item:', item);
        return item;
      }
      const result = {
        ...base,
        ...item,
        name: base.name,
      };
      console.log('[resolveLocalizedItem] chem result:', result.id, 'positiveEffect:', result.positiveEffect);
      return result;
    }

    if (itemType === 'drinks') {
      const base = (equipmentCatalog?.drinks || []).find((entry) => entry.id === item.id);
      if (!base) return item;
      return {
        ...base,
        ...item,
        name: base.name,
      };
    }

    if (itemType === 'food') {
      const base = (equipmentCatalog?.food || []).find((entry) => entry.id === item.id);
      if (!base) return item;
      return {
        ...base,
        ...item,
        name: base.name,
      };
    }

    if (itemType === 'ammo') {
      const base = (equipmentCatalog?.ammoTypes || []).find((entry) => entry.id === item.id);
      if (!base) return item;
      return {
        ...base,
        ...item,
        name: base.name,
      };
    }

    const miscItems = flattenMiscellaneousItems(equipmentCatalog?.miscellaneous);
    const base = miscItems.find((entry) => entry.id === item.id)
      || (equipmentCatalog?.generalGoods || []).find((entry) => entry.id === item.id)
      || (equipmentCatalog?.robotModules || []).find((entry) => entry.id === item.id)
      || (equipmentCatalog?.robotItems || []).find((entry) => entry.id === item.id);
    if (!base) return item;
    return {
      ...base,
      ...item,
      name: item.name || base.name || item.id,
    };
  };


  const handleOpenCapsModal = (type) => {
    setCapsOperationType(type);
    setIsCapsModalVisible(true);
  };

  const handleSaveCaps = (amount) => {
    if (capsOperationType === 'add') {
      setCaps(prev => prev + amount);
    } else {
      setCaps(prev => Math.max(0, prev - amount));
    }
  };

  const handleApplyConsumable = (item) => {
    const consumableItem = { ...item };
    const itemName = getItemName(consumableItem);

    console.log('[handleApplyConsumable] START:', {
      itemName,
      item,
      consumableItem,
      positiveEffect: consumableItem?.positiveEffect,
      positiveEffectType: typeof consumableItem?.positiveEffect,
    });

    const applyToSelf = () => {
      if (isRobot) {
        showAlert(tInventory('screen.alerts.robotCannotSelfUseTitle'), tInventory('screen.alerts.robotCannotSelfUseMessage'));
        return;
      }

      // Применяем расходник с полной логикой (timed-эффекты, removeCondition, addiction)
      const result = applyConsumableFull(consumableItem);
      const { timedResult, addictionResult, conditionsRemoved } = result;

      // Лечение HP
      const healAmount = getInstantHealAmount(consumableItem);

      console.log('[handleApplyConsumable] HEAL CALC:', {
        itemName,
        healAmount,
        currentHealth,
        maxHealth: calculateMaxHealth(attributes, level),
      });

      if (healAmount) {
        const maxHealth = calculateMaxHealth(attributes, level);
        const newHealth = Math.min(maxHealth, currentHealth + healAmount);
        console.log('[handleApplyConsumable] HEALING:', {
          healAmount,
          currentHealth,
          newHealth,
        });
        setCurrentHealth(newHealth);
        showAlert(tInventory('screen.alerts.successTitle'), formatInventoryText(tInventory('screen.alerts.healMessage'), { healAmount }));
      } else {
        console.log('[handleApplyConsumable] NO HEAL AMOUNT FOUND');
        showAlert(tInventory('screen.alerts.appliedTitle'), formatInventoryText(tInventory('screen.alerts.appliedSelfMessage'), { itemName }));
      }

      // Эффекты от timed-эффектов
      if (timedResult.events.length > 0) {
        showAlert(tInventory('screen.alerts.effectsTitle'), timedResult.events.join('\n'));
      }

      // Удаление условий (аддиктол, антибиотики)
      if (conditionsRemoved.length > 0) {
        showAlert(
          tInventory('screen.alerts.conditionsRemovedTitle'),
          formatInventoryText(tInventory('screen.alerts.conditionsRemovedMessage'), { conditions: conditionsRemoved.join(', ') }));
      }

      // Результат броска на зависимость
      if (addictionResult) {
        const { effectCount, faces, addicted, addictionLevel } = addictionResult;
        const facesText = faces.join(', ');
        showAlert(
          tInventory('screen.alerts.addictionRollTitle'),
          formatInventoryText(tInventory('screen.alerts.addictionRollMessage'), { faces: facesText, effectCount, addictionLevel })
        );
        if (addicted) {
          showAlert(tInventory('screen.alerts.addictionGainedTitle'), tInventory('screen.alerts.addictionGainedMessage'));
        } else {
          showAlert(tInventory('screen.alerts.addictionAvoidedTitle'), tInventory('screen.alerts.addictionAvoidedMessage'));
        }
      }

      handleRemoveItem(consumableItem, 1);
    };

    const applyToOther = () => {
      showAlert(tInventory('screen.alerts.appliedTitle'), formatInventoryText(tInventory('screen.alerts.appliedOtherMessage'), { itemName }));
      handleRemoveItem(consumableItem, 1);
    };

    if (typeof window !== 'undefined' && window.confirm) {
      const applyOnSelf = window.confirm(formatInventoryText(tInventory('screen.alerts.windowApplyConsumableQuestion'), { itemName }));
      if (applyOnSelf) {
        applyToSelf();
      } else {
        applyToOther();
      }
      return;
    }

    showAlert(
      tInventory('screen.alerts.applyConsumableTitle'),
      formatInventoryText(tInventory('screen.alerts.applyConsumableQuestion'), { itemName }),
      [
        { text: tInventory('screen.actions.cancel'), style: "cancel" },
        { text: tInventory('screen.actions.self'), onPress: applyToSelf },
        { text: tInventory('screen.actions.other'), onPress: applyToOther }
      ]
    );
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

  const handleConfirmSale = (quantity, finalPrice) => {
    setCaps(prev => prev + finalPrice);

    const stackKey = selectedItemForSale?.stackKey || getStackKey(selectedItemForSale);
    const storeItem = findUnequippedStoreItemByStackKey(stackKey);
    if (storeItem) {
      adjustStoreItemQuantity(storeItem.id, -quantity);
    }

    setIsSellModalVisible(false);
    setSelectedItemForSale(null);
  };

  const handleAddItem = (item, quantity = 1) => {
    const localizedItem = resolveLocalizedItem(item);

    // Ядерный Блок (§3.2): заряды нового блока — бросок d20. Каждый блок — свой
    // бросок (покупка 5 шт = 5 независимых бросков), стекаются только одинаковые.
    if (isFusionCoreItem(localizedItem)) {
      for (let i = 0; i < quantity; i += 1) {
        const charges = rollNewFusionCoreCharges(localizedItem.maxCharges);
        const stackKey = fusionCoreStackKey(charges);
        const existingItem = findUnequippedStoreItemByStackKey(stackKey);
        if (existingItem) {
          adjustStoreItemQuantity(existingItem.id, 1);
        } else {
          addNewItem({
            ...localizedItem,
            itemType: 'ammo',
            quantity: 1,
            charges,
            stackKey,
            uniqueId: stackKey,
          });
        }
      }
      return;
    }

    // Силовая броня (§4): часть приходит со своей прочностью (hpCurrent = max),
    // каркас — пустым пакетом (без частей и блока). Подпись стопки — доменная.
    if (localizedItem.itemType === 'powerArmor') {
      const prepared = isPowerArmorFrame(localizedItem)
        ? {
          ...localizedItem,
          appliedMods: localizedItem.appliedMods || {},
          installedPieces: { head: null, body: null, hands: null, legs: null },
          installedCore: null,
        }
        : {
          ...localizedItem,
          appliedMods: localizedItem.appliedMods || {},
          hpCurrent: localizedItem.hpCurrent ?? PA_CATALOG_BY_ID[localizedItem.id]?.hp,
        };
      const stackKey = getStackKey(prepared);
      const existingItem = findUnequippedStoreItemByStackKey(stackKey);
      if (existingItem) {
        adjustStoreItemQuantity(existingItem.id, quantity);
        return;
      }
      addNewItem({ ...prepared, itemType: 'powerArmor', quantity, stackKey, uniqueId: stackKey });
      return;
    }

    const stackKey = getStackKey(localizedItem);
    const existingItem = findUnequippedStoreItemByStackKey(stackKey);

    if (existingItem) {
      adjustStoreItemQuantity(existingItem.id, quantity);
      return;
    }

    addNewItem({
      ...localizedItem,
      itemType: getItemType(localizedItem),
      quantity,
    });
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
    setCaps((prev) => prev - finalCost);
    handleAddItem({ ...selectedItemForBuy, price: unitPrice, cost: unitPrice }, quantity);
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
    const weaponQualities = String(displayWeapon?.qualities || '').toLowerCase();
    const isTwoHandedWeapon = ['двуруч', 'two-handed', 'two handed'].some((token) => weaponQualities.includes(token));
    
    if (isRobot && isRobotOnlyItem(displayWeapon) && Array.isArray(robotBodyUpgrade?.allowedRobotWeaponIds)) {
      const allowedWeaponIds = robotBodyUpgrade.allowedRobotWeaponIds;
      if (displayWeapon?.id && !allowedWeaponIds.includes(displayWeapon.id)) {
        showAlert(
          tInventory('screen.alerts.robotBodyWeaponMismatchTitle'),
          tInventory('screen.alerts.robotBodyWeaponMismatchMessage')
        );
        return;
      }
    }

    if (isRobotOnlyItem(displayWeapon) && !isRobot) {
      showAlert(tInventory('screen.alerts.robotOnlyWeaponTitle'), tInventory('screen.alerts.robotOnlyWeaponMessage'));
      return;
    }
    if (isRobot && isRobotLimbWeapon(displayWeapon)) {
      const armDef = resolveRobotArmFromWeapon(displayWeapon);
      if (!armDef) return;
      const slots = equippedRobotSlots || {};
      const slotKeys = Object.keys(slots);
      const compatibleSlots = Array.isArray(armDef.compatibleSlots) ? armDef.compatibleSlots : [];
      const finalTargets = compatibleSlots.filter((key) => slotKeys.includes(key) && !slots[key]?.limb);
      if (finalTargets.length === 0) {
        showAlert(tInventory('screen.alerts.manipulatorRequiredTitle'), tInventory('screen.alerts.robotNoHandlingLimbMessage'));
        return;
      }

      const sourceStackKey = weaponToEquip.stackKey || getStackKey(displayWeapon);
      const totalOwned = findUnequippedStoreItemByStackKey(sourceStackKey)?.quantity || 0;
      if (totalOwned <= 0) {
        showAlert(tInventory('screen.alerts.noItemsTitle'), tInventory('screen.alerts.noItemsMessage'));
        return;
      }

      const updatedSlots = { ...slots };
      const weaponLimb = {
        ...armDef,
        itemType: 'robotArm',
        builtinWeaponId: armDef.builtinWeaponId || displayWeapon.id,
      };
      finalTargets.forEach((key) => {
        if (!updatedSlots[key]) return;
        updatedSlots[key] = { ...updatedSlots[key], limb: weaponLimb, heldWeapon: null };
      });

      setEquippedRobotSlots(updatedSlots);
      setEquippedWeapons(getBuiltinWeaponsFromSlots(updatedSlots));

      const storeItem = findUnequippedStoreItemByStackKey(sourceStackKey);
      if (storeItem) adjustStoreItemQuantity(storeItem.id, -1);
      return;
    }
    if (!isRobotOnlyItem(displayWeapon) && isRobot) {
      // Robot equip flow: check for arm slot with canHoldWeapons (Requirement 7.2, 7.6)
      const slots = equippedRobotSlots || {};
      const armWithHoldCapability = Object.entries(slots).find(([_key, slotData]) => {
        return slotData?.limb?.canHoldWeapons === true;
      });

      if (!armWithHoldCapability) {
        // No arm that can hold weapons — show warning, no equip button (Requirement 7.2 / design §9)
        showAlert(
          tInventory('screen.alerts.manipulatorRequiredTitle'),
          tInventory('screen.alerts.robotNoHandlingLimbMessage')
        );
        return;
      }

      // Validate weight / two-handed against the arm (Requirement 7.6)
      const [armSlotKey, armSlotData] = armWithHoldCapability;
      const armLimb = armSlotData.limb;
      const candidateWeight = toWeight(displayWeapon.weight);
      const excludeTwoHanded = Boolean(armLimb?.excludeTwoHanded);
      if (excludeTwoHanded && isTwoHandedWeapon) {
        showAlert(
          tInventory('screen.alerts.manipulatorWeightTitle'),
          tInventory('screen.alerts.robotCannotUseTwoHandedMessage')
        );
        return;
      }
      const maxWeightRaw = armLimb?.maxHandelWeaponWeight;
      if (maxWeightRaw !== null && maxWeightRaw !== undefined && maxWeightRaw !== '' && maxWeightRaw !== 'unlimited') {
        const maxHeldWeight = toWeight(maxWeightRaw);
        if (candidateWeight > maxHeldWeight) {
          showAlert(
            tInventory('screen.alerts.manipulatorWeightTitle'),
            formatInventoryText(
              tInventory('screen.alerts.manipulatorWeightMessage'),
              { maxHeldWeight },
            ),
          );
          return;
        }
      }

      // Add weapon directly to equippedWeapons with sourceSlot (Requirement 7.2 / design §9)
      const sourceStackKey = weaponToEquip.stackKey || getStackKey(displayWeapon);
      const totalOwned = findUnequippedStoreItemByStackKey(sourceStackKey)?.quantity || 0;
      if (totalOwned <= 0) {
        showAlert(tInventory('screen.alerts.noItemsTitle'), tInventory('screen.alerts.noItemsMessage'));
        return;
      }

      const weaponEntry = {
        ...displayWeapon,
        itemType: 'weapon',
        stackKey: sourceStackKey,
        uniqueId: displayWeapon.uniqueId || createWeaponInstanceId(),
        sourceSlot: armSlotKey,
      };

      setEquippedWeapons(prev => [...prev, weaponEntry]);
      equipWeaponInStore(displayWeapon, sourceStackKey);
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
    // Locked items (robot built-ins from kits) cannot be unequipped from the
    // inventory UI. They are released only by swapping the limb that holds
    // them. The corresponding 'unequip' button is hidden at the render site.
    if (weapon?.isBuiltin || weapon?.isManipulator || weapon?.locked) {
      return;
    }

    if (weapon?.sourceSlot) {
      setEquippedWeapons((prev) => prev.filter((w) => w?.uniqueId !== weapon.uniqueId));
      const stackKey = weapon.stackKey || getStackKey(weapon);
      const stackMate = findUnequippedStoreItemByStackKey(stackKey);
      if (stackMate) {
        adjustStoreItemQuantity(stackMate.id, 1);
      } else {
        addNewItem({
          ...flattenItemParams(weapon),
          itemType: 'weapon',
          stackKey,
          equipped: false,
          quantity: 1,
        });
      }
      return;
    }

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
          ...flattenItemParams(newEquipped[slot]),
          itemType: 'weapon',
          stackKey,
          equipped: false,
          quantity: 1,
        });
      }

      newEquipped[slot] = null;
      return newEquipped;
    });
  };

  const handleEquipArmor = (itemToEquip) => {
    const currentEquipped = equippedArmor;
    debugLog('equip.armor:entry', {
      id: itemToEquip?.id, weaponId: itemToEquip?.weaponId,
      stackKey: itemToEquip?.stackKey, itemType: itemToEquip?.itemType,
      clothingType: itemToEquip?.clothingType, quantity: itemToEquip?.quantity,
      isEquipped: itemToEquip?.isEquipped, protectedAreas: itemToEquip?.protectedAreas,
      protection: itemToEquip?.protection, DR: itemToEquip?.DR, ER: itemToEquip?.ER,
    });
    if (isRobot && !isRobotOnlyItem(itemToEquip)) {
      const isAllowedClothing = itemToEquip.itemType === 'clothing' && itemToEquip.canRobotWear === true;
      if (!isAllowedClothing) {
        showAlert(tInventory('screen.alerts.robotArmorOnlyTitle'), tInventory('screen.alerts.robotArmorOnlyMessage'));
        return;
      }
    }
    if (isRobot && isPowerArmorItem(itemToEquip)) {
      showAlert(tInventory('screen.alerts.robotArmorOnlyTitle'), tInventory('screen.alerts.robotArmorOnlyMessage'));
      return;
    }
    // ПРАВИЛО (от владельца): слот экипировки определяется ВИДОМ предмета
    // (domain/equippedArmor.resolveTargetLayer): броня — в armor, одежда — в clothing.
    // Запрет брони поверх обмундирования — вычисляемый (blocksArmorOver);
    // одежда больше не «переезжает» в слот брони, чтобы вытеснять её.
    // Предмет неизвестного вида (null) не экипируется вовсе — фоллбэков нет.
    const targetSlotType = resolveTargetLayer(itemToEquip);
    debugLog('equip.armor:targetLayer', { targetSlotType });
    if (!targetSlotType) {
      debugLog('equip.armor:blocked', { reason: 'cannotEquipItem' });
      showAlert(
        tInventory('screen.alerts.robotArmorOnlyTitle'),
        tInventory('screen.alerts.cannotEquipItem'),
      );
      return;
    }
    const equippedInstances = collectEquippedArmorInstances(currentEquipped);
    const ownedRec = findUnequippedStoreItemByStackKey(itemToEquip.stackKey || getStackKey(itemToEquip));
    const ownedCount = ownedRec?.quantity || 0;
    debugLog('equip.armor:counts', {
      stackKey: itemToEquip.stackKey || getStackKey(itemToEquip),
      ownedCount, equippedInstances: equippedInstances.size,
      ownedRec: ownedRec ? { id: ownedRec.id, quantity: ownedRec.quantity, equipped: ownedRec.equipped, locked: ownedRec.locked } : null,
    });
    const equippedCount = Array.from(equippedInstances.values()).filter((entry) => {
      if (itemToEquip.itemType === 'armor' || itemToEquip.itemType === 'clothing' || itemToEquip.itemType === 'outfit') {
        return entry.stackKey === (itemToEquip.stackKey || getStackKey(itemToEquip));
      }
      return false;
    }).length;

    if (ownedCount <= equippedCount) {
      debugLog('equip.armor:blocked', { reason: 'noItems', ownedCount, equippedCount });
      showAlert(tInventory('screen.alerts.noItemsTitle'), tInventory('screen.alerts.noItemsMessage'));
      return;
    }

    const executeEquip = (slotsToOccupy) => {
      debugLog('equip.armor:executeEquip', { slotsToOccupy, targetSlotType });
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
          debugLog('equip.armor:performEquip', { displacing: instancesToUnequip.size });
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
          debugLog('equip.armor:done', { equipInstanceId });
      };

      if (instancesToUnequip.size > 0) {
          debugLog('equip.armor:needsReplace', { count: instancesToUnequip.size, hasWindowConfirm: typeof window !== 'undefined' && !!window.confirm });
          if (typeof window !== 'undefined' && window.confirm) {
              if (window.confirm(tInventory('screen.alerts.replaceEquipmentConfirm'))) {
                  performEquip();
              } else {
                  debugLog('equip.armor:replaceDeclined');
              }
          } else {
              showAlert(
                  tInventory('screen.alerts.replaceEquipmentTitle'),
                  tInventory('screen.alerts.replaceEquipmentConfirm'),
                  [
                      { text: tInventory('screen.actions.cancel'), style: "cancel" },
                      { text: tInventory('screen.actions.yes'), onPress: performEquip },
                  ]
              );
          }
      } else {
          performEquip();
      }
    };

    const singleLimbSlots = getSingleLimbCandidateSlots(itemToEquip);
    debugLog('equip.armor:routing', { singleLimbSlots });
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

    if (typeof window !== 'undefined' && window.prompt) {
      const answer = window.prompt(formatInventoryText(tInventory('screen.alerts.bothSlotsBusyPrompt'), { leftLabel, rightLabel }), '1');
      if (answer === '1') executeEquip([leftSlot]);
      if (answer === '2') executeEquip([rightSlot]);
      return;
    }

    showAlert(
      tInventory('screen.alerts.replaceEquipmentTitle'),
      tInventory('screen.alerts.bothSlotsBusy'),
      [
        { text: leftLabel, onPress: () => executeEquip([leftSlot]) },
        { text: rightLabel, onPress: () => executeEquip([rightSlot]) },
        { text: tInventory('screen.actions.cancel'), style: "cancel" },
      ]
    );
  };

  const handleUnequipArmor = (itemToUnequip) => {
    setEquippedArmor(prevEquipped => {
        const newEquipped = JSON.parse(JSON.stringify(prevEquipped));
        Object.keys(newEquipped).forEach((slot) => {
            const clearByType = (type) => {
              const equippedItem = newEquipped[slot]?.[type];
              if (!equippedItem) return;
              const sameInstance = equippedItem.equipInstanceId && itemToUnequip.equipInstanceId && equippedItem.equipInstanceId === itemToUnequip.equipInstanceId;
              const sameNameAndType = getItemName(equippedItem) === getItemName(itemToUnequip) && (itemToUnequip.itemType === type || itemToUnequip.itemType === 'outfit');
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
  
  // Силовая броня: надетый пакет — КОНТЕЙНЕР одной строкой в общем списке (ПРАВИЛО
  // владельца, §6): «Снять» уносит пакет целиком, «Содержание» раскрывает под ним
  // аккордеон: надетые части (счётчик прочности в дизайне патронов, починка — здесь)
  // и статус Ядерного блока. Строки строятся строго из equippedPowerArmor, имя —
  // из локализованного каталога по catalogId; экипировка уменьшила стек стор-записей —
  // строки идут ПОСЛЕ подсчёта остатков стеков, двойного вычитания нет.
  const paContainerRows = useMemo(() => {
    if (!hasFrame(equippedPowerArmor)) return [];
    const paCatalogEntry = (catalogId) =>
      (equipmentCatalog?.powerArmorList || []).find((p) => p.id === catalogId)
      || PA_CATALOG_BY_ID[catalogId] || {};
    const core = equippedPowerArmor.frame.core;
    const coreMax = (equipmentCatalog?.ammoTypes || []).find((a) => a.id === FUSION_CORE_ID)?.maxCharges;
    const coreText = core ? `${core.charges}/${coreMax}` : '—';
    const frameEntry = paCatalogEntry(equippedPowerArmor.frame.catalogId);
    const installed = Object.entries(equippedPowerArmor.pieces || {}).filter(([, piece]) => Boolean(piece));
    const containerRow = {
      uniqueId: 'pa-container',
      paContainer: true,
      itemType: 'powerArmor',
      // ПРАВИЛО (владелец): родитель контейнера — СИСТЕМНЫЙ заголовок «Силовая броня»,
      // а не каркас; каркас — элемент контейнера, строка внутри «Содержания» (ниже).
      name: tInventory('screen.powerArmor.containerTitle'),
      summary: formatInventoryText(tInventory('screen.powerArmor.summary'), {
        parts: installed.length,
        core: coreText,
      }),
    };
    if (!paContentsOpen) return [containerRow];
    const rows = [containerRow];
    // Каркас — элемент контейнера, как части и блок: своя строка без кнопок
    // (отдельно каркас не снимается — только пакетом через «Снять» родителя).
    rows.push({
      uniqueId: 'pa-content-frame',
      paFrameContent: true,
      itemType: 'powerArmor',
      name: frameEntry.name || equippedPowerArmor.frame.catalogId,
    });
    installed.forEach(([slot, piece]) => {
      const pieceEntry = paCatalogEntry(piece.catalogId);
      const maxHp = PA_CATALOG_BY_ID[piece.catalogId]?.hp;
      rows.push({
        uniqueId: `pa-content-${slot}`,
        paPieceContent: true,
        paSlot: slot,
        itemType: 'powerArmor',
        name: formatInventoryText(tInventory('screen.powerArmor.pieceInSlot'), {
          name: pieceEntry.name || piece.catalogId,
          slot: tInventory(`screen.powerArmor.slots.${slot}`),
        }),
        hpCurrent: piece.hpCurrent,
        maxHp,
        // «Починить» — по ОДНОМУ условию hp < max (правило владельца: бесплатно до максимума).
        showRepair: Number.isFinite(maxHp) && (piece.hpCurrent ?? 0) < maxHp,
      });
    });
    if (core) {
      rows.push({
        uniqueId: 'pa-content-core',
        paCoreContent: true,
        itemType: 'powerArmor',
        name: formatInventoryText(tInventory('screen.powerArmor.coreRow'), { value: coreText }),
      });
    }
    return rows;
  }, [equippedPowerArmor, equipmentCatalog, paContentsOpen]);

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
            const flatItem = flattenItemParams(item);
            const itemName = getItemName(flatItem);
            
            // Скрываем предметы-конечности из инвентаря для роботов (Requirement 7.1)
            if (isRobot && isRobotLimbItem(flatItem)) {
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

    const merged = [...equippedItemsList, ...paContainerRows, ...inventoryItemsList];
    // ПРАВИЛО (владелец): контейнер «Силовая броня» существует только НА персонаже
    // (надет каркас с ядерным блоком). Наличие каркаса в инвентаре контейнера не
    // создаёт: стор-запись каркаса (хоть свежая, хоть снятый пакет с частями и
    // блоком внутри) — обычная строка предмета: её можно продать/надеть.
    return merged;
  }, [inventoryItems, equippedWeaponsForDisplay, equippedArmor, getModifiedItem, isRobot, paContainerRows]);

  const renderTableHeader = () => {
    return (
      <View style={styles.tableHeader}>
        <Text style={[styles.headerText, { flex: 0.7 }]}>{tInventory('screen.labels.item')}</Text>
        <Text style={[styles.headerText, { flex: 0.3, textAlign: 'center' }]}>{tInventory('screen.labels.action')}</Text>
      </View>
    );
  };

  const renderItem = ({ item }) => {
    // ── Контейнер «Силовая броня» и его содержимое (аккордеон — ПРАВИЛО владельца):
    // свои строки, общий пайплайн имён/модов обходят (имена уже собраны из каталога).
    if (item.paContainer) {
      return (
        <View style={styles.tableRow}>
          <View style={styles.mainRowContent}>
            <View style={styles.itemNameContainer}>
              <Text style={[styles.itemNameText, styles.equippedItemText]}>{item.name}</Text>
              <Text style={styles.itemTypeIcon}>{getItemTypeIcon('powerArmor')}</Text>
            </View>
          </View>
          <View style={styles.actionContainer}>
            <TouchableOpacity
              style={[styles.actionButton, styles.unequipButton]}
              onPress={() => unequipPowerArmorPackage()}>
              <Text style={styles.actionButtonText}>{tInventory('screen.actions.unequip')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.applyButton]}
              onPress={() => setPaContentsOpen((open) => !open)}>
              <Text style={styles.actionButtonText}>{tInventory(paContentsOpen ? 'screen.actions.collapse' : 'screen.actions.contents')}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.itemSubRow}>
            <Text style={styles.itemSubText}>{item.summary}</Text>
          </View>
        </View>
      );
    }

    if (item.paPieceContent) {
      // Часть внутри надетого контейнера: «Починить»/«Снять» — управление частями
      // здесь. ПРАВИЛО (владелец): в инвентаре прочность не уменьшается и не
      // увеличивается (счётчика нет), ремонт — только кнопкой «Починить».
      return (
        <View style={styles.tableRow}>
          <View style={styles.mainRowContent}>
            <View style={styles.itemNameContainer}>
              <Text style={styles.itemNameText}>{item.name}</Text>
            </View>
          </View>
          <View style={styles.actionContainer}>
            {item.showRepair && (
              <TouchableOpacity
                style={[styles.actionButton, styles.applyButton]}
                onPress={() => repairPowerArmorPieceAt(item.paSlot)}>
                <Text style={styles.actionButtonText}>{tInventory('screen.actions.repair')}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.actionButton, styles.unequipButton]}
              onPress={() => unequipPowerArmorPieceAt(item.paSlot)}>
              <Text style={styles.actionButtonText}>{tInventory('screen.actions.unequip')}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.itemSubRow}>
            <Text style={styles.itemSubText}>
              {tInventory('screen.labels.durability')}: {item.hpCurrent}/{item.maxHp}
            </Text>
          </View>
        </View>
      );
    }

    if (item.paFrameContent) {
      // Каркас — элемент контейнера (ПРАВИЛО владельца): строка без кнопок,
      // снимается только вместе с пакетом через «Снять» родителя.
      return (
        <View style={styles.tableRow}>
          <View style={styles.mainRowContent}>
            <View style={styles.itemNameContainer}>
              <Text style={styles.itemNameText}>{item.name}</Text>
              <Text style={styles.itemTypeIcon}>{getItemTypeIcon('powerArmor')}</Text>
            </View>
          </View>
        </View>
      );
    }

    if (item.paCoreContent) {
      // Ядерный блок — статусная строка без кнопок (замена блоков автоматическая, §5.4).
      return (
        <View style={styles.tableRow}>
          <View style={styles.mainRowContent}>
            <View style={styles.itemNameContainer}>
              <Text style={styles.itemNameText}>{item.name}</Text>
              <Text style={styles.itemTypeIcon}>{getItemTypeIcon('powerArmor')}</Text>
            </View>
          </View>
        </View>
      );
    }

    // Убеждаемся, что у предмета есть itemType
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
    // Ядерный Блок: заряд стопки показываем суффиксом в имени — «Ядерный блок (7/20)».
    const coreChargeSuffix = isFusionCoreItem(item) && item.charges != null
      ? ` (${item.charges}/${item.maxCharges})`
      : '';
    // Часть силовой брони: строка прочности + «Починить» при hp < max (бесплатно — правило владельца).
    const isPAItem = item.itemType === 'powerArmor';
    const paMaxHp = isPAItem && !isPowerArmorFrame(item)
      ? PA_CATALOG_BY_ID[item.weaponId || item.id]?.hp
      : null;
    const showPARepair = Boolean(
      isPAItem && !item.isEquipped && Number.isFinite(paMaxHp) && (item.hpCurrent ?? paMaxHp) < paMaxHp,
    );
    const isEquippable = item.itemType === 'weapon' || item.itemType === 'armor' || item.itemType === 'clothing' || item.itemType === 'powerArmor';
    const isConsumable = item.itemType === 'chem' || item.itemType === 'chems' || item.itemType === 'drinks' || item.itemType === 'food';

    // Скрыть кнопку "Снять" для встроенного/манипуляторного оружия (Requirement 7.5)
    const isBuiltinOrManipulator = Boolean(item?.isBuiltin || item?.isManipulator);
    // Для роботов: скрыть кнопку "Экипировать" если нет руки с canHoldWeapons
    const hideEquipButton = isRobot
      && item.itemType === 'weapon'
      && !item.isEquipped
      && !robotHasHoldingArm
      && !isRobotLimbWeapon(item);
    // Скрыть кнопку действия для экипированного встроенного/манипуляторного оружия,
    // а также для locked-предметов (комплекты роботов — снять можно только сменой конечности).
    const hideActionButton = item.isEquipped && (
      (item.itemType === 'weapon' && isBuiltinOrManipulator)
      || item.locked
    );

    const handleActionPress = () => {
        debugLog('equip.dispatch', { id: item?.id, weaponId: item?.weaponId, itemType: item?.itemType, isEquipped: item?.isEquipped, stackKey: item?.stackKey });
        if (item.isEquipped) {
            // Надетый пакет СБ — контейнер со своими кнопками (см. ветки renderItem выше),
            // сюда через generic-строку не доходит.
            if (item.itemType === 'weapon') {
                handleUnequipWeapon(item, item.slot);
            } else {
                handleUnequipArmor(item);
            }
        } else {
            if (item.itemType === 'weapon') {
                handleEquipWeapon(item);
            } else if (item.itemType === 'powerArmor') {
                // Силовая броня — свой слой: каркас надевается пакетом, часть — в слот
                // надетого пакета. Через equippedArmor/слоты брони не проходит (план §5).
                if (isPowerArmorFrame(item)) {
                    equipPowerArmorPackage(item);
                } else {
                    equipPowerArmorPiece(item);
                }
            } else {
                handleEquipArmor(item);
            }
        }
    };
    
    const price = parseFloat(
      displayItem.cost ?? displayItem.price
    ) || 0;
    const weightRaw = displayItem.weight;
    const weight = parseFloat(String(weightRaw).replace(',', '.')) || 0;

    return (
      <View style={styles.tableRow}>
        <View style={styles.mainRowContent}>
          <View style={styles.itemNameContainer}>
            <Text style={[styles.itemNameText, item.isEquipped && styles.equippedItemText]}>{itemName}{coreChargeSuffix}</Text>
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
          {hideEquipButton && (
              <Text style={styles.itemSubText}>{tInventory('screen.alerts.manipulatorRequiredTitle')}</Text>
          )}

          {showPARepair && (
              <TouchableOpacity
                  style={[styles.actionButton, styles.applyButton]}
                  onPress={() => repairPowerArmorStack(item.id)}>
                  <Text style={styles.actionButtonText}>{tInventory('screen.actions.repair')}</Text>
              </TouchableOpacity>
          )}

          {isConsumable && !item.isEquipped && !isRobot && (
              <TouchableOpacity 
                  style={[styles.actionButton, styles.applyButton]} 
                  onPress={() => handleApplyConsumable(localizedDisplayItem)}>
                  <Text style={styles.actionButtonText}>{tInventory('screen.actions.apply')}</Text>
              </TouchableOpacity>
          )}
          {!item.isEquipped && (
              <TouchableOpacity style={[styles.actionButton, styles.sellButton]} onPress={() => handleSellItem(item)}>
                  <Text style={styles.actionButtonText}>{tInventory('screen.actions.sell')}</Text>
              </TouchableOpacity>
          )}
        </View>
        <View style={styles.itemSubRow}>
          {Number.isFinite(paMaxHp) && (
            <Text style={styles.itemSubText}>{tInventory('screen.labels.durability')}: {item.hpCurrent ?? paMaxHp}/{paMaxHp}</Text>
          )}
          <Text style={styles.itemSubText}>{tInventory('screen.labels.quantity')}: {item.isEquipped ? 1 : item.quantity} {tInventory('screen.labels.pieces')}</Text>
          <Text style={styles.itemSubText}>{tInventory('screen.labels.price')}: {item.isEquipped ? price : (price * item.quantity)}</Text>
          <Text style={styles.itemSubText}>{tInventory('screen.labels.weight')}: {item.isEquipped ? Number(weight.toFixed(3)) : Number((weight * item.quantity).toFixed(3))}</Text>
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
      const flatItem = flattenItemParams(item);
      const itemWithType = { ...flatItem, itemType: flatItem.itemType || 'weapon' };
      const modifiedItem = getModifiedItem(itemWithType);
      const displayItem = modifiedItem || flatItem;
      const weight = parseFloat(String(displayItem.weight).replace(',', '.')) || 0;
      return acc + (weight * (flatItem.quantity || 1));
    }, 0);

    equippedWeaponsForDisplay.forEach(weapon => {
      if (weapon) {
        // Получаем модифицированную версию оружия, если она есть
        const weaponWithType = {
          ...weapon,
          itemType: weapon.itemType || 'weapon'
        };
        const modifiedWeapon = getModifiedItem(weaponWithType);
        const displayWeapon = modifiedWeapon || weapon;
        
        const weightRaw = displayWeapon.weight;
        const weight = parseFloat(String(weightRaw).replace(',', '.')) || 0;
        total += weight;
      }
    });
    
    // Вес экипированной брони и одежды
    Object.values(equippedArmor).forEach(slotData => {
      if (slotData.armor) {
        const weightRaw = slotData.armor.weight;
        const weight = parseFloat(String(weightRaw).replace(',', '.')) || 0;
        total += weight;
      }
      if (slotData.clothing) {
        const weightRaw = slotData.clothing.weight;
        const weight = parseFloat(String(weightRaw).replace(',', '.')) || 0;
        total += weight;
      }
    });
    
    return Number(total.toFixed(3));
  }, [inventoryItems, equippedWeaponsForDisplay, equippedArmor, getModifiedItem]);
  
  const totalPrice = useMemo(() => {
    let total = 0;

    total += inventoryItems.reduce((acc, item) => {
      const flatItem = flattenItemParams(item);
      const itemWithType = { ...flatItem, itemType: flatItem.itemType || 'weapon' };
      const modifiedItem = getModifiedItem(itemWithType);
      const displayItem = modifiedItem || flatItem;
      const price = parseFloat(displayItem.cost ?? displayItem.price) || 0;
      return acc + (price * (flatItem.quantity || 1));
    }, 0);

    equippedWeaponsForDisplay.forEach(weapon => {
      if (weapon) {
        // Получаем модифицированную версию оружия, если она есть
        const weaponWithType = {
          ...weapon,
          itemType: weapon.itemType || 'weapon'
        };
        const modifiedWeapon = getModifiedItem(weaponWithType);
        const displayWeapon = modifiedWeapon || weapon;
        
        const price = parseFloat(displayWeapon.cost ?? displayWeapon.price) || 0;
        total += price;
      }
    });
    
    // Цена экипированной брони и одежды
    Object.values(equippedArmor).forEach(slotData => {
      if (slotData.armor) {
        const price = parseFloat(slotData.armor.cost ?? slotData.armor.price) || 0;
        total += price;
      }
      if (slotData.clothing) {
        const price = parseFloat(slotData.clothing.cost ?? slotData.clothing.price) || 0;
        total += price;
      }
    });
    
    return total;
  }, [inventoryItems, equippedWeaponsForDisplay, equippedArmor, getModifiedItem]);

  return (
    <ImageBackground
      source={require('../../../assets/bg.png')}
      style={styles.background}
      imageStyle={{ opacity: 0.3 }}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <CapsSection 
            caps={caps}
            onAdd={() => handleOpenCapsModal('add')}
            onSubtract={() => handleOpenCapsModal('subtract')}
          />
          <View style={styles.tableContainer}>
            {renderTableHeader()}
            <FlatList
              data={displayItems}
              renderItem={renderItem}
              keyExtractor={(item, index) => item.uniqueId || `${getItemName(item)}-${index}`}
              style={styles.list}
              ListEmptyComponent={<Text style={styles.emptyListText}>{tInventory('screen.labels.inventoryEmpty')}</Text>}
              ListFooterComponent={renderFooter}
            />
          </View>
          <View style={styles.summaryContainer}>
            <Text style={styles.summaryText}>{tInventory('screen.labels.totalWeight')}: {totalWeight}</Text>
            <Text style={styles.summaryText}>{tInventory('screen.labels.totalPrice')}: {totalPrice}</Text>
          </View>
        </View>
        <CapsModal
          visible={isCapsModalVisible}
          onClose={() => setIsCapsModalVisible(false)}
          onSave={handleSaveCaps}
          operationType={capsOperationType}
        />
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
          rootTitleKey={itemSelectionMode === 'buy' ? 'modals.addItemModal.buyTitle' : 'modals.addItemModal.title'}
        />
        <BuyItemModal
          visible={isBuyItemModalVisible}
          onClose={() => {
            setIsBuyItemModalVisible(false);
            setSelectedItemForBuy(null);
          }}
          item={selectedItemForBuy}
          caps={caps}
          onConfirmBuy={handleConfirmBuy}
        />

      </SafeAreaView>
    </ImageBackground>
  );
};

export default InventoryScreen; 
