import React, { useMemo, useState } from 'react';
import { renderTextWithIcons } from '../../../WeaponsAndArmorScreen/textUtils';
import { View, Text, TouchableOpacity, Modal, StyleSheet, ScrollView } from 'react-native';
import { getTraitI18nById, findTraitById } from '../../../../../../domain/traits';
import { tCharacterScreen } from '../../logic/characterScreenI18n';

export const traitConfig = { originId: 'TreeFamilies', modalType: 'choice' };

const FAMILY_TRAIT_IDS = [
  'treefamilies-chairmen',
  'treefamilies-omerta',
  'treefamilies-white-glove',
];

const TreeFamiliesModal = ({ visible, onSelect, onClose }) => {
  const [selectedFamily, setSelectedFamily] = useState(null);

  const familyCatalog = useMemo(
    () => FAMILY_TRAIT_IDS.map((id) => ({ id, ...getTraitI18nById(id) })),
    [],
  );

  const resetState = () => setSelectedFamily(null);

  const handleConfirm = () => {
    if (!selectedFamily) return;
    const dataEntry = findTraitById(selectedFamily);
    const name = getTraitI18nById(selectedFamily).name;
    onSelect(
      [selectedFamily],
      `${tCharacterScreen('origins.TreeFamilies')}: ${name}`,
      {
        ...(dataEntry?.modifiers || {}),
        selectedTraitNames: [name],
        selectedTraitIds: [selectedFamily],
        selectionMode: 'single',
      },
    );
    resetState();
    onClose();
  };

  return (
    <Modal animationType="fade" transparent={true} visible={visible} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <Text style={styles.modalTitle}>{tCharacterScreen('modals.origins.treeFamiliesTitle')}</Text>
          <Text style={styles.hintText}>{tCharacterScreen('modals.treeFamilies.selectFamilyHint')}</Text>

          <ScrollView style={{ width: '100%', maxHeight: 360 }}>
            {familyCatalog.map((trait) => {
              const isSelected = selectedFamily === trait.id;
              return (
                <TouchableOpacity
                  key={trait.id}
                  style={[styles.modalButton, styles.skillOption, isSelected && styles.selectedButton]}
                  onPress={() => setSelectedFamily(trait.id)}
                >
                  <Text style={styles.buttonText}>{trait.name}</Text>
                  {renderTextWithIcons(trait.description, styles.descriptionText)}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <TouchableOpacity
            style={[styles.modalButton, styles.confirmButton, !selectedFamily && styles.disabledButton]}
            disabled={!selectedFamily}
            onPress={handleConfirm}
          >
            <Text style={styles.buttonText}>{tCharacterScreen('buttons.confirmSelection')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modalButton, styles.cancelButton]}
            onPress={() => { resetState(); onClose(); }}
          >
            <Text style={styles.buttonText}>{tCharacterScreen('buttons.cancel')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.5)' },
  modalContainer: { width: '85%', maxWidth: 460, backgroundColor: 'white', borderRadius: 10, padding: 20, alignItems: 'center', maxHeight: '85%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10, textAlign: 'center' },
  hintText: { color: '#333', fontSize: 12, marginBottom: 8, textAlign: 'center' },
  modalButton: { padding: 12, marginVertical: 5, borderRadius: 6, alignItems: 'center', width: '100%' },
  skillOption: { backgroundColor: '#2196F3', alignItems: 'flex-start', paddingHorizontal: 15 },
  confirmButton: { backgroundColor: '#4CAF50' },
  cancelButton: { backgroundColor: '#9E9E9E', marginTop: 10 },
  disabledButton: { opacity: 0.5 },
  selectedButton: { borderWidth: 2, borderColor: '#FFFFFF', backgroundColor: '#1976D2' },
  buttonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  descriptionText: { color: 'white', fontSize: 12, marginTop: 5 },
});

export default TreeFamiliesModal;
