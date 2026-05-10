import React, { useMemo, useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Pressable,
} from 'react-native';
import { useCharacter } from '../../../CharacterContext';
import { canEquipRobotArmor } from '../../../../domain/robotEquip';
import { getCurrentLocale } from '../../../../i18n/locale';

// ---------------------------------------------------------------------------
// Static data imports — raw stats
// ---------------------------------------------------------------------------
import dataPlating from '../../../../data/equipment/robot/armor_plating.json';
import dataArmor   from '../../../../data/equipment/robot/armor.json';
import dataFrames  from '../../../../data/equipment/robot/frames.json';

// ---------------------------------------------------------------------------
// i18n imports
// ---------------------------------------------------------------------------
import ruPlating from '../../../../i18n/ru-RU/data/equipment/robot/plating.json';
import ruArmor   from '../../../../i18n/ru-RU/data/equipment/robot/armor.json';
import ruFrames  from '../../../../i18n/ru-RU/data/equipment/robot/frames.json';

import enPlating from '../../../../i18n/en-EN/data/equipment/robot/plating.json';
import enArmor   from '../../../../i18n/en-EN/data/equipment/robot/armor.json';
import enFrames  from '../../../../i18n/en-EN/data/equipment/robot/frames.json';

// ---------------------------------------------------------------------------
// Layer colors (matches RobotSlot.js)
// ---------------------------------------------------------------------------
const LAYER_COLORS = {
  plating: '#4a90d9',
  armor:   '#e67e22',
  frame:   '#27ae60',
};

