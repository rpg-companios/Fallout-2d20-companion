import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, ScrollView } from 'react-native';
import { findTraitById, getTraitI18nById } from '../../../../../../domain/traits';
import { renderTextWithIcons } from '../../../WeaponsAndArmorScreen/textUtils';
import { tCharacterScreen, getSkillDisplayName } from '../../logic/characterScreenI18n';
import { ALL_SKILL_KEYS } from '../../../../../../domain/characterCreation';

export const GenericTraitModal = ({ visible, onSelect, onClose, origin, originIdForConfig, skills }) => {
  const actualOriginId = origin?.id || originIdForConfig;
  const fallbackTraitId = `${actualOriginId}-trait`;
  const traitId = origin?.traitIds?.[0] || fallbackTraitId;

  const parentTrait = useMemo(() => findTraitById(traitId), [traitId]);

  // Ориджин может предлагать выбор одной черты из нескольких: родительская
  // запись помечена isMultiTrait и сама модификаторов не несёт, работает
  // только как список вариантов (по образцу Выжившего и Племени).
  const subTraitIds = parentTrait?.modifiers?.isMultiTrait
    ? (parentTrait.modifiers.subTraitIds || [])
    : [];
  const isMulti = subTraitIds.length > 0;

  // Какая именно черта выбрана: для обычного ориджина — единственная,
  // для мультитрейта — та, что игрок отметил на шаге выбора.
  const [chosenId, setChosenId] = useState(null);
  const effectiveTraitId = isMulti ? chosenId : traitId;

  const canonicalTrait = useMemo(
    () => (effectiveTraitId ? findTraitById(effectiveTraitId) : null),
    [effectiveTraitId],
  );
  const { name, description } = getTraitI18nById(effectiveTraitId || traitId);

  const variants = useMemo(
    () => subTraitIds.map((id) => ({ id, ...getTraitI18nById(id) })),
    [subTraitIds.join('|')],
  );

  // Заголовок экрана выбора: по образцу остальных мультитрейт-модалок ключ
  // складывается из id ориджина. Промах ключа словарь возвращает самим путём —
  // в этом случае показываем имя ориджина, чтобы в шапке не было техстроки.
  const multiTitleKey = `modals.origins.${actualOriginId}Title`;
  const multiTitleValue = tCharacterScreen(multiTitleKey);
  const multiTitle = multiTitleValue === multiTitleKey
    ? tCharacterScreen(`origins.${actualOriginId}`)
    : multiTitleValue;

  const skillPickChoice = canonicalTrait?.modifiers?.skillPickChoice || null;

  // 'choose' — экран выбора черты, есть только у мультитрейт-ориджинов.
  const [step, setStep] = useState(isMulti ? 'choose' : 'info');
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
    setStep(isMulti ? 'choose' : 'info');
    setChosenId(null);
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

    // Для мультитрейта наружу уходит id выбранной черты, а не родителя:
    // именно её модификаторы и подпись должны попасть в персонажа.
    if (isMulti) {
      finalModifiers = {
        ...finalModifiers,
        selectedTraitIds: [effectiveTraitId],
        selectedTraitNames: [name],
        selectionMode: 'single',
      };
    }

    if (finalPicks.length > 0) {
      finalModifiers = {
        ...finalModifiers,
        skillPickSelected: finalPicks,
        forcedSkills: [...new Set([...(baseMods.forcedSkills || []), ...finalPicks])],
        extraSkills: (baseMods.extraSkills || 0) + finalPicks.length,
      };
    }

    onSelect(effectiveTraitId, name, finalModifiers);
    reset();
    onClose?.();
  };

  const handlePickConfirm = () => {
    if (picks.length !== pickCount) return;
    doFinalSelect(picks);
  };

  return (
    <Modal animationType="fade" transparent={true} visible={visible} onRequestClose={handleClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          {step === 'choose' ? (
            <>
              <Text style={styles.modalTitle}>{multiTitle}</Text>
              <Text style={styles.hintText}>{tCharacterScreen('modals.traitPick.hint')}</Text>
              <ScrollView style={{ width: '100%', maxHeight: 360 }}>
                {variants.map((variant) => {
                  const isSelected = chosenId === variant.id;
                  return (
                    <TouchableOpacity
                      key={variant.id}
                      style={[styles.modalButton, styles.variantOption, isSelected && styles.skillOptionSelected]}
                      onPress={() => setChosenId(variant.id)}
                    >
                      <Text style={styles.buttonText}>{variant.name}</Text>
                      {renderTextWithIcons(variant.description, styles.variantDescription)}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton, !chosenId && styles.disabledButton]}
                disabled={!chosenId}
                onPress={() => setStep('info')}
              >
                <Text style={styles.buttonText}>{tCharacterScreen('buttons.continue')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={handleClose}>
                <Text style={styles.buttonText}>{tCharacterScreen('buttons.cancel')}</Text>
              </TouchableOpacity>
            </>
          ) : step === 'info' ? (
            <>
              <Text style={styles.modalTitle}>{name}</Text>
              {renderTextWithIcons(description, styles.modalText)}
              {skillPickChoice && (
                <Text style={styles.hintText}>
                  {tCharacterScreen('modals.skillPick.description')}
                  {'\n'}
                  {tCharacterScreen('labels.needToPick')}: {pickCount}
                </Text>
              )}
              <TouchableOpacity style={[styles.modalButton, styles.confirmButton]} onPress={handleInfoConfirm}>
                <Text style={styles.buttonText}>
                  {skillPickChoice ? tCharacterScreen('buttons.continue') : tCharacterScreen('buttons.ok')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, isMulti ? styles.backButton : styles.cancelButton]}
                onPress={isMulti ? () => setStep('choose') : handleClose}
              >
                <Text style={styles.buttonText}>
                  {isMulti ? tCharacterScreen('buttons.back') : tCharacterScreen('buttons.cancel')}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.modalTitle}>{tCharacterScreen('modals.skillPick.title')}</Text>
              <Text style={styles.traitName}>{name}</Text>
              <Text style={styles.hintText}>
                {pickCount > 1
                  ? tCharacterScreen('modals.skillPick.chooseN').replace('{count}', String(pickCount))
                  : tCharacterScreen('modals.skillPick.choose1')}
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
                <Text style={styles.buttonText}>{tCharacterScreen('buttons.confirm')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.backButton]}
                onPress={() => setStep('info')}
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
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContainer: { width: '85%', maxWidth: 420, backgroundColor: 'white', borderRadius: 10, padding: 20, alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10, color: '#333', textAlign: 'center' },
  traitName: { fontSize: 16, fontWeight: 'bold', marginBottom: 10, color: '#2196F3', textAlign: 'center' },
  modalText: { fontSize: 14, marginBottom: 16, textAlign: 'center', lineHeight: 20, color: '#555' },
  hintText: { fontSize: 13, color: '#666', textAlign: 'center', marginBottom: 12 },
  counterText: { fontSize: 14, color: '#333', marginVertical: 8, fontWeight: '600' },
  modalButton: { padding: 12, marginVertical: 5, borderRadius: 6, alignItems: 'center', width: '100%' },
  skillOption: { backgroundColor: '#2196F3' },
  variantOption: { backgroundColor: '#2196F3', alignItems: 'flex-start', paddingHorizontal: 15 },
  variantDescription: { color: 'white', fontSize: 12, marginTop: 5 },
  skillOptionSelected: { backgroundColor: '#1976D2', borderWidth: 2, borderColor: '#fff' },
  disabledOption: { opacity: 0.5 },
  confirmButton: { backgroundColor: '#4CAF50', marginTop: 6 },
  cancelButton: { backgroundColor: '#9E9E9E', marginTop: 4 },
  backButton: { backgroundColor: '#757575', marginTop: 4 },
  disabledButton: { opacity: 0.5 },
  buttonText: { color: 'white', fontWeight: 'bold', fontSize: 15 },
});

export default GenericTraitModal;
