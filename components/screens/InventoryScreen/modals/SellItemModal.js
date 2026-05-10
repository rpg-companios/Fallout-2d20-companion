import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { formatInventoryText, tInventory } from '../logic/inventoryI18n';
import { useLocale } from '../../../../i18n/locale';

const SellItemModal = ({ visible, onClose, item, onConfirmSale }) => {
  useLocale();
  const [quantity, setQuantity] = useState('1');
  const [pricePerItem, setPricePerItem] = useState('0');

  useEffect(() => {
    if (item) {
      setQuantity('1');
      const initialPrice = item.price ?? 0;
      setPricePerItem(String(initialPrice));
    }
  }, [item]);

  const handleConfirm = () => {
    const numQuantity = parseInt(quantity, 10);
    const numPrice = parseFloat(pricePerItem);

    if (isNaN(numQuantity) || numQuantity <= 0 || numQuantity > item.quantity) {
      Alert.alert(formatInventoryText(tInventory('modals.sellItemModal.invalidQuantity'), { max: item.quantity }));
      return;
    }
    if (isNaN(numPrice) || numPrice < 0) {
      Alert.alert(tInventory('modals.sellItemModal.invalidPrice'));
      return;
    }

    onConfirmSale(numQuantity, numQuantity * numPrice);
  };

  const changeQuantity = (amount) => {
    const currentQuantity = parseInt(quantity, 10) || 0;
    const newQuantity = currentQuantity + amount;
    if (newQuantity > 0 && newQuantity <= item.quantity) {
      setQuantity(String(newQuantity));
    }
  };

  if (!item) return null;

  const numQuantity = parseInt(quantity, 10) || 0;
  const numPrice = parseFloat(pricePerItem) || 0;
  const totalPrice = (numQuantity * numPrice).toFixed(2);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.title}>{formatInventoryText(tInventory('modals.sellItemModal.title'), { itemName: item.name })}</Text>

          <View style={styles.controlContainer}>
            <Text style={styles.label}>{formatInventoryText(tInventory('modals.sellItemModal.quantityLabel'), { max: item.quantity })}</Text>
            <View style={styles.control}>
              <TouchableOpacity style={styles.button} onPress={() => changeQuantity(-1)}><Text style={styles.buttonText}>-</Text></TouchableOpacity>
              <TextInput style={styles.valueInput} value={quantity} onChangeText={setQuantity} keyboardType="number-pad" />
              <TouchableOpacity style={styles.button} onPress={() => changeQuantity(1)}><Text style={styles.buttonText}>+</Text></TouchableOpacity>
            </View>
          </View>

          <View style={styles.controlContainer}>
            <Text style={styles.label}>{tInventory('modals.sellItemModal.pricePerItem')}</Text>
            <View style={styles.control}>
              <TextInput style={styles.valueInput} value={pricePerItem} onChangeText={setPricePerItem} keyboardType="numeric" />
            </View>
          </View>

          <Text style={styles.totalPrice}>{formatInventoryText(tInventory('modals.sellItemModal.totalPrice'), { totalPrice })}</Text>

          <View style={styles.actionButtons}>
            <TouchableOpacity style={[styles.actionButton, styles.confirmButton]} onPress={handleConfirm}>
              <Text style={styles.actionButtonText}>{tInventory('modals.sellItemModal.sell')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionButton, styles.cancelButton]} onPress={onClose}>
              <Text style={styles.actionButtonText}>{tInventory('modals.sellItemModal.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.6)', paddingHorizontal: 16 },
  modalContent: { width: '100%', maxWidth: 560, backgroundColor: '#fff', borderRadius: 10, padding: 20, alignItems: 'center' },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 20 },
  controlContainer: { width: '100%', marginBottom: 15, alignItems: 'center' },
  label: { fontSize: 16, color: '#666', marginBottom: 8 },
  control: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  button: { backgroundColor: '#555', width: 45, height: 45, justifyContent: 'center', alignItems: 'center', borderRadius: 22.5 },
  buttonText: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  valueInput: { borderBottomWidth: 2, borderColor: '#333', width: 120, textAlign: 'center', fontSize: 26, fontWeight: 'bold', marginHorizontal: 20, color: '#333' },
  totalPrice: { fontSize: 20, fontWeight: 'bold', color: '#4CAF50', marginTop: 10, marginBottom: 25 },
  actionButtons: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  actionButton: { flex: 1, padding: 15, borderRadius: 8, alignItems: 'center', marginHorizontal: 10 },
  confirmButton: { backgroundColor: '#4CAF50' },
  cancelButton: { backgroundColor: '#f44336' },
  actionButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});

export default SellItemModal;
