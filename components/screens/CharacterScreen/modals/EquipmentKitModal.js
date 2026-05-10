import { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { resolveKitItems } from '../../../../domain/kitResolver';
import { isRobotCharacter, initRobotSlots } from '../../../../domain/robotEquip';
import { getEquipmentCatalog } from '../../../../i18n/equipmentCatalog';
import styles from '../../../../styles/EquipmentKitModal.styles';

// Lazy-load robot catalog data
const loadRobotCatalog = () => ({
  heads: require('../../../../data/equipment/robot/robotheads.json'),
  bodies: require('../../../../data/equipment/robot/robotbody.json'),
  arms: require('../../../../data/equipment/robot/robotarms.json'),
  legs: require('../../../../data/equipment/robot/robotlegs.json'),
  weapons: require('../../../../data/equipment/robot/weapons.json'),
});

// Meta-categories shown in the kit modal.
// All robot limbs/plating collapse into a single "Стандартная конструкция" group;
// weapons and modules are their own buckets; everything else goes to "Разное".
const META_CATEGORY_LABELS = {
  structure: 'Стандартная конструкция',
  weapon: 'Оружие',
  module: 'Модули',
  misc: 'Разное',
};

const META_CATEGORY_ORDER = ['structure', 'weapon', 'module', 'misc'];

// Sub-order inside the "Стандартная конструкция" group: голова → корпус → рука → ноги → обшивка
const STRUCTURE_SUBORDER = {
  robotHead: 0,
  robotBody: 1,
  robotArm: 2,
  robotLeg: 3,
  robotLegs: 3,
  plating: 4,
  armor: 5,
  frame: 6,
};

const STRUCTURE_TYPES = new Set(Object.keys(STRUCTURE_SUBORDER));

const getMetaCategory = (item) => {
  const type = item?.itemType || (item?.weaponId ? 'weapon' : 'misc');
  if (STRUCTURE_TYPES.has(type)) return 'structure';
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

  if (entry.type === 'choice') {
    const key = toChoiceKey(kitId, itemIndex);
    const options = Array.isArray(entry.items) ? entry.items : [];
    const selectedKey = selectedChoices[key] || getOptionKey(options[0], 0);
    const selectedOption = options.find((opt, idx) => getOptionKey(opt, idx) === selectedKey) || options[0];

    if (!selectedOption) return [];
    if (selectedOption.group) return selectedOption.group;
    return [selectedOption];
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
        Название: item.displayName || item.Название || item.name || weapon.name,
        weaponId: weapon.id || item.weaponId,
        appliedMods,
        quantity: item.quantity || 1,
        itemType: 'weapon',
        hasMods: item.hasMods ?? false,
      });

      if (item.resolvedAmmunition) {
        raw.push({ ...item.resolvedAmmunition, quantity: item.resolvedAmmunition.quantity || 1 });
      }
      return;
    }

    raw.push({
      ...item,
      name: item.name || item.Название || item.itemId,
      Название: item.Название || item.name || item.itemId,
      quantity: item.quantity || 1,
    });
  });

  return raw;
};

const summarizeItems = (items) => {
  const totalCaps = items.reduce((acc, item) => {
    if (item.itemType === 'currency' && item.name === 'Крышки') {
      return acc + (item.quantity || 0);
    }
    return acc;
  }, 0);

  const finalItems = items.filter((item) => item.itemType !== 'currency');

  const weight = finalItems.reduce((acc, item) => {
    const itemWeight = parseFloat(String(item.Вес ?? item.weight ?? '0').replace(',', '.')) || 0;
    return acc + (itemWeight * (item.quantity || 1));
  }, 0);

  const price = finalItems.reduce((acc, item) => {
    const itemPrice = item.Цена ?? item.price ?? 0;
    return acc + (itemPrice * (item.quantity || 1));
  }, 0);

  return { finalItems, totalCaps, weight, price };
};

const getDisplayName = (item) => item.displayName || item.Название || item.name || item.itemId || item.weaponId || 'Неизвестный предмет';


