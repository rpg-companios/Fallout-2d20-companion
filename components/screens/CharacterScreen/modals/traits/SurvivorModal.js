import React, { useMemo, useState } from 'react';
import { renderTextWithIcons } from '../../../WeaponsAndArmorScreen/textUtils';
import { View, Text, TouchableOpacity, Modal, StyleSheet, ScrollView } from 'react-native';
import { getTraitI18nById, findTraitById } from '../../../../../domain/traits';
import { tCharacterScreen, getSkillDisplayName } from '../../logic/characterScreenI18n';
import { ALL_SKILL_KEYS } from '../../../../../domain/characterCreation';


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

const SurvivorModal = ({
  visible,
  onSelect,
  onClose,
  modalTitle = tCharacterScreen('modals.origins.survivorTitle'),
  originLabel = tCharacterScreen('origins.survivor'),
  skills, // optional, for "any" skill pick
}) => {
  const [selectionMode, setSelectionMode] = useState(null);
  const [survivorTrait, setSurvivorTrait] = useState(null);
  const [ncrTrait, setNcrTrait] = useState(null);
  const [singleTraitPick, setSingleTraitPick] = useState(null);

  // Skill pick state
  const [skillPickStep, setSkillPickStep] = useState(false);
  const [pendingTraitData, setPendingTraitData] = useState(null);
  const [skillPicks, setSkillPicks] = useState([]);

  const traitCatalog = useMemo(() => ({
    survivor: SURVIVOR_TRAIT_IDS.map((id) => ({ id, ...getTraitI18nById(id) })),
    ncr: NCR_TRAIT_IDS.map((id) => ({ id, ...getTraitI18nById(id) })),
  }), []);

  const resetState = () => {
    setSelectionMode(null);
    setSurvivorTrait(null);
    setNcrTrait(null);
    setSingleTraitPick(null);
    setSkillPickStep(false);
    setPendingTraitData(null);
    setSkillPicks([]);
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

  // --- skill pick helpers ---
  const getSkillPickMeta = (selectedIds) => {
    let totalCount = 0;
    let options = [];
    let isAny = false;
    selectedIds.forEach(id => {
      const dataEntry = findTraitById(id);
      const spc = dataEntry?.modifiers?.skillPickChoice;
      if (spc) {
        totalCount += spc.count || 0;
        if (spc.from === 'any') {
          isAny = true;
        } else if (Array.isArray(spc.from)) {
          options = [...new Set([...options, ...spc.from])];
        }
      }
    });
    if (isAny) {
      options = (skills && skills.length) ? skills.map(s => s.name || s) : ALL_SKILL_KEYS;
    }
    return { totalCount, options };
  };

  const finalizeSelect = (selectedIds, selectedNames, mergedModifiers, extraSkillPicks = []) => {
    let finalMods = { ...mergedModifiers };
    if (extraSkillPicks.length > 0) {
      finalMods = {
        ...finalMods,
        skillPickSelected: extraSkillPicks,
        forcedSkills: [...new Set([...(finalMods.forcedSkills || []), ...extraSkillPicks])],
        extraSkills: (finalMods.extraSkills || 0) + extraSkillPicks.length,
      };
    }

    const traitTitle = selectionMode === 'two_traits'
      ? `${originLabel}: ${selectedNames.join(' + ')}`
      : `${originLabel}: ${selectedNames[0]} + ` + tCharacterScreen('labels.onePerk');

    onSelect(selectedIds, traitTitle, {
      ...finalMods,
      selectedTraitNames: selectedNames,
      selectedTraitIds: selectedIds,
      selectionMode,
    });
    resetState();
    onClose();
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

    const selectedNames = selectedIds.map((id) => getTraitI18nById(id).name);

    const mergedModifiers = selectedIds.reduce((acc, id) => {
      const dataEntry = findTraitById(id);
      const baseModifiers = dataEntry?.modifiers || {};
      return {
        ...acc,
        ...baseModifiers,
        attributes: { ...(acc.attributes || {}), ...(baseModifiers.attributes || {}) },
        attributePointsBonus: (acc.attributePointsBonus || 0) + (baseModifiers.attributePointsBonus || 0),
        forcedSkills: [...(acc.forcedSkills || []), ...(baseModifiers.forcedSkills || [])],
        extraSkills: (acc.extraSkills || 0) + (baseModifiers.extraSkills || 0),
      };
    }, {});

    if (selectionMode === 'trait_and_perk') {
      mergedModifiers.extraPerkSlots = (mergedModifiers.extraPerkSlots || 0) + 1;
    }

    // Check if any selected trait needs skill pick
    const { totalCount, options } = getSkillPickMeta(selectedIds);
    if (totalCount > 0) {
      setPendingTraitData({ selectedIds, selectedNames, mergedModifiers, totalCount, options });
      setSkillPicks([]);
      setSkillPickStep(true);
      return;
    }

    finalizeSelect(selectedIds, selectedNames, mergedModifiers, []);
  };

  const toggleSkillPick = (skillKey) => {
    const maxCount = pendingTraitData?.totalCount || 0;
    setSkillPicks(prev => {
      if (prev.includes(skillKey)) return prev.filter(s => s !== skillKey);
      if (prev.length >= maxCount) return prev;
      return [...prev, skillKey];
    });
  };

  const confirmSkillPick = () => {
    if (!pendingTraitData) return;
    const maxCount = pendingTraitData.totalCount;
    if (skillPicks.length !== maxCount) return;
    finalizeSelect(
      pendingTraitData.selectedIds,
      pendingTraitData.selectedNames,
      pendingTraitData.mergedModifiers,
      skillPicks
    );
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
          {!skillPickStep ? (
            <>
              <Text style={styles.modalTitle}>{modalTitle}</Text>
              {!selectionMode && (
                <View style={{ width: '100%' }}>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.skillOption]}
                    onPress={() => { setSurvivorTrait([]); setNcrTrait([]); setSelectionMode('two_traits'); }}
                  >
                    <Text style={styles.buttonText}>{tCharacterScreen('modals.survivor.twoTraits')}</Text>
                    <Text style={styles.descriptionText}>{tCharacterScreen('modals.survivor.twoTraitsDesc')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.skillOption]}
                    onPress={() => setSelectionMode('trait_and_perk')}
                  >
                    <Text style={styles.buttonText}>{tCharacterScreen('modals.survivor.oneTraitOnePerk')}</Text>
                  </TouchableOpacity>
                </View>
              )}

              {selectionMode && (
                <ScrollView style={{ width: '100%', maxHeight: 360 }}>
                  {selectionMode === 'two_traits' && (
                    <Text style={styles.hintText}>{tCharacterScreen('modals.survivor.selectTwoTraitsHint')}</Text>
                  )}
                  <Text style={styles.sectionTitle}>{tCharacterScreen('modals.survivor.survivorTraitsList')}</Text>
                  {traitCatalog.survivor.map((trait) =>
                    renderTraitButton(
                      { ...trait, isSelected: selectionMode === 'trait_and_perk' ? singleTraitPick === trait.id : isPicked(trait.id, survivorTrait || []) },
                      survivorTrait || [],
                      setSurvivorTrait,
                      ncrTrait || [],
                    )
                  )}
                  <Text style={styles.sectionTitle}>{tCharacterScreen('modals.survivor.ncrTraitsList')}</Text>
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
                  <Text style={styles.buttonText}>{tCharacterScreen('buttons.confirmSelection')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => { resetState(); onClose(); }}
              >
                <Text style={styles.buttonText}>{tCharacterScreen('buttons.cancel')}</Text>
              </TouchableOpacity>
            </>
          ) : (
            // Skill pick step
            <>
              <Text style={styles.modalTitle}>{tCharacterScreen('modals.skillPick.title')}</Text>
              <Text style={styles.hintText}>
                {pendingTraitData?.totalCount > 1
                  ? tCharacterScreen('modals.skillPick.chooseN').replace('{count}', String(pendingTraitData.totalCount))
                  : tCharacterScreen('modals.skillPick.choose1')
                }
              </Text>
              <Text style={[styles.descriptionText, { color: '#333', marginBottom: 8, textAlign: 'center' }]}>
                {tCharacterScreen('modals.skillPick.description')}
              </Text>
              <ScrollView style={{ width: '100%', maxHeight: 320 }}>
                {(pendingTraitData?.options || []).map(skillKey => {
                  const isPickedSkill = skillPicks.includes(skillKey);
                  const disabled = !isPickedSkill && skillPicks.length >= (pendingTraitData?.totalCount || 0);
                  return (
                    <TouchableOpacity
                      key={skillKey}
                      style={[
                        styles.modalButton,
                        styles.skillOption,
                        isPickedSkill && styles.selectedButton,
                        disabled && styles.disabledButton,
                      ]}
                      onPress={() => toggleSkillPick(skillKey)}
                      disabled={disabled && !isPickedSkill}
                    >
                      <Text style={styles.buttonText}>{getSkillDisplayName(skillKey)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <Text style={{ color: '#000', marginVertical: 6, fontWeight: '600' }}>
                {skillPicks.length} / {pendingTraitData?.totalCount || 0}
              </Text>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton, skillPicks.length !== (pendingTraitData?.totalCount || 0) && styles.disabledButton]}
                disabled={skillPicks.length !== (pendingTraitData?.totalCount || 0)}
                onPress={confirmSkillPick}
              >
                <Text style={styles.buttonText}>{tCharacterScreen('buttons.confirm')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.backButton]}
                onPress={() => { setSkillPickStep(false); setPendingTraitData(null); setSkillPicks([]); }}
              >
                <Text style={styles.buttonText}>{tCharacterScreen('buttons.back')}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.5)' },
  modalContainer: { width: '85%', maxWidth: 460, backgroundColor: 'white', borderRadius: 10, padding: 20, alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10, textAlign: 'center' },
  modalButton: { padding: 12, marginVertical: 5, borderRadius: 6, alignItems: 'center', width: '100%' },
  skillOption: { backgroundColor: '#2196F3', alignItems: 'flex-start', paddingHorizontal: 15 },
  cancelButton: { backgroundColor: '#9E9E9E', marginTop: 10 },
  confirmButton: { backgroundColor: '#4CAF50' },
  backButton: { backgroundColor: '#757575' },
  disabledButton: { opacity: 0.5 },
  sectionTitle: { color: '#000', fontWeight: '700', marginTop: 10, marginBottom: 6 },
  hintText: { color: '#333', fontSize: 12, marginBottom: 4, textAlign: 'center' },
  selectedButton: { borderWidth: 2, borderColor: '#FFFFFF', backgroundColor: '#1976D2' },
  buttonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  descriptionText: { color: 'white', fontSize: 12, marginTop: 5 },
});

export default SurvivorModal;
