import React, { useMemo, useState } from 'react';
import { renderTextWithIcons } from '../../../WeaponsAndArmorScreen/textUtils';
import { View, Text, TouchableOpacity, Modal, StyleSheet, ScrollView } from 'react-native';
import { getTraitI18n, findTraitById } from '../../../../../domain/traits';

export const traitConfig = { originId: 'survivor', modalType: 'choice' };

const SURVIVOR_TRAIT_IDS = [
  'survivor-educated',
  'survivor-quick-shot',
  'survivor-gifted',
  'survivor-heavy-handed',
  'survivor-small-frame',
];

const NCR_TRAIT_IDS = [
  'ncr-good-soul',
  'ncr-infantryman',
  'ncr-home-on-the-range',
  'ncr-technique-of-descent',
  'ncr-brahmin-baron',
];

const goodSoulGroup = ['Красноречие', 'Медицина', 'Ремонт', 'Наука', 'Бартер'];

const SurvivorModal = ({
  visible,
  onSelect,
  onClose,
  modalTitle = 'Черта происхождения «Выживший»',
  originLabel = 'Выживший',
}) => {
  const [selectionMode, setSelectionMode] = useState(null);
  const [survivorTrait, setSurvivorTrait] = useState(null);
  const [ncrTrait, setNcrTrait] = useState(null);
  const [singleTraitPick, setSingleTraitPick] = useState(null);

  const traitCatalog = useMemo(() => ({
    survivor: SURVIVOR_TRAIT_IDS.map((id) => ({ id, ...getTraitI18n(id) })),
    ncr: NCR_TRAIT_IDS.map((id) => ({ id, ...getTraitI18n(id) })),
  }), []);

  const resetState = () => {
    setSelectionMode(null);
    setSurvivorTrait(null);
    setNcrTrait(null);
    setSingleTraitPick(null);
  };

  const canConfirm = () => {
    if (selectionMode === 'two_traits') {
      const survList = Array.isArray(survivorTrait) ? survivorTrait : [];
      const ncrList = Array.isArray(ncrTrait) ? ncrTrait : [];
      return survList.length + ncrList.length === 2;
    }
    if (selectionMode === 'trait_and_perk') {
      return !!singleTraitPick;
    }
    return false;
  };

  const handleConfirm = () => {
    if (!canConfirm()) return;

    let selectedIds = [];
    if (selectionMode === 'two_traits') {
      const survList = Array.isArray(survivorTrait) ? survivorTrait : [];
      const ncrList = Array.isArray(ncrTrait) ? ncrTrait : [];
      selectedIds = [...survList, ...ncrList];
    } else if (selectionMode === 'trait_and_perk') {
      selectedIds = [singleTraitPick];
    }

    const selectedNames = selectedIds.map((id) => getTraitI18n(id).name);

    const mergedModifiers = selectedIds.reduce((acc, id) => {
      const dataEntry = findTraitById(id);
      const baseModifiers = dataEntry?.modifiers || {};
      return {
        ...acc,
        ...baseModifiers,
        attributes: { ...(acc.attributes || {}), ...(baseModifiers.attributes || {}) },
        attributePointsBonus: (acc.attributePointsBonus || 0) + (baseModifiers.attributePointsBonus || 0),
        forcedSkills: [...(acc.forcedSkills || []), ...(baseModifiers.forcedSkills || [])],
      };
    }, {});

    if (selectionMode === 'trait_and_perk') {
      mergedModifiers.extraPerkSlots = (mergedModifiers.extraPerkSlots || 0) + 1;
    }

    if (selectedIds.includes('ncr-good-soul')) {
      mergedModifiers.goodSoulPending = true;
      mergedModifiers.goodSoulGroup = [...goodSoulGroup];
    }

    const traitTitle = selectionMode === 'two_traits'
      ? `${originLabel}: ${selectedNames.join(' + ')}`
      : `${originLabel}: ${selectedNames[0]} + 1 перк`;

    onSelect(traitTitle, {
      ...mergedModifiers,
      selectedTraitNames: selectedNames,
      selectedTraitIds: selectedIds,
      selectionMode,
    });
    resetState();
    onClose();
  };

  const isPicked = (id, list) => Array.isArray(list) && list.includes(id);

  const renderTraitButton = (trait, list, setList, otherList) => {
    const isSelected = isPicked(trait.id, list);
    return (
      <TouchableOpacity
        key={trait.id}
        style={[styles.modalButton, styles.skillOption, isSelected && styles.selectedButton]}
        onPress={() => {
          if (selectionMode === 'two_traits') {
            const survList = Array.isArray(survivorTrait) ? survivorTrait : [];
            const ncrList = Array.isArray(ncrTrait) ? ncrTrait : [];
            const total = survList.length + ncrList.length;
            if (list.includes(trait.id)) {
              setList(list.filter((n) => n !== trait.id));
            } else if (total < 2) {
              setList([...list, trait.id]);
            }
          } else {
            setSingleTraitPick(trait.id);
          }
        }}
      >
        <Text style={styles.buttonText}>{trait.name}</Text>
        {renderTextWithIcons(trait.description, styles.descriptionText)}
      </TouchableOpacity>
    );
  };

  return (
    <Modal animationType="fade" transparent={true} visible={visible} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <Text style={styles.modalTitle}>{modalTitle}</Text>
          {!selectionMode && (
            <View style={{ width: '100%' }}>
              <TouchableOpacity
                style={[styles.modalButton, styles.skillOption]}
                onPress={() => { setSurvivorTrait([]); setNcrTrait([]); setSelectionMode('two_traits'); }}
              >
                <Text style={styles.buttonText}>2 черты</Text>
                <Text style={styles.descriptionText}>Любая комбинация: 2 Выжившего, 2 НКР или 1+1</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.skillOption]}
                onPress={() => setSelectionMode('trait_and_perk')}
              >
                <Text style={styles.buttonText}>1 черта и 1 перк</Text>
              </TouchableOpacity>
            </View>
          )}

          {selectionMode && (
            <ScrollView style={{ width: '100%', maxHeight: 360 }}>
              {selectionMode === 'two_traits' && (
                <Text style={styles.hintText}>Выберите 2 черты в любой комбинации.</Text>
              )}
              <Text style={styles.sectionTitle}>Список черт Выжившего</Text>
              {traitCatalog.survivor.map((trait) =>
                renderTraitButton(
                  { ...trait, isSelected: selectionMode === 'trait_and_perk' ? singleTraitPick === trait.id : isPicked(trait.id, survivorTrait || []) },
                  survivorTrait || [],
                  setSurvivorTrait,
                  ncrTrait || [],
                )
              )}
              <Text style={styles.sectionTitle}>Список черт НКР</Text>
              {traitCatalog.ncr.map((trait) =>
                renderTraitButton(
                  { ...trait, isSelected: selectionMode === 'trait_and_perk' ? singleTraitPick === trait.id : isPicked(trait.id, ncrTrait || []) },
                  ncrTrait || [],
                  setNcrTrait,
                  survivorTrait || [],
                )
              )}
            </ScrollView>
          )}

          {selectionMode && (
            <TouchableOpacity
              style={[styles.modalButton, styles.confirmButton, !canConfirm() && styles.disabledButton]}
              disabled={!canConfirm()}
              onPress={handleConfirm}
            >
              <Text style={styles.buttonText}>Подтвердить выбор</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.modalButton, styles.cancelButton]}
            onPress={() => { resetState(); onClose(); }}
          >
            <Text style={styles.buttonText}>Отмена</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.5)' },
  modalContainer: { width: '80%', backgroundColor: 'white', borderRadius: 10, padding: 20, alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  modalButton: { padding: 12, marginVertical: 5, borderRadius: 6, alignItems: 'center', width: '100%' },
  skillOption: { backgroundColor: '#2196F3', alignItems: 'flex-start', paddingHorizontal: 15 },
  cancelButton: { backgroundColor: '#9E9E9E', marginTop: 10 },
  confirmButton: { backgroundColor: '#4CAF50' },
  disabledButton: { opacity: 0.5 },
  sectionTitle: { color: '#000', fontWeight: '700', marginTop: 10, marginBottom: 6 },
  hintText: { color: '#333', fontSize: 12, marginBottom: 4 },
  selectedButton: { borderWidth: 2, borderColor: '#FFFFFF', backgroundColor: '#1976D2' },
  buttonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  descriptionText: { color: 'white', fontSize: 12, marginTop: 5 },
});

export default SurvivorModal;
