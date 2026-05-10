import React, { useMemo, useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useLocale } from '../../../../i18n/locale';
import { getEquipmentCatalog } from '../../../../i18n/equipmentCatalog';
import { applyArmorMods, formatModBonuses } from '../../../../domain/modsEquip';
import { tWeaponsAndArmorScreen } from '../weaponsAndArmorScreenI18n';
import styles from '../../../../styles/ArmorModificationModal.styles';

const hasIntersection = (a = [], b = []) => a.some((x) => b.includes(x));

const parseProtectedAreas = (item) => {
  if (Array.isArray(item?.protectedAreas) && item.protectedAreas.length) return item.protectedAreas;
  return [];
};

const findCatalogArmorById = (catalog, id) => {
  if (!id) return null;
  return catalog?.armorIndex?.byId?.get(id) || null;
};

const findCatalogClothingById = (catalog, id) => {
  if (!id) return null;
  const allClothes = (catalog?.clothes?.clothes || []).flatMap((group) => group.items || []);
  return allClothes.find((item) => item.id === id) || null;
};

const resolveLocalizedItem = (catalog, targetItem, isClothingMode) => {
  if (!targetItem) return null;
  const byId = isClothingMode
    ? findCatalogClothingById(catalog, targetItem.id)
    : findCatalogArmorById(catalog, targetItem.id);

  return {
    ...(byId || {}),
    ...targetItem,
    name: byId?.name || targetItem?.name,
  };
};

const CollapsibleSection = ({ title, children, isExpanded, onToggle }) => (
  <View style={styles.collapsibleSection}>
    <TouchableOpacity onPress={onToggle} style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderTitle}>{title}</Text>
      <Text style={styles.expandIcon}>{isExpanded ? '▼' : '▶'}</Text>
    </TouchableOpacity>
    {isExpanded && <View style={styles.sectionContent}>{children}</View>}
  </View>
);

const ModRow = ({ mod, selected, onPress }) => {
  const meta = formatModBonuses(mod, { improvements: tWeaponsAndArmorScreen('modals.improvements'), effects: tWeaponsAndArmorScreen('modals.effects') });
  return (
    <TouchableOpacity style={[styles.modificationItem, selected && styles.selectedModification]} onPress={onPress}>
      <Text style={styles.modificationName}>{mod.name}</Text>
      <Text style={styles.modificationText}>{meta.bonuses}</Text>
      <Text style={styles.modificationText}>{meta.effects}</Text>
      <Text style={styles.modificationText}>{tWeaponsAndArmorScreen('modals.requirements')}: {mod.requiredPerk || '—'}</Text>
    </TouchableOpacity>
  );
};

