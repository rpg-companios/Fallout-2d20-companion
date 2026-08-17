import React, { useMemo } from 'react';
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
import { applyLimbReplacement } from '../../../../domain/robotEquip';
import { useLocale, useModuleLocale } from '../../../../i18n/locale';
import { getEquipmentCatalog } from '../../../../i18n/equipmentCatalog';
import { tCharacterScreen } from '../logic/characterScreenI18n';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a localized limb catalog from the active setting catalog. */
const getLimbCatalogForSlot = (catalog, slotKey) => {
  if (slotKey === 'head') return catalog.robotHeads || [];
  if (slotKey === 'body') return catalog.robotBody || [];
  if (
    slotKey === 'leftArm' ||
    slotKey === 'rightArm' ||
    slotKey.startsWith('arm')
  ) {
    return catalog.robotArms || [];
  }
  return catalog.robotLegs || [];
};

/**
 * Returns the itemType that should be used to filter limbs for a given slotKey.
 */
const getItemTypeForSlot = (slotKey) => {
  if (slotKey === 'head') return 'robotHead';
  if (slotKey === 'body') return 'robotBody';
  if (slotKey === 'leftArm' || slotKey === 'rightArm' || slotKey.startsWith('arm')) return 'robotArm';
  return 'robotLegs';
};

/**
 * Maps bodyPlan to the arm slot names used in robot arms catalog `slots` field.
 * Used as a fallback when arms don't have compatibleBodyPlans.
 */
const BODY_PLAN_ARM_SLOTS = {
  misterHandy: ['Arm 1', 'Arm 2', 'Arm 3'],
  protectron:  ['Left Arm', 'Right Arm'],
  assaultron:  ['Left Arm', 'Right Arm'],
  robobrain:   ['Left Arm', 'Right Arm'],
  sentryBot:   ['Left Arm', 'Right Arm'],
};

/**
 * Filters limbs by bodyPlan compatibility.
 * A limb is compatible if:
 *   - limb.compatibleBodyPlans includes bodyPlan, OR
 *   - limb.defaultForBodyPlan === bodyPlan, OR
 *   - limb.robotBodyPlan === bodyPlan (used in robotbody.json), OR
 *   - limb.slots intersects with the expected arm slots for the bodyPlan (arms fallback)
 * If no limbs match any of the above, all limbs are returned (graceful fallback).
 */
