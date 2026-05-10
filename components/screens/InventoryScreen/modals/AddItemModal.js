import React, { useState, useMemo, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, FlatList, SafeAreaView, TextInput, StyleSheet } from 'react-native';
import { getEquipmentCatalog } from '../../../../i18n/equipmentCatalog';
import { getWeaponById, getWeapons, getRowCount } from '../../../../db';
import { tInventory } from '../logic/inventoryI18n';
import { useLocale } from '../../../../i18n/locale';
import styles from '../../../../styles/AddItemModal.styles';

const CATEGORY_ICONS = {
  weapon: '🔫',
  armor: '🛡️',
  clothing: '👕',
  ammo: '🔹',
  food: '🍖',
  drinks: '🥤',
  chems: '💊',
  items: '🔧',
  materials: '🧰',
  robotEquipment: '🤖',
  robotWeapons: '⚙️',
  robotPlating: '🔩',
  robotArmorLayer: '🛡️',
  robotFrame: '⚙️',
  robotBodyParts: '🦾',
  robotModules: '💡',
};

const mapWeaponTypeToDbValue = {
  light: 'Light',
  heavy: 'Heavy',
  energy: 'Energy',
  melee: 'Melee',
  unarmed: 'Unarmed',
  thrown: 'Thrown',
  explosive: 'Explosive',
};

