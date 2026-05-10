import React from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import { tCharacterScreen } from '../logic/characterScreenI18n';
import styles from '../../../../styles/TraitSkillModal.styles';

const TraitSkillModal = ({ 
  visible, 
  trait, 
  onSelect, 
  onCancel 
}) => {
  // Показываем модальное окно только если черта существует И принадлежит Братству Стали
  if (!trait || trait.origin !== tCharacterScreen('origins.brotherhoodOfSteel', 'Brotherhood of Steel')) return null;

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onCancel}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <Text style={styles.modalTitle}>{tCharacterScreen('modals.traitSkill.title', 'Select extra skill')}</Text>
          
          {trait.description && (
            <Text style={styles.modalText}>{trait.description}</Text>
          )}

          {trait.forcedSkills?.map(skill => (
            <TouchableOpacity
              key={skill}
              style={[styles.modalButton, styles.skillOption]}
              onPress={() => onSelect(skill)}
            >
              <Text style={styles.buttonText}>{skill}</Text>
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            style={[styles.modalButton, styles.cancelButton]}
            onPress={onCancel}
          >
            <Text style={styles.buttonText}>{tCharacterScreen('buttons.cancel', 'Cancel')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

export default TraitSkillModal;
