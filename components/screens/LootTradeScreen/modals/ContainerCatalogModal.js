import React, { useState, useMemo, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  SafeAreaView,
  TextInput,
  StyleSheet,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getEquipmentCatalog } from '../../../../i18n/equipmentCatalog';
import { getWeaponById, getWeapons, getRowCount } from '../../../../db';
import { tInventory, formatInventoryText } from '../../InventoryScreen/logic/inventoryI18n';
import { tLootTrade } from '../logic/lootTradeI18n';
import { useLocale, useModuleLocale } from '../../../../i18n/locale';
import addStyles from '../../../../styles/AddItemModal.styles';
import { describeItemBasics } from '../../../../domain/itemBasics';
import EquipmentFilterModal from '../../../../modules/fallout/screens/InventoryScreen/modals/EquipmentFilterModal';
import {
  buildEquipmentFilterOptions,
  emptyEquipmentFilter,
  activeEquipmentFilterCount,
  countFoundItems,
  isEquipmentFilterEmpty,
  pruneTreeByEquipmentFilter,
} from '../../../../modules/fallout/logic/equipmentFilter';
import ContainerItemConfigModal from './ContainerItemConfigModal';

const CATEGORY_ICONS = {
  weapon: '🔫',
  armor: '🛡️',
  powerArmor: '⚡',
  clothing: '👕',
  ammo: '🔹',
  food: '🍖',
  drinks: '🥤',
  chems: '💊',
  items: '🔧',
  materials: '🧰',
  junk: '🗑️',
  robotEquipment: '🤖',
  homebrew: '🛠️',
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

const ContainerCatalogModal = ({
  visible,
  isMerchant = false,
  merchantSaleMarkupPercent = 0,
  feedbackMessage = '',
  onPickConfiguredItem,
  onClose,
}) => {
  const engineLocale = useLocale();
  const moduleLocale = useModuleLocale();
  const [currentPath, setCurrentPath] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [weaponsByType, setWeaponsByType] = useState({});
  const [equipmentFilter, setEquipmentFilter] = useState(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [configuringItem, setConfiguringItem] = useState(null);

  useEffect(() => {
    if (visible) {
      setCurrentPath([]);
      setSearchTerm('');
      setEquipmentFilter(null);
      setFilterOpen(false);
      setConfiguringItem(null);
    }
  }, [visible]);

  useEffect(() => {
    let cancelled = false;

    const loadWeaponsFromDb = async () => {
      try {
        const dbCount = await getRowCount('weapons').catch(() => 0);
        const catalog = getEquipmentCatalog(moduleLocale);

        if (!dbCount) {
          const grouped = {};
          const typeMap = Object.fromEntries(
            Object.entries(mapWeaponTypeToDbValue).map(([k, v]) => [v.toLowerCase(), k]),
          );
          for (const weapon of catalog.weapons || []) {
            if (weapon?.isPackItem) continue;
            const groupKey = typeMap[(weapon.weaponType || '').toLowerCase()];
            if (!groupKey) continue;
            const label = tInventory(`modals.addItemModal.weaponTypeLabels.${groupKey}`);
            if (!grouped[label]) grouped[label] = [];
            grouped[label].push({ ...weapon, itemType: 'weapon' });
          }
          Object.keys(grouped).forEach((k) => (
            grouped[k].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
          ));
          if (!cancelled) setWeaponsByType(grouped);
          return;
        }

        const entries = await Promise.all(
          Object.entries(mapWeaponTypeToDbValue).map(async ([groupKey, weaponType]) => {
            const list = await getWeapons(weaponType);
            const ids = list.map((w) => w?.id).filter(Boolean);
            const full = await Promise.all(ids.map((id) => getWeaponById(id)));
            const normalized = full
              .filter(Boolean)
              .map((weapon) => {
                const catEntry = (catalog.weapons || []).find((w) => w.id === weapon.id);
                return {
                  ...weapon,
                  ...(catEntry ?? {}),
                  itemType: 'weapon',
                  name: weapon.name ?? catEntry?.name,
                };
              })
              .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
            return [groupKey, normalized];
          }),
        );

        if (cancelled) return;
        const groupedWeapons = {};
        entries.forEach(([groupKey, weapons]) => {
          if (!weapons.length) return;
          const label = tInventory(`modals.addItemModal.weaponTypeLabels.${groupKey}`);
          groupedWeapons[label] = weapons;
        });
        setWeaponsByType(groupedWeapons);
      } catch {
        if (!cancelled) setWeaponsByType({});
      }
    };

    loadWeaponsFromDb();
    return () => { cancelled = true; };
  }, [engineLocale, moduleLocale]);

  const staticData = useMemo(() => {
    const equipmentCatalog = getEquipmentCatalog(moduleLocale);
    const allKey = tInventory('modals.addItemModal.categories.all');

    return {
      [tInventory('modals.addItemModal.categories.armor')]: (equipmentCatalog.armor?.armor || [])
        .reduce((acc, cat) => {
          acc[cat.type] = (cat.items || []).map((x) => ({ ...x, itemType: x.itemType || 'armor' }));
          return acc;
        }, {}),
      [tInventory('modals.addItemModal.categories.powerArmor')]: (equipmentCatalog.powerArmor?.powerArmor || [])
        .reduce((acc, cat) => {
          acc[cat.type] = (cat.items || []).map((x) => ({ ...x, itemType: 'powerArmor' }));
          return acc;
        }, {}),
      [tInventory('modals.addItemModal.categories.clothing')]: (equipmentCatalog.clothes?.clothes || [])
        .reduce((acc, cat) => {
          acc[cat.type] = (cat.items || []).map((x) => ({ ...x, itemType: x.itemType || 'clothing' }));
          return acc;
        }, {}),
      [tInventory('modals.addItemModal.categories.ammo')]: {
        [allKey]: (equipmentCatalog.ammoTypes || []).map((x) => ({ ...x, itemType: 'ammo' })),
      },
      [tInventory('modals.addItemModal.categories.drinks')]: {
        [allKey]: (equipmentCatalog.drinks || []).map((x) => ({ ...x, itemType: 'drinks' })),
      },
      [tInventory('modals.addItemModal.categories.chems')]: {
        [allKey]: (equipmentCatalog.chems || []).map((x) => ({ ...x, itemType: 'chem' })),
      },
      [tInventory('modals.addItemModal.categories.food')]: {
        [allKey]: (equipmentCatalog.food || []).map((x) => ({ ...x, itemType: 'food' })),
      },
      [tInventory('modals.addItemModal.categories.magazines')]: {
        [allKey]: (equipmentCatalog.magazines || []).map((x) => ({ ...x, itemType: 'magazine' })),
      },
      [tInventory('modals.addItemModal.categories.items')]: {
        [allKey]: (equipmentCatalog.generalGoods || []).map((x) => ({ ...x, itemType: x.itemType || 'misc' })),
      },
      [tInventory('modals.addItemModal.categories.materials')]: {
        [allKey]: (equipmentCatalog.materials || []).map((x) => ({ ...x, itemType: x.itemType || 'materials' })),
      },
      [tInventory('modals.addItemModal.categories.junk')]: {
        [allKey]: (equipmentCatalog.junk || []).map((x) => ({ ...x, itemType: 'junk' })),
      },
      [tInventory('modals.addItemModal.categories.robotEquipment')]: {
        [tInventory('modals.addItemModal.categories.robotWeapons')]: (equipmentCatalog.robotWeaponsOnly || []).map((x) => ({ ...x, itemType: 'weapon' })),
        [tInventory('modals.addItemModal.categories.robotPlating')]: equipmentCatalog.robotPlating || [],
        [tInventory('modals.addItemModal.categories.robotArmorLayer')]: equipmentCatalog.robotArmorLayer || [],
        [tInventory('modals.addItemModal.categories.robotFrame')]: equipmentCatalog.robotFrames || [],
        [tInventory('modals.addItemModal.categories.robotBodyParts')]: equipmentCatalog.robotBody || [],
        [tInventory('modals.addItemModal.categories.robotModules')]: equipmentCatalog.robotModules || [],
        [tInventory('modals.addItemModal.categories.robotMisc')]: equipmentCatalog.robotItems || [],
      },
    };
  }, [engineLocale, moduleLocale]);

  const packData = useMemo(() => {
    const catalog = getEquipmentCatalog(moduleLocale);
    const weaponKeyByType = Object.fromEntries(
      Object.entries(mapWeaponTypeToDbValue).map(([k, v]) => [v, k]),
    );
    const groups = {};
    for (const w of (catalog.weapons || []).filter((x) => x?.isPackItem)) {
      const key = weaponKeyByType[w.weaponType];
      if (!key) continue;
      const label = tInventory(`modals.addItemModal.weaponTypeLabels.${key}`);
      (groups[label] ??= []).push({ ...w, itemType: 'weapon' });
    }
    const packRobotWeapons = (catalog.robotWeaponsOnly || [])
      .filter((x) => x?.isPackItem)
      .map((w) => ({ ...w, itemType: 'weapon' }));
    if (packRobotWeapons.length) {
      groups[tInventory('modals.addItemModal.categories.robotWeapons')] = packRobotWeapons;
    }
    const packAmmo = (catalog.ammoTypes || [])
      .filter((x) => x?.isPackItem)
      .map((a) => ({ ...a, itemType: 'ammo' }));
    if (packAmmo.length) {
      groups[tInventory('modals.addItemModal.categories.ammo')] = packAmmo;
    }
    Object.keys(groups).forEach((k) => (
      groups[k].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
    ));
    return Object.keys(groups).length === 0
      ? {}
      : { [tInventory('modals.addItemModal.categories.homebrew')]: groups };
  }, [engineLocale, moduleLocale]);

  const allData = useMemo(() => ({
    [tInventory('modals.addItemModal.categories.weapon')]: weaponsByType,
    ...staticData,
    ...packData,
  }), [weaponsByType, staticData, packData]);

  const filteredData = useMemo(() => (
    isEquipmentFilterEmpty(equipmentFilter)
      ? allData
      : pruneTreeByEquipmentFilter(allData, equipmentFilter)
  ), [allData, equipmentFilter]);

  const filterOptions = useMemo(() => {
    const labels = {
      kinds: {
        weapon: tInventory('modals.addItemModal.categories.weapon'),
        armor: tInventory('modals.addItemModal.categories.armor'),
        powerArmor: tInventory('modals.addItemModal.categories.powerArmor'),
        clothing: tInventory('modals.addItemModal.categories.clothing'),
      },
      ammoNames: (getEquipmentCatalog(moduleLocale).ammoTypes ?? []).map((row) => ({
        id: row.id,
        name: row.name,
      })),
      damageTypes: tInventory('modals.addItemModal.filter.damageTypes'),
      weaponTypes: tInventory('modals.addItemModal.filter.weaponTypes'),
      distances: tInventory('modals.addItemModal.filter.distances'),
      bodyParts: tInventory('modals.addItemModal.filter.bodyPartsDict'),
    };
    return buildEquipmentFilterOptions(moduleLocale, labels);
  }, [moduleLocale, engineLocale]);

  const activeFilterCount = activeEquipmentFilterCount(equipmentFilter);
  const filterActive = !isEquipmentFilterEmpty(equipmentFilter);
  const filterLabels = useMemo(() => ({
    gear: ['weapon', 'armor', 'powerArmor', 'clothing'].map((key) => tInventory(`modals.addItemModal.categories.${key}`)),
  }), [engineLocale]);
  const foundCount = useMemo(
    () => countFoundItems(filteredData, filterLabels, filterActive),
    [filteredData, filterLabels, filterActive],
  );

  const unwrapSingleAllCategory = (data) => {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
    const keys = Object.keys(data);
    const allLabel = tInventory('modals.addItemModal.categories.all');
    if (keys.length === 1 && keys[0] === allLabel && Array.isArray(data[allLabel])) {
      return data[allLabel];
    }
    return data;
  };

  const looseCapsSpecialItem = useMemo(() => ({
    id: 'caps',
    itemId: 'caps',
    itemType: 'caps',
    name: tLootTrade('catalog.looseCapsName'),
    cost: 1,
    weight: 0,
    __isLooseCaps: true,
  }), [engineLocale]);

  const listEntries = useMemo(() => {
    if (searchTerm || filterActive) {
      const allItems = [];
      const gearGroupKeys = ['weapon', 'armor', 'powerArmor', 'clothing'];
      const groupKeys = filterActive ? gearGroupKeys : [...gearGroupKeys, 'robotEquipment'];
      groupKeys.forEach((key) => {
        const group = filteredData[tInventory(`modals.addItemModal.categories.${key}`)] || {};
        Object.values(group).forEach((items) => Array.isArray(items) && allItems.push(...items));
      });
      const allLabel = tInventory('modals.addItemModal.categories.all');
      const flatKeys = filterActive
        ? []
        : ['ammo', 'chems', 'drinks', 'food', 'magazines', 'items', 'materials', 'junk']
            .map((key) => tInventory(`modals.addItemModal.categories.${key}`));
      flatKeys.forEach((cat) => {
        if (filteredData[cat]?.[allLabel]) {
          allItems.push(...filteredData[cat][allLabel]);
        }
      });

      const needle = searchTerm.toLowerCase();
      const visibleItems = allItems.filter((item) => !searchTerm || item?.name?.toLowerCase().includes(needle));
      visibleItems.sort((a, b) => String(a?.name ?? '').localeCompare(String(b?.name ?? '')));
      return visibleItems;
    }

    let data = filteredData;
    for (const key of currentPath) {
      if (!data || typeof data !== 'object') return [];
      data = data[key];
    }
    data = unwrapSingleAllCategory(data);
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') {
      const cats = Object.keys(data);
      return !isMerchant && currentPath.length === 0
        ? [looseCapsSpecialItem, ...cats]
        : cats;
    }
    return [];
  }, [
    engineLocale,
    filteredData,
    currentPath,
    searchTerm,
    filterActive,
    isMerchant,
    looseCapsSpecialItem,
  ]);

  const renderEntry = ({ item }) => {
    const isItemObject = typeof item === 'object' && item?.name;

    if (!isItemObject) {
      const iconKey = Object.keys(CATEGORY_ICONS).find(
        (key) => tInventory(`modals.addItemModal.categories.${key}`) === item,
      );
      return (
        <TouchableOpacity
          style={addStyles.itemContainer}
          onPress={() => setCurrentPath([...currentPath, item])}
        >
          <Text style={addStyles.itemName}>{item}</Text>
          <Text style={addStyles.itemType}>{CATEGORY_ICONS[iconKey] || '📁'}</Text>
        </TouchableOpacity>
      );
    }

    const basicsLine = item.__isLooseCaps
      ? tLootTrade('catalog.looseCapsSub')
      : describeItemBasics(item, moduleLocale);

    return (
      <View style={[addStyles.itemContainer, localStyles.itemRowWithBtn]}>
        <View style={localStyles.itemInfoCol}>
          <Text style={addStyles.itemName}>
            {item.__isLooseCaps ? `💰 ${item.name}` : item.name}
          </Text>
          {Boolean(basicsLine) && <Text style={addStyles.itemBasics}>{basicsLine}</Text>}
        </View>
        <TouchableOpacity
          style={localStyles.chooseBtn}
          onPress={() => setConfiguringItem(item)}
        >
          <Text style={localStyles.chooseBtnText}>{tLootTrade('catalog.chooseButton')}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={addStyles.modalContainer}>
        <SafeAreaView style={addStyles.modalContent}>
          <Text style={addStyles.title}>
            {currentPath.length > 0 && !searchTerm && !filterActive
              ? currentPath[currentPath.length - 1]
              : (filterActive
                ? formatInventoryText(tInventory('modals.addItemModal.filter.resultsFound'), { n: foundCount })
                : tLootTrade(isMerchant ? 'catalog.titleMerchant' : 'catalog.titleLoot'))}
          </Text>

          {Boolean(feedbackMessage) && (
            <View style={localStyles.feedbackBanner}>
              <Text style={localStyles.feedbackText}>{feedbackMessage}</Text>
            </View>
          )}

          {currentPath.length > 0 && !searchTerm && !filterActive && (
            <TouchableOpacity
              style={addStyles.backButton}
              onPress={() => setCurrentPath(currentPath.slice(0, -1))}
            >
              <Text style={addStyles.backButtonText}>{tLootTrade('catalog.back')}</Text>
            </TouchableOpacity>
          )}

          <View style={addStyles.filterToolbar}>
            <TextInput
              style={[addStyles.searchInput, addStyles.searchInputInToolbar]}
              placeholder={tInventory('modals.addItemModal.searchPlaceholder')}
              value={searchTerm}
              onChangeText={setSearchTerm}
            />
            <TouchableOpacity
              style={addStyles.filterToggle}
              onPress={() => setFilterOpen((prev) => !prev)}
            >
              <MaterialCommunityIcons name="filter" style={addStyles.filterIcon} />
              {activeFilterCount > 0 && (
                <View style={addStyles.filterBadge}>
                  <Text style={addStyles.filterBadgeText}>{activeFilterCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          <View style={addStyles.listDivider} />

          <FlatList
            data={listEntries}
            renderItem={renderEntry}
            keyExtractor={(item, index) => `${typeof item === 'object' ? (item.id || item.name) : item}-${index}`}
            ListEmptyComponent={
              <Text style={addStyles.emptyText}>{tInventory('modals.addItemModal.emptyCategory')}</Text>
            }
          />

          <TouchableOpacity style={addStyles.closeButton} onPress={onClose}>
            <Text style={addStyles.closeButtonText}>{tLootTrade('catalog.close')}</Text>
          </TouchableOpacity>

          <EquipmentFilterModal
            visible={filterOpen}
            options={filterOptions}
            filter={equipmentFilter ?? emptyEquipmentFilter()}
            onChange={(next) => setEquipmentFilter(next)}
            onReset={() => setEquipmentFilter(null)}
            onClose={() => setFilterOpen(false)}
            foundCount={foundCount}
          />

          <ContainerItemConfigModal
            visible={Boolean(configuringItem)}
            item={configuringItem}
            isMerchant={isMerchant}
            merchantSaleMarkupPercent={merchantSaleMarkupPercent}
            onSave={(spec) => {
              const target = configuringItem;
              setConfiguringItem(null);
              if (target) onPickConfiguredItem(target, spec);
            }}
            onClose={() => setConfiguringItem(null)}
          />
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const localStyles = StyleSheet.create({
  itemRowWithBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  itemInfoCol: {
    flex: 1,
  },
  chooseBtn: {
    backgroundColor: '#2e7d32',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
  },
  chooseBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  feedbackBanner: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#10b981',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  feedbackText: {
    color: '#065f46',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
});

export default ContainerCatalogModal;
