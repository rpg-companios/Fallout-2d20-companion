import { debugLog } from '../../../../../src/debug/falloutDebug';
import { useState, useEffect, useMemo, useRef } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { resolveKitItems } from '../../../../../domain/kitResolver';
import { initRobotSlots } from '../../../../../domain/robotEquip';
import { isRobotCharacter, getBodyPlan, getBuiltinBaseWeapon } from '../../../../../domain/origins';
import { getEquipmentCatalog } from '../../../../../i18n/equipmentCatalog';
import { useLocale, useModuleLocale } from '../../../../../i18n/locale';
import styles from '../../../../../styles/EquipmentKitModal.styles';
import { tCharacterScreen } from '../logic/characterScreenI18n';

// Lazy-load robot catalog data — на основании данных, без обогатителя
const loadRobotCatalog = () => ({
  heads: require('../../../data/equipment/robot/robotheads.json'),
  bodies: require('../../../data/equipment/robot/robotbody.json'),
  arms: require('../../../data/equipment/robot/robotarms.json'),
  legs: require('../../../data/equipment/robot/robotlegs.json'),
  weapons: require('../../../data/equipment/robot/weapons.json'),
  plating: require('../../../data/equipment/robot/armor_plating.json').plating || [],
  frames: require('../../../data/equipment/robot/frames.json').frames || [],
});

const META_CATEGORY_ORDER = ['structure', 'apparel', 'weapon', 'module', 'misc'];

// Sub-order inside the "Standard Structure" group: head → body → arm → legs → plating.
// Сюда входят ТОЛЬКО части тела/конструкции роботов. Одежда и броня человека
// идут отдельной категорией apparel, чтобы не попадать в «Стандартную конструкцию».
const STRUCTURE_SUBORDER = {
  robotHead: 0,
  robotBody: 1,
  robotArm: 2,
  robotLeg: 3,
  robotLegs: 3,
  plating: 4,
  frame: 5,
  robotFrame: 5,
  robotArmor: 6,
};

const STRUCTURE_TYPES = new Set(Object.keys(STRUCTURE_SUBORDER));
const APPAREL_TYPES = new Set(['clothing', 'armor']);

// Currency itemTypes that are NOT inventory items — tracked via caps counter
const CURRENCY_TYPES = new Set(['currency']);

const getMetaCategory = (item) => {
  const type = item?.itemType || (item?.weaponId ? 'weapon' : 'misc');
  if (STRUCTURE_TYPES.has(type)) return 'structure';
  if (APPAREL_TYPES.has(type)) return 'apparel';
  if (type === 'weapon') return 'weapon';
  if (type === 'module') return 'module';
  return 'misc';
};

const getStructureSortKey = (item) => {
  const type = item?.itemType || (item?.weaponId ? 'weapon' : 'misc');
  return STRUCTURE_SUBORDER[type] ?? 99;
};

const toChoiceKey = (kitId, itemIndex) => `${kitId}-${itemIndex}`;
const toGroupKey = (group = []) => `group-${group.map((item) => item?.itemId || item?.weaponId || item?.name).join('+')}`;
const getOptionKey = (option, optionIndex) => {
  if (option?.group) return toGroupKey(option.group);
  return option?.itemId || option?.weaponId || option?.name || `option-${optionIndex}`;
};

const entryToList = (entry, selectedChoices, kitId, itemIndex) => {
  if (!entry) return [];

  // Recursively handle nested arrays
  if (Array.isArray(entry)) {
    return entry.flatMap((e, i) => entryToList(e, selectedChoices, kitId, `${itemIndex}-${i}`));
  }

  // 'choice' — player picks ONE of N options
  if (entry.type === 'choice') {
    const key = toChoiceKey(kitId, itemIndex);
    const options = Array.isArray(entry.items) ? entry.items : [];
    const selectedKey = selectedChoices[key] || getOptionKey(options[0], 0);
    const selectedOption = options.find((opt, idx) => getOptionKey(opt, idx) === selectedKey) || options[0];

    if (!selectedOption) return [];
    if (selectedOption.group) return selectedOption.group;
    return [selectedOption];
  }

  // 'pick' — player picks Y of N options
  if (entry.type === 'pick') {
    const options = Array.isArray(entry.items) ? entry.items : [];
    const count = Number.isFinite(entry.pickCount) && entry.pickCount > 0
      ? Math.min(entry.pickCount, options.length)
      : options.length;
    return options.slice(0, count);
  }

  // 'rollTable' — kitResolver already rolled it into real items
  if (entry.type === 'rollTable') {
    const extras = Array.isArray(entry._extraItems) ? entry._extraItems : [];
    const { type: _t, _extraItems, roll, tableId, ...primary } = entry;
    return [primary, ...extras];
  }

  return [entry];
};

