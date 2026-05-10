import React from 'react';
import { renderTextWithIcons } from '../../../WeaponsAndArmorScreen/textUtils';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { getTraitI18n } from '../../../../../domain/traits';

export const traitConfig = { originId: 'protectron', modalType: 'info' };

const ProtectronModal = ({ visible, onSelect, onClose }) => {
  const { name, description } = getTraitI18n('protectron-protect-or-destroy');

  const handleConfirm = () => {
    onSelect(name, {
      effects: ['Переброс проверки на экологическую опасность', 'Иммунитет к болезням, радиации и ядам', 'Нельзя использовать препараты, еду, питье, отдых', 'Ремонт для восстановления здоровья'],
      carryWeightStrengthMultiplier: 0,
      carryWeight: 0,
      isRobot: true,
      robotType: 'protectron',
      robotBodyPlan: 'protectron',
      robotRules: {
        canSelfUseConsumables: false,
        canUseConsumablesOnOthers: true,
        canEquipStandardArmor: false,
        canEquipPowerArmor: false,
        carryWeightLimit: 150,
        armorConstraints: []
      }
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
          <Text style={styles.modalTitle}>Протектрон</Text>
          <Text style={styles.traitName}>{name}</Text>
          {renderTextWithIcons(description, styles.modalText)}
          <TouchableOpacity
            style={[styles.modalButton, styles.confirmButton]}
            onPress={handleConfirm}
          >
            <Text style={styles.buttonText}>Хорошо</Text>
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

export default ProtectronModal; 