// ---------------------------------------------------------------------------
// Slot → robotLocation mapping
// ---------------------------------------------------------------------------
const SLOT_LOCATION_MAP = {
  head:      'Optics',
  body:      'Main Body',
  leftArm:   'Arms',
  rightArm:  'Arms',
  arm1:      'Arms',
  arm2:      'Arms',
  arm3:      'Arms',
  leftLeg:   'Thruster',
  rightLeg:  'Thruster',
  thruster:  'Thruster',
  chassis:   'Thruster',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Merge data stats with i18n names by id */
const mergeById = (dataArr, i18nArr) => {
  const i18nMap = Object.fromEntries((i18nArr || []).map((item) => [item.id, item]));
  return (dataArr || []).map((dataItem) => {
    const i18nItem = i18nMap[dataItem.id] || {};
    return { ...dataItem, ...i18nItem, name: i18nItem.name || dataItem.id };
  });
};

/** Maps slotKey to robotLocation string */
const getSlotLocation = (slotKey) => SLOT_LOCATION_MAP[slotKey] ?? null;

/** Returns merged armor catalog for the given layer and locale */
const getArmorCatalogForLayer = (layer, locale) => {
  const isRu = locale === 'ru-RU';
  if (layer === 'plating') {
    return mergeById(dataPlating.plating, isRu ? ruPlating : enPlating);
  }
  if (layer === 'armor') {
    return mergeById(dataArmor.armor, isRu ? ruArmor : enArmor);
  }
  if (layer === 'frame') {
    return mergeById(dataFrames.frames, isRu ? ruFrames : enFrames);
  }
  return [];
};

/** Layer-specific modal title */
const getLayerTitle = (layer, locale) => {
  const isRu = locale === 'ru-RU';
  if (layer === 'plating') return isRu ? 'Улучшить обшивку' : 'Upgrade Plating';
  if (layer === 'armor')   return isRu ? 'Улучшить броню'   : 'Upgrade Armor';
  if (layer === 'frame')   return isRu ? 'Улучшить раму'    : 'Upgrade Frame';
  return isRu ? 'Улучшить броню' : 'Upgrade Armor';
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const StatRow = ({ label, value }) => {
  if (value === null || value === undefined) return null;
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
};

const ArmorCard = ({ item, isSelected, layerColor, onPress, locale }) => {
  const isRu = locale === 'ru-RU';
  const dr = item.damageResistance ?? {};

  return (
    <TouchableOpacity
      style={[styles.armorCard, isSelected && { borderColor: layerColor, backgroundColor: '#f0f7ff' }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={[styles.armorName, isSelected && { color: layerColor }]}>
        {item.name}
      </Text>
      <View style={styles.statsContainer}>
        {dr.physical !== undefined && (
          <StatRow label={isRu ? 'ФЗ' : 'Phys DR'} value={dr.physical} />
        )}
        {dr.energy !== undefined && (
          <StatRow label={isRu ? 'ЭЗ' : 'Enrg DR'} value={dr.energy} />
        )}
        {item.carryWeightModifier !== undefined && item.carryWeightModifier !== 0 && (
          <StatRow label={isRu ? 'Груз' : 'Carry'} value={item.carryWeightModifier > 0 ? `+${item.carryWeightModifier}` : item.carryWeightModifier} />
        )}
      </View>
      {item.perkRequired && (
        <Text style={styles.perkRequired}>
          {isRu ? 'Требует: ' : 'Requires: '}{item.perkRequired}
        </Text>
      )}
      {item.special ? (
        <Text style={styles.specialText}>{item.special}</Text>
      ) : null}
    </TouchableOpacity>
  );
};

// ---------------------------------------------------------------------------
// ArmorLayerModal
// ---------------------------------------------------------------------------

/**
 * Props:
 *   visible      {boolean}
 *   slotKey      {string}        - e.g. "leftArm", "head"
 *   layer        {'plating'|'armor'|'frame'}
 *   currentItem  {object|null}   - currently equipped item in this layer
 *   onClose      {function}
 */
const ArmorLayerModal = ({ visible, slotKey, layer, currentItem, onClose }) => {
  const { equippedRobotSlots, setEquippedRobotSlots } = useCharacter();
  const locale = getCurrentLocale();
  const isRu = locale === 'ru-RU';
  const layerColor = LAYER_COLORS[layer] ?? '#888';
  const [selectedItem, setSelectedItem] = useState(null);

  useEffect(() => {
    if (!visible) {
      setSelectedItem(null);
      return;
    }
    setSelectedItem(currentItem || null);
  }, [visible, currentItem]);

  const compatibleItems = useMemo(() => {
    if (!slotKey || !layer || !equippedRobotSlots) return [];
    const location = getSlotLocation(slotKey);
    if (!location) return [];

    const catalog = getArmorCatalogForLayer(layer, locale);
    return catalog.filter((item) => {
      if (item.robotLocation !== location) return false;
      const { allowed } = canEquipRobotArmor(item, slotKey, layer, equippedRobotSlots);
      return allowed;
    });
  }, [slotKey, layer, equippedRobotSlots, locale]);

  const handleApply = () => {
    if (!equippedRobotSlots || !slotKey) return;
    setEquippedRobotSlots((prev) => ({
      ...prev,
      [slotKey]: {
        ...prev[slotKey],
        [layer]: selectedItem || null,
      },
    }));
    onClose();
  };

  const title = getLayerTitle(layer, locale);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.container} onPress={(e) => e.stopPropagation()}>
          <Text style={[styles.title, { color: layerColor }]}>{title}</Text>

          {compatibleItems.length === 0 && !currentItem ? (
            <Text style={styles.emptyText}>
              {isRu ? 'Нет доступных предметов' : 'No items available'}
            </Text>
          ) : (
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {compatibleItems.map((item) => {
                const isSelected = selectedItem?.id === item.id;
                return (
                  <ArmorCard
                    key={item.id}
                    item={item}
                    isSelected={isSelected}
                    layerColor={layerColor}
                    onPress={() => setSelectedItem((prev) => (prev?.id === item.id ? null : item))}
                    locale={locale}
                  />
                );
              })}
            </ScrollView>
          )}

          <TouchableOpacity style={[styles.closeButton, { backgroundColor: layerColor, marginHorizontal: 12 }]} onPress={handleApply}>
            <Text style={styles.closeButtonText}>
              {isRu ? 'Применить' : 'Apply'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>
              {isRu ? 'Закрыть' : 'Close'}
            </Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    maxHeight: '80%',
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  emptyText: {
    textAlign: 'center',
    color: '#888',
    fontSize: 14,
    marginVertical: 24,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  armorCard: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
    backgroundColor: '#fafafa',
  },
  armorName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 6,
  },
  statsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 4,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 10,
    color: '#666',
    marginRight: 4,
  },
  statValue: {
    fontSize: 11,
    fontWeight: '700',
    color: '#333',
  },
  perkRequired: {
    fontSize: 10,
    color: '#c0392b',
    marginTop: 4,
    fontStyle: 'italic',
  },
  specialText: {
    fontSize: 10,
    color: '#555',
    marginTop: 4,
    fontStyle: 'italic',
  },
  closeButton: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    paddingVertical: 10,
    backgroundColor: '#5a5a5a',
    borderRadius: 6,
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default ArmorLayerModal;