const flattenKitItems = (kit, selectedChoices) => (
  (kit.items || []).flatMap((entry, index) => entryToList(entry, selectedChoices, kit.id, index))
);

const toInventoryItems = (entries) => {
  const raw = [];

  entries.forEach((item) => {
    if (!item) return;

    if (item.itemType === 'weapon' || item.weaponId) {
      const weapon = item._weapon || {};
      const appliedMods = {};
      (item._mods || []).forEach((mod) => {
        if (mod.slot && mod.id) appliedMods[mod.slot] = mod.id;
      });

      raw.push({
        ...weapon,
        id: weapon.id || item.weaponId,
        name: item.displayName || item.name || weapon.name,
        weaponId: weapon.id || item.weaponId,
        appliedMods,
        quantity: item.quantity || 1,
        itemType: 'weapon',
        hasMods: item.hasMods ?? false,
        // item-level флаги встроенного оружия не лежат в _weapon — переносим явно,
        // иначе builtinToArm/requiresMkII теряются при фильтрации finalItems.
        builtinToArm: item.builtinToArm,
        requiresMkII: item.requiresMkII,
        // Вариант (заменённое имя) и уникальные качества — тоже item-level:
        // без явного переноса бритва/«Дерзкая …» потеряли бы имя и стек.
        baseName: item.baseName,
        uniqQualities: item.uniqQualities,
      });

      if (item.resolvedAmmunition) {
        raw.push({ ...item.resolvedAmmunition, quantity: item.resolvedAmmunition.quantity || 1 });
      }
      return;
    }

    raw.push({
      ...item,
      name: item.name || item.itemId,
      quantity: item.quantity || 1,
    });
  });

  return raw;
};

const summarizeItems = (items) => {
  // Collect all currency-type items into totalCaps, remove them from inventory
  const totalCaps = items.reduce((acc, item) => {
    if (CURRENCY_TYPES.has(item.itemType)) {
      return acc + (item.quantity || 0);
    }
    return acc;
  }, 0);

  // Filter out ALL currency types from inventory items
  const finalItems = items.filter((item) => !CURRENCY_TYPES.has(item.itemType));

  const weight = finalItems.reduce((acc, item) => {
    const itemWeight = parseFloat(String(item.weight ?? '0').replace(',', '.')) || 0;
    return acc + (itemWeight * (item.quantity || 1));
  }, 0);

  const price = finalItems.reduce((acc, item) => {
    const itemPrice = item.cost ?? item.price ?? 0;
    return acc + (itemPrice * (item.quantity || 1));
  }, 0);

  return { finalItems, totalCaps, weight, price };
};

const getDisplayName = (item) => item.displayName || item.name || item.itemId || item.weaponId || tCharacterScreen('labels.unknownItem');

const formatQuantitySuffix = (item) => {
  const qty = Number(item?.quantity || 0);
  if (!qty || qty <= 1) return '';
  if (CURRENCY_TYPES.has(item?.itemType)) return ` (${qty} ${tCharacterScreen('labels.capsShort')})`;
  return ` (${qty} ${tCharacterScreen('labels.pcsShort')})`;
};

const formatAmmoSuffix = (ammo) => {
  if (!ammo) return '';
  const qty = Number(ammo.quantity || 0);
  const qtyText = qty > 0 ? `${qty} ${tCharacterScreen('labels.pcsShort')}` : `0 ${tCharacterScreen('labels.pcsShort')}`;
  return ` (${qtyText} ${ammo.name})`;
};

const resolveRobotBodyPlan = (character) => (
  getBodyPlan(character) || 'protectron'
);

const formatBuiltinWeaponSuffix = (entry) => {
  if (!entry || entry.itemType !== 'robotArm') return '';
  const builtinId = entry.builtinWeaponId;
  if (!builtinId) return '';
  const catalog = getEquipmentCatalog();
  const weapon = (catalog?.weapons || []).find((w) => w.id === builtinId);
  if (!weapon?.name) {
    throw new Error(`[EquipmentKitModal] Для встроенного оружия "${builtinId}" нет локализованных данных`);
  }
  return ` + ${weapon.name}`;
};

