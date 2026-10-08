import React, { useState, useMemo, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, FlatList, SafeAreaView, TextInput, StyleSheet } from 'react-native';
// 437 (слово владельца): иконка фильтра — как иконки категорий в крафте.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getEquipmentCatalog } from '../../../../i18n/equipmentCatalog';
import { getWeaponById, getWeapons, getRowCount } from '../../../../db';
import { tInventory, formatInventoryText } from '../logic/inventoryI18n';
import { useLocale, useModuleLocale } from '../../../../i18n/locale';
import styles from '../../../../styles/AddItemModal.styles';
import { describeItemBasics } from '../../../../domain/itemBasics';
// 429: фильтр снаряжения — отдельное окно (слово владельца: на мобильных
// экранах список не должен прятаться за панелью).
import EquipmentFilterModal from '../../../../modules/fallout/screens/InventoryScreen/modals/EquipmentFilterModal';
import {
  buildEquipmentFilterOptions,
  emptyEquipmentFilter,
  activeEquipmentFilterCount,
  countFoundItems,
  isEquipmentFilterEmpty,
  pruneTreeByEquipmentFilter,
  weaponModsProviding,
} from '../../../../modules/fallout/logic/equipmentFilter';

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

const AddItemModal = ({ visible, onClose, onSelectItem, rootTitleKey = 'modals.addItemModal.title', selectionMode = 'loot', maxRarity = null }) => {
  const engineLocale = useLocale();
  const moduleLocale = useModuleLocale();
  const [currentPath, setCurrentPath] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [weaponsByType, setWeaponsByType] = useState({});
  const [pendingItem, setPendingItem] = useState(null);
  const [pendingQuantity, setPendingQuantity] = useState('1');
  // 425: фильтр снаряжения + спойлер; null = фильтр пуст.
  const [equipmentFilter, setEquipmentFilter] = useState(null);
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadWeaponsFromDb = async () => {
      try {
        // Fallback to catalog if DB is empty (not yet seeded)
        const dbCount = await getRowCount('weapons').catch(() => 0);
        const catalog = getEquipmentCatalog(moduleLocale);

        if (!dbCount) {
          // Use catalog directly
          const grouped = {};
          const typeMap = Object.fromEntries(
            Object.entries(mapWeaponTypeToDbValue).map(([k, v]) => [v.toLowerCase(), k])
          );
          for (const weapon of catalog.weapons || []) {
            const groupKey = typeMap[(weapon.weaponType || '').toLowerCase()];
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
                // Слияние с каталогом ПОЛНОЕ (425): поля фильтра
                // (fireRate/range/ammoId/rarity/damage) тоже из каталога.
                const catalogEntry = (catalog.weapons || []).find((w) => w.id === weapon.id);
                return {
                  ...weapon,
                  ...(catalogEntry ?? {}),
                  itemType: 'weapon',
                  name: weapon.name ?? catalogEntry?.name,
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
  }, [engineLocale, moduleLocale]);

  const staticData = useMemo(() => {
    const equipmentCatalog = getEquipmentCatalog(moduleLocale);

    return {
      [tInventory('modals.addItemModal.categories.armor')]: (equipmentCatalog.armor?.armor || [])
        .reduce((acc, category) => {
          acc[category.type] = category.items;
          return acc;
        }, {}),
      [tInventory('modals.addItemModal.categories.powerArmor')]: (equipmentCatalog.powerArmor?.powerArmor || [])
        .reduce((acc, category) => {
          acc[category.type] = category.items;
          return acc;
        }, {}),
      [tInventory('modals.addItemModal.categories.clothing')]: (equipmentCatalog.clothes?.clothes || []).reduce((acc, category) => {
        acc[category.type] = category.items;
        return acc;
      }, {}),
      [tInventory('modals.addItemModal.categories.ammo')]: {
        [tInventory('modals.addItemModal.categories.all')]: Array.isArray(equipmentCatalog.ammoTypes) ? equipmentCatalog.ammoTypes : [],
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
      [tInventory('modals.addItemModal.categories.magazines')]: {
        [tInventory('modals.addItemModal.categories.all')]: equipmentCatalog.magazines || [],
      },
      [tInventory('modals.addItemModal.categories.items')]: {
        [tInventory('modals.addItemModal.categories.all')]: equipmentCatalog.generalGoods || [],
      },
      [tInventory('modals.addItemModal.categories.materials')]: {
        [tInventory('modals.addItemModal.categories.all')]: equipmentCatalog.materials || [],
      },
      [tInventory('modals.addItemModal.categories.junk')]: {
        [tInventory('modals.addItemModal.categories.all')]: equipmentCatalog.junk || [],
      },
      [tInventory('modals.addItemModal.categories.robotEquipment')]: {
        [tInventory('modals.addItemModal.categories.robotWeapons')]: equipmentCatalog.robotWeaponsOnly || [],
        [tInventory('modals.addItemModal.categories.robotPlating')]: equipmentCatalog.robotPlating || [],
        [tInventory('modals.addItemModal.categories.robotArmorLayer')]: equipmentCatalog.robotArmorLayer || [],
        [tInventory('modals.addItemModal.categories.robotFrame')]: equipmentCatalog.robotFrames || [],
        [tInventory('modals.addItemModal.categories.robotBodyParts')]: equipmentCatalog.robotBody || [],
        [tInventory('modals.addItemModal.categories.robotModules')]: equipmentCatalog.robotModules || [],
        [tInventory('modals.addItemModal.categories.robotMisc')]: equipmentCatalog.robotItems || [],
      },
    };
  }, [engineLocale, moduleLocale]);

  useEffect(() => {
    if (visible) {
      setCurrentPath([]);
      setSearchTerm('');
      setPendingItem(null);
      setPendingQuantity('1');
      setEquipmentFilter(null);
      setFilterOpen(false);
    }
  }, [visible]);

  const allData = useMemo(() => {
    const tree = {
      [tInventory('modals.addItemModal.categories.weapon')]: weaponsByType,
      ...staticData,
    };
    // Комплект «покупка снаряжения» задаёт потолок редкости. Предметы выше
    // порога прячем целиком: короче список и не дразнит тем, что купить
    // нельзя. Записи без rarity считаем доступными — отсутствие поля не
    // повод прятать предмет.
    if (!Number.isFinite(maxRarity)) return tree;
    const keep = (item) => !Number.isFinite(Number(item?.rarity)) || Number(item.rarity) <= maxRarity;
    const prune = (node) => {
      if (Array.isArray(node)) return node.filter(keep);
      if (!node || typeof node !== 'object') return node;
      const out = {};
      for (const [key, value] of Object.entries(node)) {
        const pruned = prune(value);
        // Пустые ветки после отсева не показываем.
        const isEmpty = Array.isArray(pruned)
          ? pruned.length === 0
          : pruned && typeof pruned === 'object' && Object.keys(pruned).length === 0;
        if (!isEmpty) out[key] = pruned;
      }
      return out;
    };
    return prune(tree);
  }, [engineLocale, weaponsByType, staticData, maxRarity]);

  // 425: фильтр снаряжения — та же обрезка дерева (пустые ветки прячутся).
  // Слово владельца: выбранное, чего на оружии нет, раскрывает МОДЫ, дающие
  // его («моды это моды — только когда поставят, тогда и будут эффекты»):
  // секция «Моды» появляется, когда подобранные качества/эффекты есть в
  // каком-то моде; если ни одно оружие не подходит — в окне остаются моды.
  const filteredData = useMemo(() => {
    if (isEquipmentFilterEmpty(equipmentFilter)) return allData;
    const pruned = pruneTreeByEquipmentFilter(allData, equipmentFilter);
    const mods = weaponModsProviding(equipmentFilter, moduleLocale);
    if (mods.length === 0) return pruned;
    const modsLabel = tInventory('modals.addItemModal.filter.modsSection');
    const allLabel = tInventory('modals.addItemModal.categories.all');
    return {
      ...pruned,
      [modsLabel]: { [allLabel]: [...mods].sort((a, b) => String(a.name).localeCompare(String(b.name))) },
    };
  }, [allData, equipmentFilter, moduleLocale, engineLocale]);

  const filterOptions = useMemo(() => {
    const labels = {
      // 427: подписи категорий-чекбоксов — тот же словарь категорий окна.
      kinds: {
        weapon: tInventory('modals.addItemModal.categories.weapon'),
        armor: tInventory('modals.addItemModal.categories.armor'),
        powerArmor: tInventory('modals.addItemModal.categories.powerArmor'),
        clothing: tInventory('modals.addItemModal.categories.clothing'),
      },
      ammoNames: (getEquipmentCatalog(moduleLocale).ammoTypes ?? []).map((row) => ({ id: row.id, name: row.name })),
      damageTypes: tInventory('modals.addItemModal.filter.damageTypes'),
      weaponTypes: tInventory('modals.addItemModal.filter.weaponTypes'),
      distances: tInventory('modals.addItemModal.filter.distances'),
      bodyParts: tInventory('modals.addItemModal.filter.bodyPartsDict'),
    };
    return buildEquipmentFilterOptions(moduleLocale, labels);
  }, [moduleLocale, engineLocale]);

  // 427: счётчик активных условий — рядом с надписью «Фильтр».
  const activeFilterCount = activeEquipmentFilterCount(equipmentFilter);
  // 430: фильтр активен — окно показывает результаты, а не каталог.
  const filterActive = !isEquipmentFilterEmpty(equipmentFilter);
  // 429/432/433: сколько предметов найдётся — для кнопки «Показать (N)».
  // Подписи категорий берутся ИЗ ТОГО ЖЕ словаря, которым построены
  // ключи дерева окна (урок 433: служебные ключи давали всегда 0).
  const filterLabels = useMemo(() => ({
    gear: ['weapon', 'armor', 'powerArmor', 'clothing'].map((key) => tInventory(`modals.addItemModal.categories.${key}`)),
    modsSection: tInventory('modals.addItemModal.filter.modsSection'),
  }), [engineLocale]);
  const foundCount = useMemo(
    () => countFoundItems(filteredData, filterLabels, filterActive),
    [filteredData, filterLabels, filterActive],
  );

  const getTypeLabelAndIcon = (itemType) => {
    if (itemType === 'weapon') return tInventory('modals.addItemModal.itemTypes.weapon');
    if (itemType === 'armor') return tInventory('modals.addItemModal.itemTypes.armor');
    if (itemType === 'powerArmor') return tInventory('modals.addItemModal.itemTypes.powerArmor');
    if (itemType === 'clothing' || itemType === 'outfit') return tInventory('modals.addItemModal.itemTypes.clothing');
    if (itemType === 'chem' || itemType === 'chems') return tInventory('modals.addItemModal.itemTypes.chem');
    if (itemType === 'drinks') return tInventory('modals.addItemModal.itemTypes.drinks');
    if (itemType === 'ammo') return tInventory('modals.addItemModal.itemTypes.ammo');
    if (itemType === 'plating') return tInventory('modals.addItemModal.itemTypes.plating');
    if (itemType === 'junk') return tInventory('modals.addItemModal.itemTypes.junk');
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
      if (selectionMode === 'buy') {
        // В режиме покупки промежуточный экран «Добавить» не нужен:
        // сразу открываем окно покупки (количество и цена задаются там)
        onSelectItem(item, 1);
        onClose();
        return;
      }
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
    // 430 (владелец: «Нажал показать и снова я на экране каталога»):
    // при активном фильтре — ПЛОСКИЙ отсортированный список находок,
    // а не каталог категорий. 432 (владелец: «выбрал оружие с редкостью
    // от 6 до 6, а в списке боеприпасы, химия, хлам»): в результатах
    // фильтра — только снаряжение, прошедшее условия, и подобранные
    // моды; расходники и хлам живут в обычном каталоге и в поиске.
    if (searchTerm || filterActive) {
      const allItems = [];
      const gearGroupKeys = ['weapon', 'armor', 'powerArmor', 'clothing'];
      // поиск дополнительно собирает снаряжение роботов;
      // при активном фильтре только эти четыре вида снаряжения
      const groupKeys = filterActive ? gearGroupKeys : [...gearGroupKeys, 'robotEquipment'];
      groupKeys.forEach((key) => {
        const group = filteredData[tInventory(`modals.addItemModal.categories.${key}`)] || {};
        Object.values(group).forEach((items) => Array.isArray(items) && allItems.push(...items));
      });
      const allLabel = tInventory('modals.addItemModal.categories.all');
      const flatKeys = [
        // секция модов, подобранных под выбранные качества/эффекты (425)
        tInventory('modals.addItemModal.filter.modsSection'),
        // расходники/хлам — только в поиске, в фильтре они не участвуют
        ...(filterActive ? [] : ['ammo', 'chems', 'drinks', 'food', 'items', 'materials', 'junk'].map((key) => tInventory(`modals.addItemModal.categories.${key}`))),
      ];
      flatKeys.forEach((category) => {
        if (filteredData[category]?.[allLabel]) {
          allItems.push(...filteredData[category][allLabel]);
        }
      });

      const needle = searchTerm.toLowerCase();
      const visible = allItems.filter((item) => !searchTerm || item?.name?.toLowerCase().includes(needle));
      // результаты — по алфавиту
      visible.sort((a, b) => String(a?.name ?? '').localeCompare(String(b?.name ?? '')));
      return { items: visible };
    }

    let data = filteredData;
    for (const key of currentPath) {
      if (!data || typeof data !== 'object') return { categories: [] };
      data = data[key];
    }

    data = unwrapSingleAllCategory(data);
    if (Array.isArray(data)) return { items: data };
    if (data && typeof data === 'object') return { categories: Object.keys(data) };
    return { categories: [] };
  }, [engineLocale, filteredData, currentPath, searchTerm, equipmentFilter, filterActive]);

  const renderItem = ({ item }) => {
    const isItem = typeof item === 'object' && item?.name;
    const itemTypeLabel = isItem ? getTypeLabelAndIcon(item.itemType) : '';
    const basicsLine = isItem ? describeItemBasics(item, moduleLocale) : '';

    return (
      <TouchableOpacity style={styles.itemContainer} onPress={() => handleSelect(item)}>
        <Text style={styles.itemName}>{isItem ? item.name : item}</Text>
        {!isItem && <Text style={styles.itemType}>{CATEGORY_ICONS[Object.keys(CATEGORY_ICONS).find((key) => tInventory(`modals.addItemModal.categories.${key}`) === item)] || '📁'}</Text>}
        {isItem && Boolean(itemTypeLabel) && <Text style={styles.itemType}>{itemTypeLabel}</Text>}
        {/* 387 (слово владельца): базовые характеристики предмета подстрокой */}
        {isItem && Boolean(basicsLine) && <Text style={styles.itemBasics}>{basicsLine}</Text>}
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
              {/* 430: при активном фильтре заголовок — «Найдено: N». */}
              <Text style={styles.title}>
                {currentPath.length > 0 && !searchTerm && !filterActive
                  ? currentPath[currentPath.length - 1]
                  : (filterActive
                    ? formatInventoryText(tInventory('modals.addItemModal.filter.resultsFound'), { n: foundCount })
                    : tInventory(rootTitleKey))}
              </Text>

              {currentPath.length > 0 && !searchTerm && !filterActive && (
                <TouchableOpacity style={styles.backButton} onPress={() => setCurrentPath(currentPath.slice(0, -1))}>
                  <Text style={styles.backButtonText}>{tInventory('modals.addItemModal.back')}</Text>
                </TouchableOpacity>
              )}

              {/* 427 (слово владельца): поиск и фильтр совмещены — одна
                  строка; панель фильтра закреплена (не прокручивается) и
                  отделена чертой от списка предметов. */}
              <View style={styles.filterToolbar}>
                <TextInput
                  style={[styles.searchInput, styles.searchInputInToolbar]}
                  placeholder={tInventory('modals.addItemModal.searchPlaceholder')}
                  value={searchTerm}
                  onChangeText={setSearchTerm}
                />
                <TouchableOpacity style={styles.filterToggle} onPress={() => setFilterOpen((prev) => !prev)}>
                  {/* 437 (слово владельца): квадратная кнопка справа от
                      поиска, высота = высоте поиска; внутри иконка-воронка
                      из того же набора, что иконки категорий крафта, в
                      уголке — цветной кружок с числом активных условий. */}
                  <MaterialCommunityIcons name="filter" style={styles.filterIcon} />
                  {activeFilterCount > 0 && (
                    <View style={styles.filterBadge}>
                      <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              <View style={styles.listDivider} />

              <FlatList
                data={currentData.items || currentData.categories}
                renderItem={renderItem}
                keyExtractor={(item, index) => `${typeof item === 'object' ? item.name : item}-${index}`}
                ListEmptyComponent={<Text style={styles.emptyText}>{tInventory('modals.addItemModal.emptyCategory')}</Text>}
              />
              <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                <Text style={styles.closeButtonText}>{tInventory('modals.addItemModal.close')}</Text>
              </TouchableOpacity>

              {/* 429: окно фильтра — настройки не прячут список предметов. */}
              <EquipmentFilterModal
                visible={filterOpen}
                options={filterOptions}
                filter={equipmentFilter ?? emptyEquipmentFilter()}
                onChange={(next) => setEquipmentFilter(next)}
                onReset={() => setEquipmentFilter(null)}
                onClose={() => setFilterOpen(false)}
                foundCount={foundCount}
              />
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
