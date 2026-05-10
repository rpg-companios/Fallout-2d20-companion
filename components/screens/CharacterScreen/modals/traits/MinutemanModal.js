import React, { useState } from 'react';
import { renderTextWithIcons } from '../../../WeaponsAndArmorScreen/textUtils';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { getTraitI18n } from '../../../../../domain/traits';

export const traitConfig = { originId: 'minuteman', traitName: 'Народное ополчение', modalType: 'choice' };

const SELECTABLE_SKILLS = ['Стрелковое оружие', 'Выживание', 'Красноречие'];

const MinutemanModal = ({ visible, onSelect, onClose }) => {
  const [selectedSkill, setSelectedSkill] = useState(null);
  const { name: traitName, description } = getTraitI18n('minuteman-peoples-militia');

  const handleConfirm = () => {
    if (!selectedSkill) return;
    onSelect(traitName, {
      forcedSkills: [selectedSkill],
      extraSkills: 1,
    });
    onClose();
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
          <Text style={styles.modalTitle}>Минитмен</Text>
          <Text style={styles.traitName}>{traitName}</Text>
          {renderTextWithIcons(description, styles.modalText)}

          {SELECTABLE_SKILLS.map(skill => (
            <TouchableOpacity
              key={skill}
              style={[
                styles.modalButton,
                styles.skillOption,
                selectedSkill === skill && styles.selectedSkillOption
              ]}
              onPress={() => setSelectedSkill(skill)}
            >
              <Text style={styles.buttonText}>{skill}</Text>
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            style={[styles.modalButton, styles.confirmButton, !selectedSkill && styles.disabledButton]}
            onPress={handleConfirm}
            disabled={!selectedSkill}
          >
            <Text style={styles.buttonText}>Выбрать</Text>
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
    selectedSkillOption: {
      backgroundColor: '#1976D2',
      borderColor: '#fff',
      borderWidth: 2,
    },
    confirmButton: {
      backgroundColor: '#4CAF50',
    },
    disabledButton: {
      opacity: 0.5,
    },
    buttonText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 16
    }
});

export default MinutemanModal; 