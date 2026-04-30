import React, { useState, useMemo } from 'react';
import { View, Text, ImageBackground, SafeAreaView, FlatList, TouchableOpacity, Alert, Platform } from 'react-native';
import { useCharacter } from '../../CharacterContext';
import CapsModal from './modals/CapsModal';
import SellItemModal from './modals/SellItemModal';
import AddItemModal from './modals/AddItemModal';
import BuyItemModal from './modals/BuyItemModal';
import { calculateMaxHealth } from '../../../domain/characterCreation';
import { getInstantHealAmount } from '../../../domain/effects';
import { formatInventoryText, tInventory } from './logic/inventoryI18n';
import { useLocale } from '../../../i18n/locale';
import { getEquipmentCatalog } from '../../../i18n/equipmentCatalog';
import { isRobotCharacter as checkIsRobotCharacter, getBuiltinWeaponsFromSlots } from '../../../domain/robotEquip';
import styles from '../../../styles/InventoryScreen.styles';

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
    equipment, setEquipment, 
    equippedWeapons, setEquippedWeapons, 
    equippedArmor, setEquippedArmor,
    equippedRobotSlots,
    caps, setCaps,
    attributes, level,
    currentHealth, setCurrentHealth,
    applyConsumableTimedEffects,
    applyConsumableFull,
    conditions, setConditions,
    getModifiedItem,
    trait,
    origin,
  } = useCharacter();

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

  const locale = useLocale();
  const equipmentCatalog = useMemo(() => getEquipmentCatalog(locale), [locale]);

  const getItemName = (item) => item?.name || item?.id || '';
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
    const itemType = getItemType(item);
    if (itemType === 'weapon') {
      const baseWeaponId = item?.weaponId || item?.id || getItemName(item);
      return `weapon:${baseWeaponId}:mods:${getModsSignature(item)}`;
    }
    return `${itemType}:${getItemName(item)}`;
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
    if (itemType === 'misc') return '🔧';
    return '📦';
  };

  const equippedRobotBodyPart = useMemo(() => {
    const items = Array.isArray(equipment?.items) ? equipment.items : [];
    return items.find((item) => String(item?.id || '').startsWith('robot_body_') || item?.itemType === 'robotPart') || null;
  }, [equipment?.items]);

  const robotBodyPlan = trait?.modifiers?.robotBodyPlan
    || equippedRobotBodyPart?.robotBodyPlan
    || null;

  const isRobotCharacter = checkIsRobotCharacter({ origin }) || Boolean(trait?.modifiers?.isRobot || robotBodyPlan);
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
    if (!isRobotCharacter) return true;
    const slots = equippedRobotSlots || {};
    return Object.values(slots).some((slotData) => slotData?.limb?.canHoldWeapons === true);
  }, [isRobotCharacter, equippedRobotSlots]);
  const isPowerArmorItem = (item) => {
    const category = String(item?.category || item?.armorCategoryKey || '').toLowerCase();
    const name = String(getItemName(item) || '').toLowerCase();
    return category.includes('power') || name.includes('силов');
  };
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
        name: base.name || item.name || item.id,
      };
    }

    if (itemType === 'armor') {
      const base = equipmentCatalog?.armorIndex?.byId?.get(item.id);
      if (!base) return item;
      return {
        ...base,
        ...item,
        name: base.name || item.name || item.id,
      };
    }

    if (itemType === 'clothing' || itemType === 'outfit') {
      const allClothes = (equipmentCatalog?.clothes?.clothes || []).flatMap((group) => group.items || []);
      const base = allClothes.find((entry) => entry.id === item.id);
      if (!base) return item;
      return {
        ...base,
        ...item,
        name: base.name || item.name || item.id,
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
        name: base.name || item.name || item.id,
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
        name: base.name || item.name || item.id,
      };
    }

    if (itemType === 'food') {
      const base = (equipmentCatalog?.food || []).find((entry) => entry.id === item.id);
      if (!base) return item;
      return {
        ...base,
        ...item,
        name: base.name || item.name || item.id,
      };
    }

    if (itemType === 'ammo') {
      const base = (equipmentCatalog?.ammoData || []).find((entry) => entry.id === item.id);
      if (!base) return item;
      return {
        ...base,
        ...item,
        name: base.name || item.name || item.id,
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
      name: base.name || item.name || item.id,
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
      if (isRobotCharacter) {
        showAlert(tInventory('screen.alerts.robotCannotSelfUseTitle', 'Ограничение робота'), tInventory('screen.alerts.robotCannotSelfUseMessage', 'Роботы не могут применять еду, напитки и препараты на себя.'));
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
        showAlert(tInventory('screen.alerts.conditionsRemovedTitle', 'Снято состояние'), tInventory('screen.alerts.conditionsRemovedMessage', 'Снято: {{conditions}}', { conditions: conditionsRemoved.join(', ') }));
      }

      // Результат броска на зависимость
      if (addictionResult) {
        const { effectCount, faces, addicted, addictionLevel } = addictionResult;
        const facesText = faces.join(', ');
        showAlert(
          tInventory('screen.alerts.addictionRollTitle', 'Бросок на зависимость'),
          tInventory('screen.alerts.addictionRollMessage', 'Брошено: {{faces}} — {{effectCount}} эффект(ов) из {{addictionLevel}} нужных.', { faces: facesText, effectCount, addictionLevel })
        );
        if (addicted) {
          showAlert(tInventory('screen.alerts.addictionGainedTitle', 'Зависимость'), tInventory('screen.alerts.addictionGainedMessage', 'Вы стали зависимы от этого препарата.'));
        } else {
          showAlert(tInventory('screen.alerts.addictionAvoidedTitle', 'Зависимость'), tInventory('screen.alerts.addictionAvoidedMessage', 'Зависимость не наступила.'));
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
    const newItems = [...(equipment?.items || [])];
    const targetName = getItemName(itemToRemove);
    const targetId = itemToRemove.id || itemToRemove.code;
    const itemIndex = newItems.findIndex(i => {
      if (targetId && (i.id || i.code)) {
        return (i.id || i.code) === targetId;
      }
      return getItemName(i) === targetName;
    });
    
    console.log('[handleRemoveItem] START:', {
      targetName,
      targetId,
      itemIndex,
      found: itemIndex > -1,
      items: newItems.map(i => ({ name: getItemName(i), id: i.id || i.code, itemType: i.itemType, quantity: i.quantity })),
      itemToRemove: {
        name: getItemName(itemToRemove),
        id: itemToRemove.id || itemToRemove.code,
        itemType: itemToRemove.itemType,
      },
    });
    
    if (itemIndex > -1) {
      // Получаем модифицированную версию предмета, если она есть
      const itemWithType = {
        ...newItems[itemIndex],
        itemType: newItems[itemIndex].itemType || 'weapon'
      };
      const modifiedItem = getModifiedItem(itemWithType);
      
      console.log('[handleRemoveItem] MODIFIED ITEM:', {
        original: newItems[itemIndex],
        modified: modifiedItem,
      });
      
      // Обновляем предмет в инвентаре на модифицированную версию (копируем, чтобы не мутировать оригинал)
      newItems[itemIndex] = { ...modifiedItem, quantity: (modifiedItem.quantity ?? newItems[itemIndex].quantity) - quantity };
      
      if (newItems[itemIndex].quantity <= 0) {
        console.log('[handleRemoveItem] REMOVING ITEM (qty 0):', newItems[itemIndex]);
        newItems.splice(itemIndex, 1);
      } else {
        console.log('[handleRemoveItem] UPDATED ITEM:', newItems[itemIndex]);
      }
      updateInventoryItems(newItems);
    } else {
      console.log('[handleRemoveItem] ITEM NOT FOUND');
    }
  };

  const handleSellItem = (item) => {
    setSelectedItemForSale(item);
    setIsSellModalVisible(true);
  };

  const handleConfirmSale = (quantity, finalPrice) => {
    setCaps(prev => prev + finalPrice);

    const newItems = [...(equipment?.items || [])];
    const itemIndex = newItems.findIndex(i => getItemName(i) === getItemName(selectedItemForSale));

    if (itemIndex > -1) {
      // Получаем модифицированную версию предмета, если она есть
      const itemWithType = {
        ...newItems[itemIndex],
        itemType: newItems[itemIndex].itemType || 'weapon'
      };
      const modifiedItem = getModifiedItem(itemWithType);
      
      // Обновляем предмет в инвентаре на модифицированную версию
      newItems[itemIndex] = modifiedItem;
      newItems[itemIndex].quantity -= quantity;
      
      if (newItems[itemIndex].quantity <= 0) {
        newItems.splice(itemIndex, 1);
      }
    }
    
    setEquipment(prev => ({ ...prev, items: newItems }));
    setIsSellModalVisible(false);
    setSelectedItemForSale(null);
  };
    
  // NOTE: This function is no longer needed for weight/price, 
  // but let's keep it for direct inventory modification like selling.
  const updateInventoryItems = (newItems) => {
    setEquipment(prev => ({
        ...(prev || {}),
        items: newItems,
    }));
  }

  const handleAddItem = (item, quantity = 1) => {
    const newItems = equipment?.items ? [...equipment.items] : [];
    const stackKey = getStackKey(item);
    const existingItemIndex = newItems.findIndex(existingItem => (existingItem.stackKey || getStackKey(existingItem)) === stackKey);

    if (existingItemIndex > -1) {
        newItems[existingItemIndex].quantity += quantity;
    } else {
        // Убеждаемся, что у предмета есть itemType и локализация
        const localizedItem = resolveLocalizedItem(item);
        const itemWithType = {
          ...localizedItem,
          itemType: getItemType(localizedItem),
          stackKey,
          quantity
        };
        newItems.push(itemWithType);
    }
    updateInventoryItems(newItems);
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
    
    if (isRobotCharacter && isRobotOnlyItem(displayWeapon) && Array.isArray(robotBodyUpgrade?.allowedRobotWeaponIds)) {
      const allowedWeaponIds = robotBodyUpgrade.allowedRobotWeaponIds;
      if (displayWeapon?.id && !allowedWeaponIds.includes(displayWeapon.id)) {
        showAlert(
          tInventory('screen.alerts.robotBodyWeaponMismatchTitle'),
          tInventory('screen.alerts.robotBodyWeaponMismatchMessage')
        );
        return;
      }
    }

    if (isRobotOnlyItem(displayWeapon) && !isRobotCharacter) {
      showAlert(tInventory('screen.alerts.robotOnlyWeaponTitle', 'Ограничение экипировки'), tInventory('screen.alerts.robotOnlyWeaponMessage', 'Это оружие могут использовать только роботы.'));
      return;
    }
    if (isRobotCharacter && isRobotLimbWeapon(displayWeapon)) {
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
      const totalOwned = equipment.items.find(i => (i.stackKey || getStackKey(i)) === sourceStackKey)?.quantity || 0;
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

      const newItems = equipment?.items ? [...equipment.items] : [];
      const itemIndex = newItems.findIndex(i => (i.stackKey || getStackKey(i)) === sourceStackKey);
      if (itemIndex !== -1) {
        newItems[itemIndex].quantity -= 1;
        if (newItems[itemIndex].quantity <= 0) newItems.splice(itemIndex, 1);
        updateInventoryItems(newItems);
      }
      return;
    }
    if (!isRobotOnlyItem(displayWeapon) && isRobotCharacter) {
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
      const totalOwned = equipment.items.find(i => (i.stackKey || getStackKey(i)) === sourceStackKey)?.quantity || 0;
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

      const newItems = equipment?.items ? [...equipment.items] : [];
      const itemIndex = newItems.findIndex(i => (i.stackKey || getStackKey(i)) === sourceStackKey);
      if (itemIndex !== -1) {
        newItems[itemIndex].quantity -= 1;
        if (newItems[itemIndex].quantity <= 0) {
          newItems.splice(itemIndex, 1);
        }
        updateInventoryItems(newItems);
      }
      return;
    }

    const sourceStackKey = weaponToEquip.stackKey || getStackKey(displayWeapon);
    
    // Проверяем количество этого конкретного предмета в инвентаре
    const totalOwned = equipment.items.find(i => (i.stackKey || getStackKey(i)) === sourceStackKey)?.quantity || 0;
    if (totalOwned <= 0) {
        showAlert(tInventory('screen.alerts.noItemsTitle'), tInventory('screen.alerts.noItemsMessage'));
        return;
    }

    const weaponEntry = {
      ...displayWeapon,
      itemType: 'weapon',
      stackKey: sourceStackKey,
      uniqueId: displayWeapon.uniqueId || createWeaponInstanceId(),
    };

    setEquippedWeapons(prev => [...prev, weaponEntry]);

    // Уменьшаем количество предмета в инвентаре
    const newItems = equipment?.items ? [...equipment.items] : [];
    const itemIndex = newItems.findIndex(i => (i.stackKey || getStackKey(i)) === sourceStackKey);

    if (itemIndex !== -1) {
      newItems[itemIndex].quantity -= 1;

      // Если количество стало 0, удаляем предмет из инвентаря
      if (newItems[itemIndex].quantity <= 0) {
        newItems.splice(itemIndex, 1);
      }

      updateInventoryItems(newItems);
    }
  };

  const handleUnequipWeapon = (weapon, slot) => {
    // Кнопка "Снять" скрыта/неактивна для встроенного и манипуляторного оружия (Requirement 7.5)
    if (weapon?.isBuiltin || weapon?.isManipulator) {
      return;
    }
    setEquippedWeapons(prev => {
        const newEquipped = [...prev];
        if (newEquipped[slot] && (
          newEquipped[slot].uniqueId === weapon.uniqueId ||
          getItemName(newEquipped[slot]) === getItemName(weapon)
        )) {
            // Проверяем, является ли это модифицированным оружием
            // Считаем оружие модифицированным если у него есть uniqueId с 'modified-' ИЛИ есть _installedMods (новая система слотов)
            // Добавляем снятое оружие обратно в инвентарь
            const newItems = equipment?.items ? [...equipment.items] : [];
            const stackKey = newEquipped[slot].stackKey || getStackKey(newEquipped[slot]);
            const originalWeaponIndex = newItems.findIndex(item => (item.stackKey || getStackKey(item)) === stackKey);

            if (originalWeaponIndex !== -1) {
              newItems[originalWeaponIndex].quantity += 1;
            } else {
              const weaponToAdd = {
                ...newEquipped[slot],
                quantity: 1,
                itemType: getItemType(newEquipped[slot]),
                stackKey,
                uniqueId: undefined,
              };
              newItems.push(weaponToAdd);
            }
            
            updateInventoryItems(newItems);
            
            newEquipped[slot] = null;
            

        }
        return newEquipped;
    });
  };

  const handleEquipArmor = (itemToEquip) => {
    const currentEquipped = equippedArmor;
    if (isRobotCharacter && !isRobotOnlyItem(itemToEquip)) {
      showAlert(tInventory('screen.alerts.robotArmorOnlyTitle', 'Ограничение экипировки'), tInventory('screen.alerts.robotArmorOnlyMessage', 'Роботы не могут экипировать типовую или силовую броню.'));
      return;
    }
    if (isRobotCharacter && isPowerArmorItem(itemToEquip)) {
      showAlert(tInventory('screen.alerts.robotArmorOnlyTitle', 'Ограничение экипировки'), tInventory('screen.alerts.robotArmorOnlyMessage', 'Роботы не могут экипировать типовую или силовую броню.'));
      return;
    }
    const canWearUnderArmor = itemToEquip.itemType === 'clothing' && (
      itemToEquip.allowsArmor === true || itemToEquip.clothingType === 'suit'
    );
    const targetSlotType = canWearUnderArmor ? 'clothing' : 'armor';
    const equippedInstances = collectEquippedArmorInstances(currentEquipped);
    const ownedCount = equipment?.items?.find((i) => (i.stackKey || getStackKey(i)) === (itemToEquip.stackKey || getStackKey(itemToEquip)))?.quantity || 0;
    const equippedCount = Array.from(equippedInstances.values()).filter((entry) => {
      if (itemToEquip.itemType === 'armor' || itemToEquip.itemType === 'clothing' || itemToEquip.itemType === 'outfit') {
        return entry.stackKey === (itemToEquip.stackKey || getStackKey(itemToEquip));
      }
      return false;
    }).length;

    if (ownedCount <= equippedCount) {
      showAlert(tInventory('screen.alerts.noItemsTitle'), tInventory('screen.alerts.noItemsMessage'));
      return;
    }

    const executeEquip = (slotsToOccupy) => {
      const instancesToUnequip = new Set();
      const itemType = itemToEquip.itemType;
      const markForUnequip = (slot, type) => {
        const slotItem = currentEquipped?.[slot]?.[type];
        if (!slotItem) return;
        instancesToUnequip.add(getArmorInstanceKey(slotItem, slot, type));
      };

      if (itemType === 'clothing') {
          if (canWearUnderArmor) {
            slotsToOccupy.forEach(slot => {
                if (currentEquipped[slot].clothing) markForUnequip(slot, 'clothing');
            });
          } else {
            slotsToOccupy.forEach(slot => {
                if (currentEquipped[slot].clothing) markForUnequip(slot, 'clothing');
                if (currentEquipped[slot].armor) markForUnequip(slot, 'armor');
            });
          }
      } else if (itemType === 'armor') {
          slotsToOccupy.forEach(slot => {
              if (currentEquipped[slot].armor) markForUnequip(slot, 'armor');
          });
      } else if (itemType === 'outfit') {
          slotsToOccupy.forEach(slot => {
              if (currentEquipped[slot].clothing) markForUnequip(slot, 'clothing');
              if (currentEquipped[slot].armor) markForUnequip(slot, 'armor');
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
          if (typeof window !== 'undefined' && window.confirm) {
              if (window.confirm(tInventory('screen.alerts.replaceEquipmentConfirm'))) {
                  performEquip();
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
  
  const displayItems = useMemo(() => {
    if (!equipment?.items) return [];

    const equippedItemsList = [];
    (equippedWeapons || []).forEach((w, i) => {
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

    const inventoryItemsList = (equipment.items || [])
        .map(item => {
            const itemName = getItemName(item);
            
            // Скрываем предметы-конечности из инвентаря для роботов (Requirement 7.1)
            if (isRobotCharacter && isRobotLimbItem(item)) {
              return null;
            }

            // Проверяем, является ли это модифицированным оружием
            // Если у предмета есть uniqueId, начинающийся с 'modified-', то это модифицированное оружие
            const itemStackKey = item.stackKey || getStackKey(item);
            
            // Используем сам предмет как displayItem
            const displayItem = item;
            
            // Подсчитываем экипированные предметы
            const equippedCount = equippedItemsList.filter(equippedItem => {
                const equippedName = getItemName(equippedItem);
                const itemName = getItemName(displayItem);
                if (isWeaponItem(displayItem) && isWeaponItem(equippedItem)) {
                  return (equippedItem.stackKey || getStackKey(equippedItem)) === itemStackKey;
                }
                return (equippedItem.stackKey || getStackKey(equippedItem)) === itemStackKey || equippedName === itemName;
            }).length;
            

            
            const remainingQuantity = item.quantity - equippedCount;

            if (remainingQuantity > 0) {
                return {
                    ...displayItem,
                    itemType: getItemType(item),
                    stackKey: itemStackKey,
                    quantity: remainingQuantity,
                    isEquipped: false,
                    uniqueId: item.uniqueId || `inv-stack-${itemStackKey}`
                };
            }
            return null;
        })
        .filter(Boolean);

    const result = [...equippedItemsList, ...inventoryItemsList];

    return result;
  }, [equipment, equippedWeapons, equippedArmor, getModifiedItem, isRobotCharacter]);

  const renderTableHeader = () => {
    return (
      <View style={styles.tableHeader}>
        <Text style={[styles.headerText, { flex: 0.7 }]}>{tInventory('screen.labels.item')}</Text>
        <Text style={[styles.headerText, { flex: 0.3, textAlign: 'center' }]}>{tInventory('screen.labels.action')}</Text>
      </View>
    );
  };

  const renderItem = ({ item }) => {
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
    const isEquippable = item.itemType === 'weapon' || item.itemType === 'armor' || item.itemType === 'clothing';
    const isConsumable = item.itemType === 'chem' || item.itemType === 'chems' || item.itemType === 'drinks' || item.itemType === 'food';

    // Скрыть кнопку "Снять" для встроенного/манипуляторного оружия (Requirement 7.5)
    const isBuiltinOrManipulator = Boolean(item?.isBuiltin || item?.isManipulator);
    // Для роботов: скрыть кнопку "Экипировать" если нет руки с canHoldWeapons
    const hideEquipButton = isRobotCharacter
      && item.itemType === 'weapon'
      && !item.isEquipped
      && !robotHasHoldingArm
      && !isRobotLimbWeapon(item);
    // Скрыть кнопку действия для экипированного встроенного/манипуляторного оружия
    const hideActionButton = item.isEquipped && item.itemType === 'weapon' && isBuiltinOrManipulator;

    const handleActionPress = () => {
        if (item.isEquipped) {
            if (item.itemType === 'weapon') {
                handleUnequipWeapon(item, item.slot);
            } else {
                handleUnequipArmor(item);
            }
        } else {
            if (item.itemType === 'weapon') {
                handleEquipWeapon(item);
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
            <Text style={[styles.itemNameText, item.isEquipped && styles.equippedItemText]}>{itemName}</Text>
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

          {isConsumable && !item.isEquipped && !isRobotCharacter && (
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
    
    // Вес предметов в инвентаре
    if (equipment?.items) {
      total += equipment.items.reduce((acc, item) => {
        // Получаем модифицированную версию предмета, если она есть
        const itemWithType = {
          ...item,
          itemType: item.itemType || 'weapon'
        };
        const modifiedItem = getModifiedItem(itemWithType);
        const displayItem = modifiedItem || item;
        
        const weightRaw = displayItem.weight;
        const weight = parseFloat(String(weightRaw).replace(',', '.')) || 0;
        return acc + (weight * item.quantity);
      }, 0);
    }
    
    // Вес экипированного оружия
    equippedWeapons.forEach(weapon => {
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
  }, [equipment, equippedWeapons, equippedArmor, getModifiedItem]);
  
  const totalPrice = useMemo(() => {
    let total = 0;
    
    // Цена предметов в инвентаре
    if (equipment?.items) {
      total += equipment.items.reduce((acc, item) => {
        // Получаем модифицированную версию предмета, если она есть
        const itemWithType = {
          ...item,
          itemType: item.itemType || 'weapon'
        };
        const modifiedItem = getModifiedItem(itemWithType);
        const displayItem = modifiedItem || item;
        
        const price = parseFloat(
          displayItem.cost ?? displayItem.price
        ) || 0;
        return acc + (price * item.quantity);
      }, 0);
    }
    
    // Цена экипированного оружия
    equippedWeapons.forEach(weapon => {
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
  }, [equipment, equippedWeapons, equippedArmor, getModifiedItem]);

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
