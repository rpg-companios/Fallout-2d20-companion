import React from 'react';
import { renderTextWithIcons } from '../../../WeaponsAndArmorScreen/textUtils';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { findTraitById, getTraitI18n } from '../../../../../domain/traits';
import { tCharacterScreen } from '../../logic/characterScreenI18n';


export const traitConfig = { originId: 'robobrain', modalType: 'info' };

const RoboBrainModal = ({ visible, onSelect, onClose }) => {
  const traitId = 'robobrain-robot-with-brains';
  const { name, description } = getTraitI18n(traitId);

  const handleConfirm = () => {
    const canonicalTrait = findTraitById(traitId);
    onSelect('robobrain-robot-with-brains', name, canonicalTrait?.modifiers || {});
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
          <Text style={styles.modalTitle}>{tCharacterScreen('origins.robobrain')}</Text>
          <Text style={styles.traitName}>{name}</Text>
          {renderTextWithIcons(description, styles.modalText)}
          <TouchableOpacity
            style={[styles.modalButton, styles.confirmButton]}
            onPress={handleConfirm}
          >
            <Text style={styles.buttonText}>{tCharacterScreen('buttons.ok')}</Text>
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

export default RoboBrainModal;