const filterByBodyPlan = (limbs, bodyPlan) => {
  if (!bodyPlan) return limbs;

  const filtered = limbs.filter((limb) => {
    if (Array.isArray(limb.compatibleBodyPlans) && limb.compatibleBodyPlans.includes(bodyPlan)) {
      return true;
    }
    if (limb.defaultForBodyPlan === bodyPlan) return true;
    if (limb.robotBodyPlan === bodyPlan) return true;
    // Arms fallback: check slots field intersection
    const expectedSlots = BODY_PLAN_ARM_SLOTS[bodyPlan];
    if (expectedSlots && Array.isArray(limb.slots)) {
      return limb.slots.some((s) => expectedSlots.includes(s));
    }
    return false;
  });

  // Graceful fallback: if nothing matched, show all
  return filtered.length > 0 ? filtered : limbs;
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

const LimbCard = ({ limb, isSelected, onPress }) => (
  <TouchableOpacity
    style={[styles.limbCard, isSelected && styles.limbCardSelected]}
    onPress={onPress}
    activeOpacity={0.75}
  >
    <Text style={[styles.limbName, isSelected && styles.limbNameSelected]}>
      {limb.name}
    </Text>
    <View style={styles.statsContainer}>
      {limb.melee   !== undefined && <StatRow label={tCharacterScreen("skillsCatalog.MELEE_WEAPONS")} value={limb.melee} />}
      {limb.guns    !== undefined && <StatRow label={tCharacterScreen("skillsCatalog.SMALL_GUNS")}    value={limb.guns} />}
      {limb.mind    !== undefined && <StatRow label={tCharacterScreen("labels.mind")}       value={limb.mind} />}
      {limb.other   !== undefined && <StatRow label={tCharacterScreen("labels.other")}      value={limb.other} />}
      {limb.body    !== undefined && <StatRow label={tCharacterScreen("labels.body")}      value={limb.body} />}
      {limb.carryWeight !== undefined && <StatRow label={tCharacterScreen("labels.carryWeight")} value={limb.carryWeight} />}
      {limb.rarity  !== undefined && <StatRow label={tCharacterScreen("labels.rarity")}    value={limb.rarity} />}
      {limb.complexity !== undefined && <StatRow label={tCharacterScreen("labels.complexity")} value={limb.complexity} />}
    </View>
    {Array.isArray(limb.perksRequired) && limb.perksRequired.length > 0 && (
      <Text style={styles.perksRequired}>
        {tCharacterScreen("labels.requires")}{limb.perksRequired.join(', ')}
      </Text>
    )}
  </TouchableOpacity>
);

// ---------------------------------------------------------------------------
// LimbUpgradeModal
// ---------------------------------------------------------------------------

/**
 * Props:
 *   visible      {boolean}
 *   slotKey      {string}   - e.g. "leftArm", "head", "arm1"
 *   currentLimb  {object|null}
 *   bodyPlan     {string}   - robot body plan key
 *   onClose      {function}
 */
const LimbUpgradeModal = ({ visible, slotKey, currentLimb, bodyPlan, onClose }) => {
  const { equippedRobotSlots, setEquippedRobotSlots, setEquippedWeapons, equipment, setEquipment } =
    useCharacter();
  useLocale();
  const moduleLocale = useModuleLocale();
  const equipmentCatalog = useMemo(
    () => getEquipmentCatalog(moduleLocale),
    [moduleLocale],
  );

  // Build filtered limb list
  const compatibleLimbs = useMemo(() => {
    if (!slotKey) return [];
    const catalog = getLimbCatalogForSlot(equipmentCatalog, slotKey);
    const itemType = getItemTypeForSlot(slotKey);
    const byType = catalog.filter((l) => l.itemType === itemType);
    return filterByBodyPlan(byType, bodyPlan);
  }, [equipmentCatalog, slotKey, bodyPlan]);

  const handleSelect = (newLimb) => {
    if (!equippedRobotSlots || !slotKey) return;

    // Apply limb replacement using the active setting locale catalog.
    const { slots: updatedSlots, weapons: updatedWeapons } = applyLimbReplacement(
      equippedRobotSlots,
      slotKey,
      newLimb,
      equipmentCatalog.robotWeaponsOnly || [],
    );

    // Move old limb to inventory if it exists
    if (currentLimb) {
      const inventoryItem = {
        ...currentLimb,
        uniqueId: `limb_${currentLimb.id}_${Date.now()}`,
      };
      setEquipment((prev) => ({
        ...prev,
        items: [...(prev?.items || []), inventoryItem],
      }));
    }

    setEquippedRobotSlots(updatedSlots);
    setEquippedWeapons(updatedWeapons);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.container} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>{tCharacterScreen("modals.limb.upgradeLimb")}</Text>

          {compatibleLimbs.length === 0 ? (
            <Text style={styles.emptyText}>{tCharacterScreen("modals.limb.noLimbs")}</Text>
          ) : (
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {compatibleLimbs.map((limb) => {
                const isSelected = currentLimb?.id === limb.id;
                return (
                  <LimbCard
                    key={limb.id}
                    limb={limb}
                    isSelected={isSelected}
                    onPress={() => handleSelect(limb)}
                  />
                );
              })}
            </ScrollView>
          )}

          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>{tCharacterScreen('buttons.close')}</Text>
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
    color: '#1a1a1a',
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
  limbCard: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
    backgroundColor: '#fafafa',
  },
  limbCardSelected: {
    borderColor: '#005A9C',
    backgroundColor: '#e8f0fb',
  },
  limbName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 6,
  },
  limbNameSelected: {
    color: '#005A9C',
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
  perksRequired: {
    fontSize: 10,
    color: '#c0392b',
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

export default LimbUpgradeModal;