const AddItemModal = ({ visible, onClose, onSelectItem, rootTitleKey = 'modals.addItemModal.title' }) => {
  const locale = useLocale();
  const [currentPath, setCurrentPath] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [weaponsByType, setWeaponsByType] = useState({});
  const [pendingItem, setPendingItem] = useState(null);
  const [pendingQuantity, setPendingQuantity] = useState('1');

  useEffect(() => {
    let cancelled = false;

    const loadWeaponsFromDb = async () => {
      try {
        // Fallback to catalog if DB is empty (not yet seeded)
        const dbCount = await getRowCount('weapons').catch(() => 0);
        const catalog = getEquipmentCatalog(locale);

        if (!dbCount) {
          // Use catalog directly
          const grouped = {};
          const typeMap = Object.fromEntries(
            Object.entries(mapWeaponTypeToDbValue).map(([k, v]) => [v.toLowerCase(), k])
          );
          for (const weapon of catalog.weapons || []) {
            const groupKey = typeMap[(weapon.weaponType || weapon.weapon_type || '').toLowerCase()];
            if (!groupKey) continue;
            const label = tInventory(`modals.addItemModal.weaponTypeLabels.${groupKey}`);
            if (!grouped[label]) grouped[label] = [];
            grouped[label].push({ ...weapon, itemType: 'weapon' });
          }
          Object.keys(grouped).forEach((k) => grouped[k].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))));
          if (!cancelled) setWeaponsByType(grouped);
          return;
        }

        const entries = await Promise.all(
          Object.entries(mapWeaponTypeToDbValue).map(async ([groupKey, weaponType]) => {
            const weaponsByTypeList = await getWeapons(weaponType);
            const weaponIds = weaponsByTypeList.map((w) => w?.id).filter(Boolean);
            const weaponsById = await Promise.all(weaponIds.map((id) => getWeaponById(id)));
            const normalizedWeapons = weaponsById
              .filter(Boolean)
              .map((weapon) => {
                // Merge with catalog to get qualities array and other structured fields
                const catalogEntry = (catalog.weapons || []).find((w) => w.id === weapon.id);
                return {
                  ...weapon,
                  ...(catalogEntry ? { qualities: catalogEntry.qualities, damageType: catalogEntry.damageType } : {}),
                  weaponType: weapon.weapon_type || weapon.weaponType,
                  itemType: 'weapon',
                  name: weapon.name,
                };
              })
              .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
            return [groupKey, normalizedWeapons];
          })
        );

        if (cancelled) return;

        const groupedWeapons = {};
        entries.forEach(([groupKey, weapons]) => {
          if (!weapons.length) return;
          const label = tInventory(`modals.addItemModal.weaponTypeLabels.${groupKey}`);
          groupedWeapons[label] = weapons;
        });

        setWeaponsByType(groupedWeapons);
      } catch (error) {
        if (!cancelled) setWeaponsByType({});
      }
    };

    loadWeaponsFromDb();

    return () => {
      cancelled = true;
    };
  }, [locale]);

  const staticData = useMemo(() => {
    const equipmentCatalog = getEquipmentCatalog(locale);

    return {
      [tInventory('modals.addItemModal.categories.armor')]: (equipmentCatalog.armor?.armor || [])
        .reduce((acc, category) => {
          acc[category.type] = category.items;
          return acc;
        }, {}),
      [tInventory('modals.addItemModal.categories.clothing')]: (equipmentCatalog.clothes?.clothes || []).reduce((acc, category) => {
        acc[category.type] = category.items;
        return acc;
      }, {}),
      [tInventory('modals.addItemModal.categories.ammo')]: {
        [tInventory('modals.addItemModal.categories.all')]: Array.isArray(equipmentCatalog.ammoData) ? equipmentCatalog.ammoData : [],
      },
      [tInventory('modals.addItemModal.categories.drinks')]: {
        [tInventory('modals.addItemModal.categories.all')]: equipmentCatalog.drinks || [],
      },
      [tInventory('modals.addItemModal.categories.chems')]: {
        [tInventory('modals.addItemModal.categories.all')]: equipmentCatalog.chems || [],
      },
      [tInventory('modals.addItemModal.categories.food')]: {
        [tInventory('modals.addItemModal.categories.all')]: equipmentCatalog.food || [],
      },
      [tInventory('modals.addItemModal.categories.items')]: {
        [tInventory('modals.addItemModal.categories.all')]: equipmentCatalog.generalGoods || [],
      },
      [tInventory('modals.addItemModal.categories.materials')]: {
        [tInventory('modals.addItemModal.categories.all')]: [],
      },
      [tInventory('modals.addItemModal.categories.robotEquipment')]: {
        [tInventory('modals.addItemModal.categories.robotWeapons')]: equipmentCatalog.robotWeaponsOnly || [],
        [tInventory('modals.addItemModal.categories.robotPlating')]: equipmentCatalog.robotPlating || [],
        [tInventory('modals.addItemModal.categories.robotArmorLayer')]: equipmentCatalog.robotArmorLayer || [],
        [tInventory('modals.addItemModal.categories.robotFrame')]: equipmentCatalog.robotFrames || [],
        [tInventory('modals.addItemModal.categories.robotBodyParts')]: equipmentCatalog.robotBody || [],
        [tInventory('modals.addItemModal.categories.robotModules')]: equipmentCatalog.robotModules || [],
      },
    };
  }, [locale]);

  useEffect(() => {
    if (visible) {
      setCurrentPath([]);
      setSearchTerm('');
      setPendingItem(null);
      setPendingQuantity('1');
    }
  }, [visible]);

  const allData = useMemo(() => ({
    [tInventory('modals.addItemModal.categories.weapon')]: weaponsByType,
    ...staticData,
  }), [locale, weaponsByType, staticData]);

  const getTypeLabelAndIcon = (itemType) => {
    if (itemType === 'weapon') return tInventory('modals.addItemModal.itemTypes.weapon');
    if (itemType === 'armor') return tInventory('modals.addItemModal.itemTypes.armor');
    if (itemType === 'clothing' || itemType === 'outfit') return tInventory('modals.addItemModal.itemTypes.clothing');
    if (itemType === 'chem' || itemType === 'chems') return tInventory('modals.addItemModal.itemTypes.chem');
    if (itemType === 'drinks') return tInventory('modals.addItemModal.itemTypes.drinks');
    if (itemType === 'ammo') return tInventory('modals.addItemModal.itemTypes.ammo');
    if (itemType === 'plating') return tInventory('modals.addItemModal.itemTypes.plating');
    if (itemType === 'robotArmor') return tInventory('modals.addItemModal.itemTypes.robotArmor');
    if (itemType === 'robotFrame') return tInventory('modals.addItemModal.itemTypes.robotFrame');
    return '';
  };

  const unwrapSingleAllCategory = (data) => {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
    const keys = Object.keys(data);
    const allLabel = tInventory('modals.addItemModal.categories.all');
    if (keys.length === 1 && keys[0] === allLabel && Array.isArray(data[allLabel])) {
      return data[allLabel];
    }
    return data;
  };

  const handleSelect = (item) => {
    if (typeof item === 'object' && item?.name) {
      setPendingItem(item);
      setPendingQuantity('1');
      return;
    }
    setCurrentPath([...currentPath, item]);
  };

  const handleConfirmAdd = () => {
    const qty = Math.max(1, parseInt(pendingQuantity, 10) || 1);
    onSelectItem(pendingItem, qty);
    onClose();
  };

  const changeQuantity = (delta) => {
    const current = parseInt(pendingQuantity, 10) || 1;
    const next = current + delta;
    if (next >= 1) setPendingQuantity(String(next));
  };

  const currentData = useMemo(() => {
    if (searchTerm) {
      const allItems = [];
      Object.values(allData[tInventory('modals.addItemModal.categories.weapon')] || {}).forEach((items) => Array.isArray(items) && allItems.push(...items));
      Object.values(allData[tInventory('modals.addItemModal.categories.armor')] || {}).forEach((items) => Array.isArray(items) && allItems.push(...items));
      Object.values(allData[tInventory('modals.addItemModal.categories.clothing')] || {}).forEach((items) => Array.isArray(items) && allItems.push(...items));
      Object.values(allData[tInventory('modals.addItemModal.categories.robotEquipment')] || {}).forEach((items) => Array.isArray(items) && allItems.push(...items));
      const allLabel = tInventory('modals.addItemModal.categories.all');
      const categoryKeys = ['ammo', 'chems', 'drinks', 'food', 'items'].map((key) => tInventory(`modals.addItemModal.categories.${key}`));
      categoryKeys.forEach((category) => {
        if (allData[category]?.[allLabel]) {
          allItems.push(...allData[category][allLabel]);
        }
      });

      return {
        items: allItems.filter((item) => item?.name?.toLowerCase().includes(searchTerm.toLowerCase())),
      };
    }

    let data = allData;
    for (const key of currentPath) {
      if (!data || typeof data !== 'object') return { categories: [] };
      data = data[key];
    }

    data = unwrapSingleAllCategory(data);
    if (Array.isArray(data)) return { items: data };
    if (data && typeof data === 'object') return { categories: Object.keys(data) };
    return { categories: [] };
  }, [locale, allData, currentPath, searchTerm]);

  const renderItem = ({ item }) => {
    const isItem = typeof item === 'object' && item?.name;
    const itemTypeLabel = isItem ? getTypeLabelAndIcon(item.itemType) : '';

    return (
      <TouchableOpacity style={styles.itemContainer} onPress={() => handleSelect(item)}>
        <Text style={styles.itemName}>{isItem ? item.name : item}</Text>
        {!isItem && <Text style={styles.itemType}>{CATEGORY_ICONS[Object.keys(CATEGORY_ICONS).find((key) => tInventory(`modals.addItemModal.categories.${key}`) === item)] || '📁'}</Text>}
        {isItem && Boolean(itemTypeLabel) && <Text style={styles.itemType}>{itemTypeLabel}</Text>}
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <SafeAreaView style={styles.modalContent}>
          {pendingItem ? (
            <>
              <Text style={styles.title}>{pendingItem.name}</Text>
              <Text style={quantityStyles.label}>{tInventory('modals.addItemModal.quantityLabel')}</Text>
              <View style={quantityStyles.control}>
                <TouchableOpacity style={quantityStyles.button} onPress={() => changeQuantity(-1)}>
                  <Text style={quantityStyles.buttonText}>-</Text>
                </TouchableOpacity>
                <TextInput
                  style={quantityStyles.valueInput}
                  value={pendingQuantity}
                  onChangeText={setPendingQuantity}
                  keyboardType="number-pad"
                />
                <TouchableOpacity style={quantityStyles.button} onPress={() => changeQuantity(1)}>
                  <Text style={quantityStyles.buttonText}>+</Text>
                </TouchableOpacity>
              </View>
              <View style={quantityStyles.actionButtons}>
                <TouchableOpacity style={[quantityStyles.actionButton, quantityStyles.confirmButton]} onPress={handleConfirmAdd}>
                  <Text style={quantityStyles.actionButtonText}>{tInventory('modals.addItemModal.addButton')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[quantityStyles.actionButton, quantityStyles.cancelButton]} onPress={() => setPendingItem(null)}>
                  <Text style={quantityStyles.actionButtonText}>{tInventory('modals.addItemModal.cancelButton')}</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.title}>{currentPath.length > 0 ? currentPath[currentPath.length - 1] : tInventory(rootTitleKey)}</Text>

              {currentPath.length > 0 && !searchTerm && (
                <TouchableOpacity style={styles.backButton} onPress={() => setCurrentPath(currentPath.slice(0, -1))}>
                  <Text style={styles.backButtonText}>{tInventory('modals.addItemModal.back')}</Text>
                </TouchableOpacity>
              )}

              <TextInput
                style={styles.searchInput}
                placeholder={tInventory('modals.addItemModal.searchPlaceholder')}
                value={searchTerm}
                onChangeText={setSearchTerm}
              />

              <FlatList
                data={currentData.items || currentData.categories}
                renderItem={renderItem}
                keyExtractor={(item, index) => `${typeof item === 'object' ? item.name : item}-${index}`}
                ListEmptyComponent={<Text style={styles.emptyText}>{tInventory('modals.addItemModal.emptyCategory')}</Text>}
              />
              <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                <Text style={styles.closeButtonText}>{tInventory('modals.addItemModal.close')}</Text>
              </TouchableOpacity>
            </>
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const quantityStyles = StyleSheet.create({
  label: { fontSize: 16, color: '#666', marginBottom: 8, textAlign: 'center' },
  control: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: 16 },
  button: { backgroundColor: '#555', width: 45, height: 45, justifyContent: 'center', alignItems: 'center', borderRadius: 22.5 },
  buttonText: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  valueInput: { borderBottomWidth: 2, borderColor: '#333', width: 120, textAlign: 'center', fontSize: 26, fontWeight: 'bold', marginHorizontal: 20, color: '#333' },
  actionButtons: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: 24 },
  actionButton: { flex: 1, padding: 15, borderRadius: 8, alignItems: 'center', marginHorizontal: 10 },
  confirmButton: { backgroundColor: '#4CAF50' },
  cancelButton: { backgroundColor: '#f44336' },
  actionButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});

export default AddItemModal;
