import React, { useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { tInventory } from '../logic/inventoryI18n';
import { useLocale } from '../../../../i18n/locale';

const CapsModal = ({ visible, onClose, onSave, operationType }) => {
  useLocale();
  const [amount, setAmount] = useState('');

  const handleSave = () => {
    const numericAmount = parseInt(amount, 10);
    if (!isNaN(numericAmount) && numericAmount > 0) {
      onSave(numericAmount);
      setAmount('');
      onClose();
    } else {
      Alert.alert(tInventory('modals.capsModal.invalidAmount'));
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.title}>
            {operationType === 'add'
              ? tInventory('modals.capsModal.titleAdd')
              : tInventory('modals.capsModal.titleSubtract')}
          </Text>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            placeholder={tInventory('modals.capsModal.inputPlaceholder')}
            value={amount}
            onChangeText={setAmount}
            autoFocus
          />
          <View style={styles.buttonContainer}>
            <TouchableOpacity style={[styles.button, styles.saveButton]} onPress={handleSave}>
              <Text style={styles.buttonText}>{tInventory('modals.capsModal.save')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={onClose}>
              <Text style={styles.buttonText}>{tInventory('modals.capsModal.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.6)', paddingHorizontal: 16 },
  modalContent: { width: '100%', maxWidth: 520, backgroundColor: '#fff', borderRadius: 10, padding: 20, alignItems: 'center' },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 20 },
  input: { width: '100%', borderBottomWidth: 1, borderBottomColor: '#ccc', fontSize: 18, textAlign: 'center', marginBottom: 20, paddingVertical: 10 },
  buttonContainer: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  button: { flex: 1, padding: 15, borderRadius: 8, alignItems: 'center', marginHorizontal: 5 },
  saveButton: { backgroundColor: '#4CAF50' },
  cancelButton: { backgroundColor: '#f44336' },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});

export default CapsModal;
