import React from 'react';
import { renderTextWithIcons } from '../../../WeaponsAndArmorScreen/textUtils';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { getTraitI18n } from '../../../../../domain/traits';

export const traitConfig = { originId: 'superMutant', modalType: 'info' };

const SupermutantModal = ({ visible, onSelect, onClose, infoOnly = false }) => {
  const { name, description } = getTraitI18n('supermutant-forced-evolution');

  const handleConfirm = () => {
    if (infoOnly) {
      onClose();
      return;
    }

    onSelect(name, {
      attributes: { 'STR': 2, 'END': 2 },
      minLimits: { 'STR': 6, 'END': 6 },
      maxLimits: { 'STR': 12, 'END': 12, 'CHA': 6, 'INT': 6 },
      skillMaxValue: 4,
      effects: ['Иммунитет к радиации', 'Иммунитет к яду', 'Нестареющий', 'Бесплодие', 'Ограниченная броня']
    });
  };

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <Text style={styles.modalTitle}>Супермутант</Text>
          <Text style={styles.traitName}>{name}</Text>
          
          {renderTextWithIcons(description, styles.modalText)}
          
          <TouchableOpacity
            style={[styles.modalButton, styles.confirmButton]}
            onPress={handleConfirm}
          >
            <Text style={styles.buttonText}>{infoOnly ? 'Понятно' : 'Выбрать черту'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContainer: {
    width: '80%',
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333'
  },
  traitName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#2196F3'
  },
  section: {
    width: '100%',
    marginBottom: 15,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0'
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 5,
    color: '#333'
  },
  modalText: {
    fontSize: 14,
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 20,
    color: '#555'
  },
  modalButton: {
    padding: 12,
    marginVertical: 5,
    borderRadius: 6,
    alignItems: 'center',
    width: '100%',
  },
  skillOption: {
    backgroundColor: '#2196F3',
  },
  confirmButton: {
    backgroundColor: '#4CAF50',
    marginTop: 10
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16
  },
});

export default SupermutantModal; 