import React, { useMemo, useState } from 'react';
import { renderTextWithIcons } from '../../../WeaponsAndArmorScreen/textUtils';
import { View, Text, TouchableOpacity, Modal, StyleSheet, ScrollView } from 'react-native';
import { getTraitI18nById, findTraitById } from '../../../../../../domain/traits';
import { tCharacterScreen, getSkillDisplayName } from '../../logic/characterScreenI18n';
import { ALL_SKILL_KEYS } from '../../../../../../domain/characterCreation';

export const traitConfig = { originId: 'tribal', modalType: 'choice' };

const TRIBAL_TRAIT_IDS = [
  'tribal-mother-wasteland',
  'tribal-nomad',
  'tribal-rite-of-passage',
  'tribal-old-world-tools',
  'tribal-chosen-one',
];

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

const TribalModal = ({
  visible,
  onSelect,
  onClose,
  skills, // optional, for "any" skill pick
}) => {
  const [selectionMode, setSelectionMode] = useState(null);
  const [tribalTraits, setTribalTraits] = useState([]);
  const [survivorTraits, setSurvivorTraits] = useState([]);
  const [singleTraitPick, setSingleTraitPick] = useState(null);

  // Skill pick state
  const [skillPickStep, setSkillPickStep] = useState(false);
  const [pendingTraitData, setPendingTraitData] = useState(null);
  const [skillPicks, setSkillPicks] = useState([]);

  const traitCatalog = useMemo(() => ({
    tribal: TRIBAL_TRAIT_IDS.map((id) => ({ id, ...getTraitI18nById(id) })),
    survivor: SURVIVOR_TRAIT_IDS.map((id) => ({ id, ...getTraitI18nById(id) })),
    ncr: NCR_TRAIT_IDS.map((id) => ({ id, ...getTraitI18nById(id) })),
  }), []);

  const resetState = () => {
    setSelectionMode(null);
    setTribalTraits([]);
    setSurvivorTraits([]);
    setSingleTraitPick(null);
    setSkillPickStep(false);
    setPendingTraitData(null);
    setSkillPicks([]);
  };

  const canConfirm = () => {
    if (selectionMode === 'two_traits') {
      return tribalTraits.length + survivorTraits.length === 2;
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
      ? `${tCharacterScreen('origins.tribal')}: ${selectedNames.join(' + ')}`
      : `${tCharacterScreen('origins.tribal')}: ${selectedNames[0]} + ` + tCharacterScreen('labels.onePerk');

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
      selectedIds = [...tribalTraits, ...survivorTraits];
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
        bannedTagSkills: [...new Set([...(acc.bannedTagSkills || []), ...(baseModifiers.bannedTagSkills || [])])],
        effects: [...new Set([...(acc.effects || []), ...(baseModifiers.effects || [])])],
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

  const renderTraitButton = (trait, list, setList) => {
    const isSelected = Array.isArray(list) && list.includes(trait.id);
    return (
      <TouchableOpacity
        key={trait.id}
        style={[styles.modalButton, styles.skillOption, isSelected && styles.selectedButton]}
        onPress={() => {
          if (selectionMode === 'two_traits') {
            const total = tribalTraits.length + survivorTraits.length;
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
              <Text style={styles.modalTitle}>{tCharacterScreen('modals.origins.tribalTitle')}</Text>
              {!selectionMode && (
                <View style={{ width: '100%' }}>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.skillOption]}
                    onPress={() => { setTribalTraits([]); setSurvivorTraits([]); setSelectionMode('two_traits'); }}
                  >
                    <Text style={styles.buttonText}>{tCharacterScreen('modals.tribal.twoTraits')}</Text>
                    <Text style={styles.descriptionText}>{tCharacterScreen('modals.tribal.twoTraitsDesc')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.skillOption]}
                    onPress={() => setSelectionMode('trait_and_perk')}
                  >
                    <Text style={styles.buttonText}>{tCharacterScreen('modals.tribal.oneTraitOnePerk')}</Text>
                  </TouchableOpacity>
                  {/* Отмена — закрыть модалку, ничего не выбрав */}
                  <TouchableOpacity
                    style={[styles.modalButton, styles.cancelButton]}
                    onPress={onClose}
                  >
                    <Text style={styles.buttonText}>{tCharacterScreen('buttons.cancel')}</Text>
                  </TouchableOpacity>
                </View>
              )}

              {selectionMode && (
                <ScrollView style={{ width: '100%', maxHeight: 360 }}>
                  {selectionMode === 'two_traits' && (
                    <Text style={styles.hintText}>{tCharacterScreen('modals.tribal.selectTwoTraitsHint')}</Text>
                  )}
                  <Text style={styles.sectionTitle}>{tCharacterScreen('modals.tribal.tribalTraitsList')}</Text>
                  {traitCatalog.tribal.map((trait) =>
                    renderTraitButton(
                      { ...trait, isSelected: selectionMode === 'trait_and_perk' ? singleTraitPick === trait.id : tribalTraits.includes(trait.id) },
                      tribalTraits,
                      setTribalTraits,
                    )
                  )}
                  <Text style={styles.sectionTitle}>{tCharacterScreen('modals.tribal.survivorTraitsList')}</Text>
                  {traitCatalog.survivor.map((trait) =>
                    renderTraitButton(
                      { ...trait, isSelected: selectionMode === 'trait_and_perk' ? singleTraitPick === trait.id : survivorTraits.includes(trait.id) },
                      survivorTraits,
                      setSurvivorTraits,
                    )
                  )}
                  {selectionMode === 'trait_and_perk' && (
                    <>
                      <Text style={styles.sectionTitle}>{tCharacterScreen('modals.tribal.ncrTraitsList')}</Text>
                      {traitCatalog.ncr.map((trait) =>
                        renderTraitButton(
                          { ...trait, isSelected: singleTraitPick === trait.id },
                          null,
                          () => {},
                        )
                      )}
                    </>
                  )}
                  <TouchableOpacity
                    style={[styles.modalButton, styles.confirmButton, !canConfirm() && styles.disabledButton]}
                    disabled={!canConfirm()}
                    onPress={handleConfirm}
                  >
                    <Text style={styles.buttonText}>{tCharacterScreen('buttons.confirmSelection')}</Text>
                  </TouchableOpacity>
                  {/* Назад — вернуться к выбору режима (2 черты / 1 черта+перк) */}
                  <TouchableOpacity
                    style={[styles.modalButton, styles.cancelButton]}
                    onPress={() => {
                      setTribalTraits([]);
                      setSurvivorTraits([]);
                      setSingleTraitPick(null);
                      setSelectionMode(null);
                    }}
                  >
                    <Text style={styles.buttonText}>{tCharacterScreen('buttons.cancel')}</Text>
                  </TouchableOpacity>
                </ScrollView>
              )}
            </>
          ) : (
            <>
              <Text style={styles.modalTitle}>{tCharacterScreen('modals.skillPick.title')}</Text>
              <Text style={styles.hintText}>
                {tCharacterScreen('modals.skillPick.description')}
                {'\n'}
                {tCharacterScreen('labels.needToPick')}: {pendingTraitData?.totalCount}
              </Text>
              <ScrollView style={{ width: '100%', maxHeight: 320 }}>
                {(pendingTraitData?.options || []).map((skillKey) => {
                  const selected = skillPicks.includes(skillKey);
                  return (
                    <TouchableOpacity
                      key={skillKey}
                      style={[styles.modalButton, styles.skillOption, selected && styles.selectedButton]}
                      onPress={() => toggleSkillPick(skillKey)}
                    >
                      <Text style={styles.buttonText}>{getSkillDisplayName(skillKey)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton, skillPicks.length !== (pendingTraitData?.totalCount || 0) && styles.disabledButton]}
                disabled={skillPicks.length !== (pendingTraitData?.totalCount || 0)}
                onPress={confirmSkillPick}
              >
                <Text style={styles.buttonText}>{tCharacterScreen('buttons.confirm')}</Text>
              </TouchableOpacity>
              {/* Назад — вернуться к выбору черт */}
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setSkillPickStep(false);
                  setSkillPicks([]);
                  setPendingTraitData(null);
                }}
              >
                <Text style={styles.buttonText}>{tCharacterScreen('buttons.cancel')}</Text>
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
  modalContainer: { width: '85%', maxWidth: 460, backgroundColor: 'white', borderRadius: 10, padding: 20, alignItems: 'center', maxHeight: '85%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10, textAlign: 'center' },
  modalButton: { padding: 12, marginVertical: 5, borderRadius: 6, alignItems: 'center', width: '100%' },
  skillOption: { backgroundColor: '#2196F3', alignItems: 'flex-start', paddingHorizontal: 15 },
  cancelButton: { backgroundColor: '#9E9E9E', marginTop: 10 },
  confirmButton: { backgroundColor: '#4CAF50' },
  backButton: { backgroundColor: '#757575' },
  disabledButton: { opacity: 0.5 },
  sectionTitle: { color: '#000', fontWeight: '700', marginTop: 10, marginBottom: 6, textAlign: 'left', alignSelf: 'flex-start' },
  hintText: { color: '#333', fontSize: 12, marginBottom: 4, textAlign: 'center' },
  selectedButton: { borderWidth: 2, borderColor: '#FFFFFF', backgroundColor: '#1976D2' },
  buttonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  descriptionText: { color: 'white', fontSize: 12, marginTop: 5 },
});

export default TribalModal;
