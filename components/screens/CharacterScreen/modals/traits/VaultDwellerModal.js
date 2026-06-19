import React, { useState } from 'react';
import { renderTextWithIcons } from '../../../WeaponsAndArmorScreen/textUtils';
import { View, Text, TouchableOpacity, Modal, StyleSheet, ScrollView } from 'react-native';
import { findTraitById, getTraitI18n } from '../../../../../domain/traits';
import { getSkillDisplayName } from '../../logic/characterScreenI18n';

export const traitConfig = { originId: 'vaultDweller', modalType: 'choice' };

const VaultDwellerModal = ({ visible, onSelect, onClose, skills }) => {
  const traitId = 'vaultdweller-vault-kid';
  const { name, description } = getTraitI18n(traitId);

  const handleSelectSkill = (skill) => {
    const canonicalTrait = findTraitById(traitId);
    onSelect(traitId, name, {
      ...(canonicalTrait?.modifiers || {}),
      selectedExtraSkills: [skill],
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
          <Text style={styles.modalTitle}>Обитатель убежища</Text>
          <Text style={styles.traitName}>{name}</Text>
          {renderTextWithIcons(description, styles.modalText)}
          
          <ScrollView style={{ width: '100%', maxHeight: 200 }}>
            {skills.map(skill => (
                <TouchableOpacity
                key={skill.name}
                style={[styles.modalButton, styles.skillOption]}
                onPress={() => handleSelectSkill(skill.name)}
                >
                <Text style={styles.buttonText}>{getSkillDisplayName(skill.name)}</Text>
                </TouchableOpacity>
            ))}
          </ScrollView>

          <TouchableOpacity
            style={[styles.modalButton, styles.cancelButton]}
            onPress={onClose}
          >
            <Text style={styles.buttonText}>Отмена</Text>
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
    cancelButton: {
        backgroundColor: '#9E9E9E',
        marginTop: 10
    },
    buttonText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 16
    },
});

export default VaultDwellerModal; 