const ArmorModificationModal = ({ visible, onClose, targetItem, mode = 'armor', onApply }) => {
  const locale = useLocale();
  const catalog = useMemo(() => getEquipmentCatalog(locale), [locale]);
  const [selectedStd, setSelectedStd] = useState(null);
  const [selectedUniq, setSelectedUniq] = useState(null);
  const [expandedCategories, setExpandedCategories] = useState({ standard: false, unique: false });

  const isClothingMode = mode === 'clothing';
  const stdKey = isClothingMode ? 'appliedClothingModId' : 'appliedArmorModId';
  const uniqKey = isClothingMode ? null : 'appliedUniqueArmorModId';
  const localizedTargetItem = useMemo(
    () => resolveLocalizedItem(catalog, targetItem, isClothingMode),
    [catalog, targetItem, isClothingMode],
  );

  useEffect(() => {
    if (!visible || !localizedTargetItem) return;
    setSelectedStd(localizedTargetItem[stdKey] || null);
    setSelectedUniq(uniqKey ? (localizedTargetItem[uniqKey] || null) : null);
    setExpandedCategories({ standard: false, unique: false });
  }, [visible, localizedTargetItem, stdKey, uniqKey]);

  const { standardMods, uniqueMods } = useMemo(() => {
    if (!localizedTargetItem) return { standardMods: [], uniqueMods: [] };

    const area = parseProtectedAreas(localizedTargetItem);
    const categoryCfg = catalog?.armorRaw?.[localizedTargetItem.armorCategoryKey] || null;
    const allowedStd = new Set(categoryCfg?.allowedModCategories || ['standardMods']);
    const allowedUniq = new Set(categoryCfg?.allowedUniqueModCategories || []);

    if (isClothingMode) {
      return { standardMods: [], uniqueMods: [] };
    }

    const standardMods = (catalog.armorMods || []).filter((m) =>
      allowedStd.has(m.modCategory) && hasIntersection(m.protectedAreas || [], area),
    );

    const uniqueMods = (catalog.uniqArmorMods || []).filter((m) =>
      (allowedUniq.size === 0 || allowedUniq.has(m.modCategory)) && hasIntersection(m.protectedAreas || [], area),
    );

    return { standardMods, uniqueMods };
  }, [localizedTargetItem, catalog, isClothingMode]);

  const previewItem = useMemo(() => {
    if (!localizedTargetItem) return null;
    const simulatedItem = {
      ...localizedTargetItem,
      [stdKey]: selectedStd || null,
      ...(uniqKey ? { [uniqKey]: selectedUniq || null } : {}),
    };

    return applyArmorMods(simulatedItem, catalog, {
      standardKey: stdKey,
      uniqueKey: uniqKey || 'unusedUniqueKey',
      standardMods,
      uniqueMods,
    });
  }, [localizedTargetItem, catalog, stdKey, uniqKey, selectedStd, selectedUniq, standardMods, uniqueMods]);

  const handleToggleCategory = (key) => {
    setExpandedCategories((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const apply = () => {
    if (!localizedTargetItem) return;
    const payload = { ...localizedTargetItem, [stdKey]: selectedStd || null };
    if (uniqKey) payload[uniqKey] = selectedUniq || null;
    onApply(payload);
    onClose();
  };

  if (!localizedTargetItem) {
    return null;
  }

  const baseName = localizedTargetItem?.name || '—';
  const previewEffects = (previewItem?.effects?.bonusEffects || []).map((x) => x.description).filter(Boolean);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{isClothingMode ? tWeaponsAndArmorScreen('modals.clothingModification') : tWeaponsAndArmorScreen('modals.armorModification')}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>
            <View style={styles.itemInfo}>
              <Text style={styles.itemTitle}>{baseName}</Text>
              <Text style={styles.itemStats}>
                {tWeaponsAndArmorScreen('armor.fields.physical')}: {localizedTargetItem.physicalDamageRating || 0} | {tWeaponsAndArmorScreen('armor.fields.energy')}: {localizedTargetItem.energyDamageRating || 0} | {tWeaponsAndArmorScreen('armor.fields.radiation')}: {localizedTargetItem.radiationDamageRating || 0}
              </Text>
            </View>

            <View style={styles.modificationsSection}>
              <Text style={styles.sectionTitle}>{tWeaponsAndArmorScreen('modals.availableModifications')}:</Text>

              <CollapsibleSection
                title={`${tWeaponsAndArmorScreen('modals.standard')} (${standardMods.length})`}
                isExpanded={expandedCategories.standard}
                onToggle={() => handleToggleCategory('standard')}
              >
                {!isClothingMode && (
                  <TouchableOpacity
                    style={[styles.modificationItem, !selectedStd && styles.selectedModification]}
                    onPress={() => setSelectedStd(null)}
                  >
                    <Text style={styles.modificationName}>{selectedStd ? tWeaponsAndArmorScreen('modals.removeStandard') : tWeaponsAndArmorScreen('modals.noStandard')}</Text>
                  </TouchableOpacity>
                )}
                {standardMods.map((m) => (
                  <ModRow key={m.id} mod={m} selected={selectedStd === m.id} onPress={() => setSelectedStd(m.id)} />
                ))}
              </CollapsibleSection>

              {!isClothingMode && (
                <CollapsibleSection
                  title={`${tWeaponsAndArmorScreen('modals.unique')} (${uniqueMods.length})`}
                  isExpanded={expandedCategories.unique}
                  onToggle={() => handleToggleCategory('unique')}
                >
                  <TouchableOpacity
                    style={[styles.modificationItem, !selectedUniq && styles.selectedModification]}
                    onPress={() => setSelectedUniq(null)}
                  >
                    <Text style={styles.modificationName}>{selectedUniq ? tWeaponsAndArmorScreen('modals.removeUnique') : tWeaponsAndArmorScreen('modals.noUnique')}</Text>
                  </TouchableOpacity>
                  {uniqueMods.map((m) => (
                    <ModRow key={m.id} mod={m} selected={selectedUniq === m.id} onPress={() => setSelectedUniq(m.id)} />
                  ))}
                </CollapsibleSection>
              )}
            </View>

            <View style={styles.previewSection}>
              <Text style={styles.sectionTitle}>{tWeaponsAndArmorScreen('modals.preview')}:</Text>
              <View style={styles.previewContent}>
                <Text style={styles.previewTitle}>{previewItem?.item?.name || baseName}</Text>
                <Text style={styles.previewStats}>
                  {tWeaponsAndArmorScreen('armor.fields.physical')}: {previewItem?.item?.physicalDamageRating || 0} | {tWeaponsAndArmorScreen('armor.fields.energy')}: {previewItem?.item?.energyDamageRating || 0} | {tWeaponsAndArmorScreen('armor.fields.radiation')}: {previewItem?.item?.radiationDamageRating || 0}
                </Text>
                <Text style={styles.previewStats}>{tWeaponsAndArmorScreen('modals.weight')}: {previewItem?.item?.weight ?? localizedTargetItem?.weight ?? 0}</Text>
                <Text style={styles.previewStats}>{tWeaponsAndArmorScreen('modals.cost')}: {previewItem?.item?.cost ?? localizedTargetItem?.cost ?? 0}</Text>
                <Text style={styles.previewText}>{tWeaponsAndArmorScreen('modals.effects')}: {previewEffects.length ? previewEffects.join(' | ') : '—'}</Text>
              </View>
            </View>
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity onPress={onClose} style={styles.cancelButton}>
              <Text style={styles.cancelButtonText}>{tWeaponsAndArmorScreen('modals.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={apply} style={styles.applyButton}>
              <Text style={styles.applyButtonText}>{tWeaponsAndArmorScreen('modals.apply')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default ArmorModificationModal;
