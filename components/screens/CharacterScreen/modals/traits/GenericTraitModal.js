import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, ScrollView } from 'react-native';
import { findTraitById, getTraitI18n } from '../../../../../domain/traits';
import { renderTextWithIcons } from '../../../WeaponsAndArmorScreen/textUtils';
import { tCharacterScreen, getSkillDisplayName } from '../../logic/characterScreenI18n';
import { ALL_SKILL_KEYS } from '../../../../../domain/characterCreation';

export const GenericTraitModal = ({ visible, onSelect, onClose, origin, originIdForConfig, skills }) => {
  const actualOriginId = origin?.id || originIdForConfig;
  const fallbackTraitId = `${actualOriginId}-trait`;
  const traitId = origin?.traitIds?.[0] || fallbackTraitId;

  const canonicalTrait = useMemo(() => findTraitById(traitId), [traitId]);
  const { name, description } = getTraitI18n(traitId);

  const skillPickChoice = canonicalTrait?.modifiers?.skillPickChoice || null;

  const [step, setStep] = useState('info'); // 'info' | 'pick'
  const [picks, setPicks] = useState([]);

  const skillOptions = useMemo(() => {
    if (!skillPickChoice) return [];
    const from = skillPickChoice.from;
    if (from === 'any') {
      // if skills prop is passed (VaultDweller style), use it, else ALL_SKILL_KEYS
      if (Array.isArray(skills) && skills.length) {
        return skills.map(s => s.name || s);
      }
      return ALL_SKILL_KEYS;
    }
    return Array.isArray(from) ? from : [];
  }, [skillPickChoice, skills]);

  const pickCount = skillPickChoice?.count || 0;

  const reset = () => {
    setStep('info');
    setPicks([]);
  };

  const handleClose = () => {
    reset();
    onClose?.();
  };

  const handleInfoConfirm = () => {
    if (skillPickChoice && pickCount > 0) {
      setStep('pick');
      return;
    }
    doFinalSelect([]);
  };

  const togglePick = (skillKey) => {
    setPicks(prev => {
      if (prev.includes(skillKey)) {
        return prev.filter(s => s !== skillKey);
      }
      if (prev.length >= pickCount) return prev;
      return [...prev, skillKey];
    });
  };

  const doFinalSelect = (finalPicks) => {
    const baseMods = canonicalTrait?.modifiers || {};
    let finalModifiers = { ...baseMods };

    if (finalPicks.length > 0) {
      finalModifiers = {
        ...finalModifiers,
        skillPickSelected: finalPicks,
        forcedSkills: [...new Set([...(baseMods.forcedSkills || []), ...finalPicks])],
        extraSkills: (baseMods.extraSkills || 0) + finalPicks.length,
      };
    }

    onSelect(traitId, name, finalModifiers);
    reset();
    onClose?.();
  };

  const handlePickConfirm = () => {
    if (picks.length !== pickCount) return;
    doFinalSelect(picks);
  };

  const titleKeys = {
    assaultron: 'assaultron',
    childOfAtom: 'childOfAtom',
    ghoul: 'ghoul',
    misterHandy: 'misterHandy',
    protectron: 'protectron',
    robobrain: 'robobrain',
    superMutant: 'supermutant',
    synth: 'synth',
    shadow: 'shadow',
    brotherhood: 'brotherhoodOfSteel',
    brotherhoodOutcast: 'brotherhoodOutcast',
    minuteman: 'minuteman',
    vaultDweller: 'vaultDweller',
  };

  const titleKey = titleKeys[actualOriginId] || actualOriginId;
  const modalTitle = tCharacterScreen(`origins.${titleKey}`, name || 'Trait');

  return (
    <Modal animationType="fade" transparent={true} visible={visible} onRequestClose={handleClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          {step === 'info' ? (
            <>
              <Text style={styles.modalTitle}>{modalTitle}</Text>
              <Text style={styles.traitName}>{name}</Text>
              {renderTextWithIcons(description, styles.modalText)}
              {skillPickChoice && (
                <Text style={styles.hintText}>
                  {tCharacterScreen('modals.skillPick.description', 'Choose skills from the provided group. They will be marked as extra.')}
                  {'\n'}
                  {tCharacterScreen('labels.needToPick', 'Need to pick')}: {pickCount}
                </Text>
              )}
              <TouchableOpacity style={[styles.modalButton, styles.confirmButton]} onPress={handleInfoConfirm}>
                <Text style={styles.buttonText}>
                  {skillPickChoice ? tCharacterScreen('buttons.continue', 'Continue') : tCharacterScreen('buttons.ok', 'OK')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={handleClose}>
                <Text style={styles.buttonText}>{tCharacterScreen('buttons.cancel', 'Cancel')}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.modalTitle}>{tCharacterScreen('modals.skillPick.title', 'Choose skills')}</Text>
              <Text style={styles.traitName}>{name}</Text>
              <Text style={styles.hintText}>
                {pickCount > 1
                  ? tCharacterScreen('modals.skillPick.chooseN', 'Choose {count} skills').replace('{count}', String(pickCount))
                  : tCharacterScreen('modals.skillPick.choose1', 'Choose 1 skill')}
              </Text>
              <ScrollView style={{ width: '100%', maxHeight: 300 }}>
                {skillOptions.map((skillKey) => {
                  const isPicked = picks.includes(skillKey);
                  const disabled = !isPicked && picks.length >= pickCount;
                  return (
                    <TouchableOpacity
                      key={skillKey}
                      style={[
                        styles.modalButton,
                        styles.skillOption,
                        isPicked && styles.skillOptionSelected,
                        disabled && styles.disabledOption,
                      ]}
                      onPress={() => togglePick(skillKey)}
                      disabled={disabled && !isPicked}
                    >
                      <Text style={styles.buttonText}>{getSkillDisplayName(skillKey)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <Text style={styles.counterText}>
                {picks.length} / {pickCount}
              </Text>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  styles.confirmButton,
                  picks.length !== pickCount && styles.disabledButton,
                ]}
                onPress={handlePickConfirm}
                disabled={picks.length !== pickCount}
              >
                <Text style={styles.buttonText}>{tCharacterScreen('buttons.confirm', 'Confirm')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.backButton]}
                onPress={() => setStep('info')}
              >
                <Text style={styles.buttonText}>{tCharacterScreen('buttons.back', 'Back')}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContainer: { width: '85%', maxWidth: 420, backgroundColor: 'white', borderRadius: 10, padding: 20, alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10, color: '#333', textAlign: 'center' },
  traitName: { fontSize: 16, fontWeight: 'bold', marginBottom: 10, color: '#2196F3', textAlign: 'center' },
  modalText: { fontSize: 14, marginBottom: 16, textAlign: 'center', lineHeight: 20, color: '#555' },
  hintText: { fontSize: 13, color: '#666', textAlign: 'center', marginBottom: 12 },
  counterText: { fontSize: 14, color: '#333', marginVertical: 8, fontWeight: '600' },
  modalButton: { padding: 12, marginVertical: 5, borderRadius: 6, alignItems: 'center', width: '100%' },
  skillOption: { backgroundColor: '#2196F3' },
  skillOptionSelected: { backgroundColor: '#1976D2', borderWidth: 2, borderColor: '#fff' },
  disabledOption: { opacity: 0.5 },
  confirmButton: { backgroundColor: '#4CAF50', marginTop: 6 },
  cancelButton: { backgroundColor: '#9E9E9E', marginTop: 4 },
  backButton: { backgroundColor: '#757575', marginTop: 4 },
  disabledButton: { opacity: 0.5 },
  buttonText: { color: 'white', fontWeight: 'bold', fontSize: 15 },
});

export default GenericTraitModal;
