import React, { useState, useMemo, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  TextInput,
  StyleSheet,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import IconText, { withCdToken, formatBasicsWithIcons } from '../../../lootTrade/LootTradeIconText';
import { getEquipmentCatalog } from '../../../../i18n/equipmentCatalog';
import { getWeaponById, getWeapons, getRowCount } from '../../../../db';
import { tInventory, formatInventoryText } from '../../InventoryScreen/logic/inventoryI18n';
import { tLootTrade, formatLootTrade } from '../logic/lootTradeI18n';
import { useLocale, useModuleLocale } from '../../../../i18n/locale';
import { describeItemBasics } from '../../../../domain/itemBasics';
import {
  isAmmoItem,
  getAmmoFoundSpec,
  formatAmmoFoundFormula,
} from '../../../../domain/lootTrade';
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
          style={localStyles.itemContainer}
          onPress={() => setCurrentPath([...currentPath, item])}
        >
          <Text style={localStyles.itemName}>{item}</Text>
          <Text style={localStyles.itemType}>{CATEGORY_ICONS[iconKey] || '📁'}</Text>
        </TouchableOpacity>
      );
    }

    const baseBasics = item.__isLooseCaps
      ? tLootTrade('catalog.looseCapsSub')
      : formatBasicsWithIcons(describeItemBasics(item, moduleLocale));
    const ammoPackNote = !item.__isLooseCaps && isAmmoItem(item)
      ? withCdToken(formatLootTrade(tLootTrade('itemConfig.packFormulaBadge'), {
          formula: formatAmmoFoundFormula(getAmmoFoundSpec(item)),
        }))
      : '';
    const basicsLine = [ammoPackNote, baseBasics].filter(Boolean).join(' • ');

    return (
      <View style={[localStyles.itemContainer, localStyles.itemRowWithBtn]}>
        <View style={localStyles.itemInfoCol}>
          <IconText style={localStyles.itemName}>{item.name}</IconText>
          {Boolean(basicsLine) && <IconText style={localStyles.itemBasics}>{basicsLine}</IconText>}
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
      <View style={localStyles.modalContainer}>
        <View style={localStyles.modalContent}>
          <Text style={localStyles.title}>
            {currentPath.length > 0 && !searchTerm && !filterActive
              ? currentPath[currentPath.length - 1]
              : (filterActive
                ? formatInventoryText(tInventory('modals.addItemModal.filter.resultsFound'), { n: foundCount })
                : tLootTrade(isMerchant ? 'catalog.titleMerchant' : 'catalog.titleLoot'))}
          </Text>

          {Boolean(feedbackMessage) && (
            <View style={localStyles.feedbackBanner}>
              <IconText style={localStyles.feedbackText}>{withCdToken(feedbackMessage)}</IconText>
            </View>
          )}

          {currentPath.length > 0 && !searchTerm && !filterActive && (
            <TouchableOpacity
              style={localStyles.backButton}
              onPress={() => setCurrentPath(currentPath.slice(0, -1))}
            >
              <Text style={localStyles.backButtonText}>{tLootTrade('catalog.back')}</Text>
            </TouchableOpacity>
          )}

          <View style={localStyles.filterToolbar}>
            <TextInput
              style={localStyles.searchInput}
              placeholder={tInventory('modals.addItemModal.searchPlaceholder')}
              placeholderTextColor="#8c8c8c"
              value={searchTerm}
              onChangeText={setSearchTerm}
            />
            <TouchableOpacity
              style={localStyles.filterToggle}
              onPress={() => setFilterOpen((prev) => !prev)}
            >
              <MaterialCommunityIcons name="filter" style={localStyles.filterIcon} />
              {activeFilterCount > 0 && (
                <View style={localStyles.filterBadge}>
                  <Text style={localStyles.filterBadgeText}>{activeFilterCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          <View style={localStyles.listDivider} />

          <FlatList
            data={listEntries}
            renderItem={renderEntry}
            keyExtractor={(item, index) => `${typeof item === 'object' ? (item.id || item.name) : item}-${index}`}
            ListEmptyComponent={
              <Text style={localStyles.emptyText}>{tInventory('modals.addItemModal.emptyCategory')}</Text>
            }
          />

          <TouchableOpacity style={localStyles.closeButton} onPress={onClose}>
            <Text style={localStyles.closeButtonText}>{tLootTrade('catalog.close')}</Text>
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
        </View>
      </View>
    </Modal>
  );
};

const localStyles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    paddingHorizontal: 28,
    paddingVertical: 36,
  },
  modalContent: {
    width: '90%',
    maxWidth: 680,
    height: '80%',
    maxHeight: 720,
    backgroundColor: '#1f1f1f',
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#f0e68c',
    paddingVertical: 22,
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#f0e68c',
    marginBottom: 14,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 10,
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 5,
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#5a5a5a',
  },
  backButtonText: {
    color: '#f0e68c',
    fontSize: 13,
    fontWeight: '600',
  },
  filterToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: '#5a5a5a',
    backgroundColor: '#2a2a2a',
    color: '#f0f0f0',
    borderRadius: 5,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  filterToggle: {
    width: 40,
    height: 40,
    marginLeft: 8,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#666666',
    backgroundColor: '#2e2e2e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterIcon: {
    fontSize: 20,
    color: '#f0e68c',
  },
  filterBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 17,
    height: 17,
    borderRadius: 5,
    backgroundColor: '#d4af37',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1,
    borderColor: '#1f1f1f',
  },
  filterBadgeText: {
    color: '#1a1a1a',
    fontSize: 10,
    fontWeight: '800',
  },
  listDivider: {
    height: 1,
    backgroundColor: '#3d3d3d',
    marginVertical: 6,
  },
  itemContainer: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemRowWithBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  itemInfoCol: {
    flex: 1,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ededed',
    paddingRight: 8,
  },
  itemType: {
    fontSize: 15,
    color: '#d4af37',
  },
  itemBasics: {
    fontSize: 12,
    color: '#a8a8a8',
    marginTop: 2,
  },
  emptyText: {
    textAlign: 'center',
    marginVertical: 24,
    color: '#9e9e9e',
  },
  chooseBtn: {
    backgroundColor: '#3a3a1e',
    borderWidth: 1,
    borderColor: '#f0e68c',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 5,
  },
  chooseBtnText: {
    color: '#f0e68c',
    fontSize: 13,
    fontWeight: '700',
  },
  feedbackBanner: {
    backgroundColor: '#2d2a1e',
    borderWidth: 1,
    borderColor: '#d4af37',
    borderRadius: 5,
    paddingVertical: 7,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  feedbackText: {
    color: '#f0e68c',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  closeButton: {
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#777777',
    paddingVertical: 12,
    borderRadius: 5,
    marginTop: 14,
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#e0e0e0',
    fontWeight: '700',
    fontSize: 15,
  },
});

export default ContainerCatalogModal;