const EquipmentKitModal = ({ visible, onClose, equipmentKits, onSelectKit, character }) => {
  const locale = useLocale(); // интерфейс движка
  useModuleLocale(); // содержимое комплектов активного сеттинга
  const metaCategoryLabels = useMemo(() => ({
    structure: tCharacterScreen('modals.equipmentKit.categories.structure'),
    weapon: tCharacterScreen('modals.equipmentKit.categories.weapon'),
    module: tCharacterScreen('modals.equipmentKit.categories.module'),
    misc: tCharacterScreen('modals.equipmentKit.categories.misc'),
  }), [locale]);

  const [expandedKit, setExpandedKit] = useState(null);
  const [selectedChoices, setSelectedChoices] = useState({});
  const [calculatedKits, setCalculatedKits] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!visible || !equipmentKits?.length) {
      setCalculatedKits([]);
      setSelectedChoices({});
      setExpandedKit(null);
      submittingRef.current = false;
      return;
    }

    const load = async () => {
      setIsLoading(true);
      try {
        const resolved = await Promise.all(
          equipmentKits.map(async (kit) => {
            try {
              return await resolveKitItems(kit);
            } catch (error) {
              debugLog('kits.modal.failed', { kitId: kit?.id, error: error?.message || String(error) });
              return kit;
            }
          }),
        );
        const validKits = resolved.filter((kit) => kit && Array.isArray(kit.items) && kit.items.length > 0);
        setCalculatedKits(validKits);

        const defaults = {};
        validKits.forEach((kit) => {
          (kit.items || []).forEach((entry, index) => {
            if (entry?.type === 'choice') {
              const firstOption = (entry.items || [])[0];
              defaults[toChoiceKey(kit.id, index)] = getOptionKey(firstOption, 0);
            }
          });
        });
        setSelectedChoices(defaults);
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [visible, equipmentKits]);

  if (!equipmentKits) return null;

  const handleSelectChoice = (kitId, itemIndex, option, optionIndex) => {
    setSelectedChoices((prev) => ({
      ...prev,
      [toChoiceKey(kitId, itemIndex)]: getOptionKey(option, optionIndex),
    }));
  };

  const handleSelectKit = (kit) => {
    // Защита от двойного нажатия «Выбрать»: повторный вызов, пока идёт
    // обработка, игнорируется — иначе комплект выдаётся дважды.
    if (submittingRef.current) return;
    submittingRef.current = true;
    const chosenEntries = flattenKitItems(kit, selectedChoices);
    const inventoryItems = toInventoryItems(chosenEntries);
    const { finalItems, totalCaps, weight, price } = summarizeItems(inventoryItems);

    const isRobot = isRobotCharacter(character);

    if (isRobot) {
      const bodyPlan = resolveRobotBodyPlan(character);
      const robotCatalog = loadRobotCatalog();
      const { slots, weapons, modules, inventoryItems: robotInventory } = initRobotSlots(
        bodyPlan,
        chosenEntries,
        robotCatalog,
      );

      // Части тела, броня/обшивка/рама и модули уходят в слоты робота
      // (initRobotSlots) — в инвентарь их копия не нужна.
      const slotConsumedTypes = new Set([
        'robotArm', 'robotHead', 'robotBody', 'robotLeg', 'robotLegs',
        'plating', 'armor', 'robotArmor', 'frame', 'robotFrame', 'module',
      ]);
      const finalItemsOnly = finalItems.filter((item) => {
        if (slotConsumedTypes.has(item.itemType)) return false;
        if (item.itemType === 'weapon' && (item.replacesArm || item.selfDestruct || item.builtinToHead || item.builtinToArm)) return false;
        if (item.itemType === 'weapon' && String(item.id || item.weaponId || '').startsWith('robot_weapon_')) return false;
        return true;
      });

      // Предметы, которые уже ушли в слоты/инвентарь через initRobotSlots
      // (robotInventory), не дублируются копией из finalItems — иначе
      // addNewItem склеит их в стек ×2 (см. защиту от дублей).
      const robotInvKeys = new Set(
        robotInventory
          .map((i) => i.weaponId || i.id || i.itemId || i.armorId || i.clothingId)
          .filter(Boolean),
      );
      const dedupedFinalItems = finalItemsOnly.filter((item) => {
        const key = item.weaponId || item.id || item.itemId || item.armorId || item.clothingId;
        return !key || !robotInvKeys.has(key);
      });

      const allInventoryItems = [...dedupedFinalItems, ...robotInventory];

      onSelectKit({
        name: kit.name,
        items: allInventoryItems,
        weight,
        price,
        caps: totalCaps,
        robotSlots: slots,
        robotWeapons: weapons,
        robotModules: modules,
      });
    } else {
      // Non-robots always have their built-in unarmed weapon (fists).
      const builtin = getBuiltinBaseWeapon(character);
      onSelectKit({
        name: kit.name,
        items: finalItems,
        weight,
        price,
        caps: totalCaps,
        unarmedWeaponId: builtin?.id || null,
      });
    }

    onClose();
  };

  const getGroupedEntries = (kit) => {
    const groups = {};

    (kit.items || []).forEach((entry, index) => {
      if (entry?.hiddenInKitModal) return;
      const probe = entry?.type === 'choice' ? (entry.items || [])[0] : entry;
      const meta = getMetaCategory(probe);
      if (!groups[meta]) groups[meta] = [];
      groups[meta].push({ ...entry, _entryIndex: index, _sortKey: getStructureSortKey(probe) });
    });

    if (groups.structure) {
      groups.structure.sort((a, b) => (a._sortKey ?? 99) - (b._sortKey ?? 99));
    }

    return groups;
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <Text style={styles.title}>{tCharacterScreen('modals.equipmentKit.title')}</Text>

          {isLoading ? (
            <ActivityIndicator size="large" color="#005A9C" style={{ marginVertical: 30 }} />
          ) : calculatedKits.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                {tCharacterScreen('modals.equipmentKit.empty')}
              </Text>
            </View>
          ) : (
            <ScrollView>
              {calculatedKits.map((kit) => {
                const groups = getGroupedEntries(kit);
                return (
                  <View key={kit.id || kit.name} style={styles.kitContainer}>
                    <TouchableOpacity onPress={() => setExpandedKit((prev) => (prev === kit.id ? null : kit.id))}>
                      <Text style={styles.kitName}>{kit.name}</Text>
                    </TouchableOpacity>

                    {expandedKit === kit.id && (
                      <View style={styles.kitDetails}>
                        {META_CATEGORY_ORDER.map((category) => {
                          if (!groups[category]?.length) return null;

                          return (
                            <View key={category} style={styles.categoryContainer}>
                              <Text style={styles.categoryTitle}>{metaCategoryLabels[category] || tCharacterScreen('labels.equipmentKit')}:</Text>
                              {groups[category].map((entry) => {
                                if (entry?.type === 'choice') {
                                  return (
                                    <View key={`choice-${entry._entryIndex}`} style={styles.choiceContainer}>
                                      {(entry.items || []).map((option, optionIndex) => {
                                        const optionKey = getOptionKey(option, optionIndex);
                                        const choiceKey = toChoiceKey(kit.id, entry._entryIndex);
                                        const selected = selectedChoices[choiceKey] === optionKey;

                                        const optionLabel = option.group
                                          ? option.group.map((groupItem) => `${getDisplayName(groupItem)}${formatBuiltinWeaponSuffix(groupItem)}`).join(' + ')
                                          : `${getDisplayName(option)}${formatBuiltinWeaponSuffix(option)}`;

                                        return (
                                          <TouchableOpacity
                                            key={optionKey}
                                            style={styles.radioContainer}
                                            onPress={() => handleSelectChoice(kit.id, entry._entryIndex, option, optionIndex)}
                                          >
                                            <View style={[styles.radio, selected && styles.radioSelected]} />
                                            <Text>{optionLabel}</Text>
                                            <Text>{formatQuantitySuffix(option)}</Text>
                                            {option?.resolvedAmmunition && (
                                              <Text style={styles.ammoText}>{formatAmmoSuffix(option.resolvedAmmunition)}</Text>
                                            )}
                                          </TouchableOpacity>
                                        );
                                      })}
                                    </View>
                                  );
                                }

                                return (
                                  <View key={`fixed-${entry._entryIndex}`} style={styles.fixedItem}>
                                    <Text>{getDisplayName(entry)}{formatBuiltinWeaponSuffix(entry)}{formatQuantitySuffix(entry)}</Text>
                                    {entry.resolvedAmmunition && (
                                      <Text style={styles.ammoText}>{formatAmmoSuffix(entry.resolvedAmmunition)}</Text>
                                    )}
                                  </View>
                                );
                              })}
                            </View>
                          );
                        })}

                        <TouchableOpacity style={styles.selectButton} onPress={() => handleSelectKit(kit)}>
                          <Text style={styles.selectButtonText}>{tCharacterScreen('buttons.select')}</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          )}

          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>{tCharacterScreen('buttons.close')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

export default EquipmentKitModal;