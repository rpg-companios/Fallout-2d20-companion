import React, { useState, useMemo, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, FlatList, SafeAreaView, TextInput, StyleSheet } from 'react-native';
// 437 (слово владельца): иконка фильтра — как иконки категорий в крафте.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getEquipmentCatalog } from '../../../../i18n/equipmentCatalog';
import { getWeaponById, getWeapons, getRowCount } from '../../../../db';
import { tInventory } from '../logic/inventoryI18n';
import { useLocale, useModuleLocale, useModuleCatalogRevision } from '../../../../i18n/locale';
import styles from '../../../../styles/AddItemModal.styles';
import { describeItemBasics } from '../../../../domain/itemBasics';
import { getSettingService } from '../../../../domain/registry';

const AddItemModal = ({ visible, onClose, onSelectItem, rootTitleKey = 'modals.addItemModal.title', selectionMode = 'loot', maxRarity = null }) => {
  const inventoryRuntime = getSettingService('inventory') ?? {};
  const equipmentFilterFeature = inventoryRuntime.features?.equipmentFilter ?? {};
  const {
    Modal: EquipmentFilterModal,
    buildOptions: buildEquipmentFilterOptions,
    empty: emptyEquipmentFilter,
    countActive: activeEquipmentFilterCount,
    countFound: countFoundItems,
    isEmpty: isEquipmentFilterEmpty,
    pruneTree: pruneTreeByEquipmentFilter,
  } = equipmentFilterFeature;
  const engineLocale = useLocale();
  const moduleLocale = useModuleLocale();
  const catalogRevision = useModuleCatalogRevision();
  const getWeaponTypeGroups = inventoryRuntime.getWeaponTypeGroups;
  const weaponTypeGroups = useMemo(
    () => getWeaponTypeGroups?.() ?? [],
    [getWeaponTypeGroups, moduleLocale, catalogRevision],
  );
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
        if (weaponTypeGroups.length === 0) {
          if (!cancelled) setWeaponsByType({});
          return;
        }

        // Fallback to the active package catalog if the database is not seeded.
        const dbCount = await getRowCount('weapons').catch(() => 0);
        const catalog = getEquipmentCatalog(moduleLocale);

        if (!dbCount) {
          const grouped = {};
          const typeMap = Object.fromEntries(
            weaponTypeGroups.map(({ key, dbValue }) => [dbValue.toLowerCase(), key]),
          );
          const labelsByKey = new Map(weaponTypeGroups.map(({ key, label }) => [key, label]));
          for (const weapon of catalog.weapons || []) {
            const groupKey = typeMap[(weapon.weaponType || '').toLowerCase()];
            if (!groupKey) continue;
            const label = labelsByKey.get(groupKey) ?? groupKey;
            if (!grouped[label]) grouped[label] = [];
            grouped[label].push({ ...weapon, itemType: inventoryRuntime.itemTypeIds?.weapon ?? null });
          }
          Object.keys(grouped).forEach((key) => grouped[key].sort(
            (left, right) => String(left.name || '').localeCompare(String(right.name || '')),
          ));
          if (!cancelled) setWeaponsByType(grouped);
          return;
        }

        const entries = await Promise.all(
          weaponTypeGroups.map(async ({ key: groupKey, dbValue: weaponType }) => {
            const weaponsByTypeList = await getWeapons(weaponType);
            const weaponIds = weaponsByTypeList.map((weapon) => weapon?.id).filter(Boolean);
            const weaponsById = await Promise.all(weaponIds.map((id) => getWeaponById(id)));
            const normalizedWeapons = weaponsById
              .filter(Boolean)
              .map((weapon) => {
                // Merge complete catalog entries so filter fields remain available.
                const catalogEntry = (catalog.weapons || []).find((entry) => entry.id === weapon.id);
                return {
                  ...weapon,
                  ...(catalogEntry ?? {}),
                  itemType: inventoryRuntime.itemTypeIds?.weapon ?? null,
                  name: weapon.name ?? catalogEntry?.name,
                };
              })
              .sort((left, right) => String(left.name || '').localeCompare(String(right.name || '')));
            return [groupKey, normalizedWeapons];
          }),
        );

        if (cancelled) return;

        const labelsByKey = new Map(weaponTypeGroups.map(({ key, label }) => [key, label]));
        const groupedWeapons = {};
        entries.forEach(([groupKey, weapons]) => {
          if (!weapons.length) return;
          const label = labelsByKey.get(groupKey) ?? groupKey;
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
  }, [engineLocale, moduleLocale, catalogRevision, weaponTypeGroups]);

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
    const tree = inventoryRuntime.buildAddItemCatalogTree?.({
      catalog: getEquipmentCatalog(moduleLocale),
      weaponsByType,
    }) ?? {};
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
  }, [
    engineLocale,
    moduleLocale,
    catalogRevision,
    weaponsByType,
    maxRarity,
    inventoryRuntime.buildAddItemCatalogTree,
  ]);

  // 425: фильтр снаряжения — обрезка дерева (пустые ветки прячутся).
  // 438 (слово владельца): моды в результатах НИКОГДА — «1 мод может
  // подходить 9 из 11 оружий, а если 11-го оружия нет, то от мода
  // смысла нет».
  const filteredData = useMemo(() => {
    if (typeof isEquipmentFilterEmpty !== 'function' || isEquipmentFilterEmpty(equipmentFilter)) return allData;
    return pruneTreeByEquipmentFilter?.(allData, equipmentFilter) ?? allData;
  }, [allData, equipmentFilter, isEquipmentFilterEmpty, pruneTreeByEquipmentFilter]);

  const filterOptions = useMemo(() => {
    const labels = inventoryRuntime.getEquipmentFilterLabels?.(
      getEquipmentCatalog(moduleLocale),
      moduleLocale,
    ) ?? {};
    return buildEquipmentFilterOptions?.(moduleLocale, labels) ?? [];
  }, [
    moduleLocale,
    engineLocale,
    catalogRevision,
    buildEquipmentFilterOptions,
    inventoryRuntime.getEquipmentFilterLabels,
  ]);

  // 427: счётчик активных условий — рядом с надписью «Фильтр».
  const activeFilterCount = activeEquipmentFilterCount?.(equipmentFilter) ?? 0;
  // 430: фильтр активен — окно показывает результаты, а не каталог.
  const filterActive = typeof isEquipmentFilterEmpty === 'function'
    && !isEquipmentFilterEmpty(equipmentFilter);
  // 429/432/433: сколько предметов найдётся — для кнопки «Показать (N)».
  // Подписи категорий берутся ИЗ ТОГО ЖЕ словаря, которым построены
  // ключи дерева окна (урок 433: служебные ключи давали всегда 0).
  const filterLabels = useMemo(() => ({
    gear: inventoryRuntime.getGearCategoryLabels?.() ?? [],
  }), [
    engineLocale,
    moduleLocale,
    catalogRevision,
    inventoryRuntime.getGearCategoryLabels,
  ]);
  const foundCount = useMemo(
    () => countFoundItems?.(filteredData, filterLabels, filterActive) ?? 0,
    [filteredData, filterLabels, filterActive, countFoundItems],
  );

  const getTypeLabelAndIcon = (itemType) =>
    inventoryRuntime.getItemTypeLabel?.(itemType) ?? '';

  const getCategoryIcon = (categoryLabel) => (
    inventoryRuntime.getCategoryIcon?.(categoryLabel) ?? '📁'
  );

  const unwrapSingleAllCategory = (data) => {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
    const keys = Object.keys(data);
    const allLabel = inventoryRuntime.getAllCategoryLabel?.();
    if (allLabel && keys.length === 1 && keys[0] === allLabel && Array.isArray(data[allLabel])) {
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
      const allItems = inventoryRuntime.getSearchableItems?.({
        catalogTree: filteredData,
        filterActive,
      }) ?? [];
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
  }, [
    engineLocale,
    filteredData,
    currentPath,
    searchTerm,
    equipmentFilter,
    filterActive,
    inventoryRuntime.getSearchableItems,
    inventoryRuntime.getAllCategoryLabel,
  ]);

  const renderItem = ({ item }) => {
    const isItem = typeof item === 'object' && item?.name;
    const itemTypeLabel = isItem ? getTypeLabelAndIcon(item.itemType) : '';
    const basicsLine = isItem ? describeItemBasics(item, moduleLocale) : '';

    return (
      <TouchableOpacity style={styles.itemContainer} onPress={() => handleSelect(item)}>
        <Text style={styles.itemName}>{isItem ? item.name : item}</Text>
        {!isItem && <Text style={styles.itemType}>{getCategoryIcon(item)}</Text>}
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
                    ? equipmentFilterFeature.formatResultsFound?.(foundCount) ?? ''
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
                {EquipmentFilterModal ? (
                  <TouchableOpacity style={styles.filterToggle} onPress={() => setFilterOpen((prev) => !prev)}>
                    {/* 437: setting-provided optional filter feature. */}
                    <MaterialCommunityIcons name="filter" style={styles.filterIcon} />
                    {activeFilterCount > 0 && (
                      <View style={styles.filterBadge}>
                        <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ) : null}
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
              {EquipmentFilterModal ? (
                <EquipmentFilterModal
                  visible={filterOpen}
                  options={filterOptions}
                  filter={equipmentFilter ?? emptyEquipmentFilter?.() ?? {}}
                  onChange={(next) => setEquipmentFilter(next)}
                  onReset={() => setEquipmentFilter(null)}
                  onClose={() => setFilterOpen(false)}
                  foundCount={foundCount}
                />
              ) : null}
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