const formatQuantitySuffix = (item) => {
  const qty = Number(item?.quantity || 0);
  if (!qty || qty <= 1) return '';
  if (item?.itemType === 'currency') return ` (${qty} крышек)`;
  return ` (${qty} шт.)`;
};

const formatAmmoSuffix = (ammo) => {
  if (!ammo) return '';
  const qty = Number(ammo.quantity || 0);
  const qtyText = qty > 0 ? `${qty} шт.` : '0 шт.';
  return ` (${qtyText} ${ammo.name})`;
};

// For robotArm entries with a builtinWeaponId, returns " + <weapon name>" so the
// modal makes it visible that the arm carries a built-in weapon (e.g. manipulator).
const formatBuiltinWeaponSuffix = (entry) => {
  if (!entry || entry.itemType !== 'robotArm') return '';
  const builtinId = entry.builtinWeaponId;
  if (!builtinId) return '';
  const catalog = getEquipmentCatalog();
  const weapon = (catalog?.weapons || []).find((w) => w.id === builtinId);
  const name = weapon?.name || builtinId;
  return ` + ${name}`;
};

const EquipmentKitModal = ({ visible, onClose, equipmentKits, onSelectKit, character }) => {
  const [expandedKit, setExpandedKit] = useState(null);
  const [selectedChoices, setSelectedChoices] = useState({});
  const [calculatedKits, setCalculatedKits] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!visible || !equipmentKits?.length) {
      setCalculatedKits([]);
      setSelectedChoices({});
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
              console.warn('Не удалось разрешить комплект снаряжения, используется исходный набор:', kit?.id, error);
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
    const chosenEntries = flattenKitItems(kit, selectedChoices);
    const inventoryItems = toInventoryItems(chosenEntries);
    const { finalItems, totalCaps, weight, price } = summarizeItems(inventoryItems);

    const isRobot = isRobotCharacter(character);

    if (isRobot) {
      const bodyPlan = character?.trait?.modifiers?.robotBodyPlan
        || character?.origin?.robotBodyPlan
        || 'protectron';
      const robotCatalog = loadRobotCatalog();
      const { slots, weapons, modules, inventoryItems: robotInventory } = initRobotSlots(
        bodyPlan,
        chosenEntries,
        robotCatalog,
      );

      // Non-limb/armor items go to equipment inventory
      // Exclude robot-specific weapons that replace limbs (they live in slots, not inventory)
      const allInventoryItems = [...finalItems.filter(
        (item) => {
          if (['robotArm', 'robotHead', 'robotBody', 'robotLeg', 'robotLegs', 'plating', 'armor', 'frame', 'module'].includes(item.itemType)) return false;
          // Weapons that replace arm slots are part of the robot body, not inventory
          if (item.itemType === 'weapon' && (item.replacesArm || item.selfDestruct || item.builtinToHead || item.builtinToArm)) return false;
          return true;
        }
      ), ...robotInventory];

      onSelectKit({
        name: kit.name,
        items: allInventoryItems,
        weight,
        price,
        caps: totalCaps,
        // Robot-specific fields
        robotSlots: slots,
        robotWeapons: weapons,
        robotModules: modules,
      });
    } else {
      // Human: ensure unarmed_human is included in weapons
      const UNARMED_ID = 'unarmed_human';
      onSelectKit({
        name: kit.name,
        items: finalItems,
        weight,
        price,
        caps: totalCaps,
        unarmedWeaponId: UNARMED_ID,
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

    // Within "Стандартная конструкция" sort by sub-order: head → body → arm → legs → plating
    if (groups.structure) {
      groups.structure.sort((a, b) => (a._sortKey ?? 99) - (b._sortKey ?? 99));
    }

    return groups;
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <Text style={styles.title}>Выберите комплект снаряжения</Text>

          {isLoading ? (
            <ActivityIndicator size="large" color="#005A9C" style={{ marginVertical: 30 }} />
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
                              <Text style={styles.categoryTitle}>{META_CATEGORY_LABELS[category] || 'Снаряжение'}:</Text>
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
                          <Text style={styles.selectButtonText}>Выбрать</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          )}

          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>Закрыть</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

export default EquipmentKitModal;
