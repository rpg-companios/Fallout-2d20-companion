import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { formatInventoryText, tInventory } from '../logic/inventoryI18n';
import { useLocale } from '../../../../i18n/locale';

const BuyItemModal = ({ visible, onClose, item, caps, onConfirmBuy }) => {
  useLocale();
  const [quantity, setQuantity] = useState('1');
  const [pricePerItem, setPricePerItem] = useState('0');

  useEffect(() => {
    if (!item) return;
    setQuantity('1');
    setPricePerItem(String(item.cost ?? item.price ?? 0));
  }, [item]);

  const changeQuantity = (delta) => {
    const next = (parseInt(quantity, 10) || 0) + delta;
    if (next > 0) setQuantity(String(next));
  };

  const handleConfirm = () => {
    const qty = parseInt(quantity, 10);
    const unitPrice = parseFloat(pricePerItem);
    if (isNaN(qty) || qty <= 0) {
      Alert.alert(tInventory('modals.buyItemModal.invalidQuantity'));
      return;
    }
    if (isNaN(unitPrice) || unitPrice < 0) {
      Alert.alert(tInventory('modals.buyItemModal.invalidPrice'));
      return;
    }

    const total = qty * unitPrice;
    if (caps <= 0) {
      Alert.alert(tInventory('modals.buyItemModal.noCapsTitle'), tInventory('modals.buyItemModal.noCapsMessage'));
      return;
    }
    if (total > caps) {
      Alert.alert(
        tInventory('modals.buyItemModal.notEnoughCapsTitle'),
        formatInventoryText(tInventory('modals.buyItemModal.notEnoughCapsMessage'), { total, caps })
      );
      return;
    }

    onConfirmBuy(qty, unitPrice);
  };

  if (!item) return null;

  const qty = parseInt(quantity, 10) || 0;
  const unitPrice = parseFloat(pricePerItem) || 0;
  const totalPrice = (qty * unitPrice).toFixed(2);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.title}>{formatInventoryText(tInventory('modals.buyItemModal.title'), { itemName: item.name })}</Text>
          <Text style={styles.balance}>{formatInventoryText(tInventory('modals.buyItemModal.balance'), { caps })}</Text>

          <View style={styles.controlContainer}>
            <Text style={styles.label}>{tInventory('modals.buyItemModal.quantityLabel')}</Text>
            <View style={styles.control}>
              <TouchableOpacity style={styles.button} onPress={() => changeQuantity(-1)}><Text style={styles.buttonText}>-</Text></TouchableOpacity>
              <TextInput style={styles.valueInput} value={quantity} onChangeText={setQuantity} keyboardType="number-pad" />
              <TouchableOpacity style={styles.button} onPress={() => changeQuantity(1)}><Text style={styles.buttonText}>+</Text></TouchableOpacity>
            </View>
          </View>

          <View style={styles.controlContainer}>
            <Text style={styles.label}>{tInventory('modals.buyItemModal.pricePerItem')}</Text>
            <TextInput style={styles.valueInput} value={pricePerItem} onChangeText={setPricePerItem} keyboardType="numeric" />
          </View>

          <Text style={styles.totalPrice}>{formatInventoryText(tInventory('modals.buyItemModal.totalPrice'), { totalPrice })}</Text>

          <View style={styles.actionButtons}>
            <TouchableOpacity style={[styles.actionButton, styles.confirmButton]} onPress={handleConfirm}>
              <Text style={styles.actionButtonText}>{tInventory('modals.buyItemModal.buy')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionButton, styles.cancelButton]} onPress={onClose}>
              <Text style={styles.actionButtonText}>{tInventory('modals.buyItemModal.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.6)', paddingHorizontal: 16 },
  modalContent: { width: '80%', height: '78%', backgroundColor: '#fff', borderRadius: 10, paddingVertical: 20, paddingHorizontal: 24, alignItems: 'center' },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 8, textAlign: 'center', paddingHorizontal: 8 },
  balance: { fontSize: 14, color: '#444', marginBottom: 16 },
  controlContainer: { width: '100%', marginBottom: 15, alignItems: 'center' },
  label: { fontSize: 16, color: '#666', marginBottom: 8 },
  control: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  button: { backgroundColor: '#555', width: 45, height: 45, justifyContent: 'center', alignItems: 'center', borderRadius: 22.5 },
  buttonText: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  valueInput: { borderBottomWidth: 2, borderColor: '#333', width: 140, textAlign: 'center', fontSize: 24, fontWeight: 'bold', marginHorizontal: 20, color: '#333' },
  totalPrice: { fontSize: 20, fontWeight: 'bold', color: '#4CAF50', marginTop: 10, marginBottom: 25 },
  actionButtons: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  actionButton: { flex: 1, padding: 15, borderRadius: 8, alignItems: 'center', marginHorizontal: 10 },
  confirmButton: { backgroundColor: '#4CAF50' },
  cancelButton: { backgroundColor: '#f44336' },
  actionButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});

export default BuyItemModal;
