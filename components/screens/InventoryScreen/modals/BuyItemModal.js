import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { showRawAlert } from '../../../alerts/alertService';
import { formatInventoryText, tInventory } from '../logic/inventoryI18n';
import { useLocale } from '../../../../i18n/locale';
// 406: КОЛЛЕКЦИОНЕР КРЫШЕК — покупки на 10% дешевле (предзаполнение цены).
import useCharacterStore from '../../../../src/store/characterStore';

const BuyItemModal = ({ visible, onClose, item, caps, onConfirmBuy }) => {
  useLocale();
  const [quantity, setQuantity] = useState('1');
  const [pricePerItem, setPricePerItem] = useState('0');

  useEffect(() => {
    if (!item) return;
    setQuantity('1');
    const baseCost = Number(item.cost ?? item.price ?? 0);
    // 406: с «Коллекционером крышек» цена при открытии уже со скидкой 10%
    // (торговая формулировка книги «можете уменьшить цену на 10%»).
    const discount = Number(useCharacterStore.getState().perkBonuses?.capCollectorDiscountPercent) || 0;
    const price = discount > 0 ? Math.round(baseCost * (1 - Math.min(100, discount) / 100)) : baseCost;
    setPricePerItem(String(price));
  }, [item]);

  const changeQuantity = (delta) => {
    const next = (parseInt(quantity, 10) || 0) + delta;
    if (next > 0) setQuantity(String(next));
  };

  const handleConfirm = () => {
    const qty = parseInt(quantity, 10);
    const unitPrice = parseFloat(pricePerItem);
    if (isNaN(qty) || qty <= 0) {
      showRawAlert({ title: tInventory('modals.buyItemModal.invalidQuantity') });
      return;
    }
    if (isNaN(unitPrice) || unitPrice < 0) {
      showRawAlert({ title: tInventory('modals.buyItemModal.invalidPrice') });
      return;
    }

    const total = qty * unitPrice;
    if (caps <= 0) {
      showRawAlert({
        title: tInventory('modals.buyItemModal.noCapsTitle'),
        message: tInventory('modals.buyItemModal.noCapsMessage'),
      });
      return;
    }
    if (total > caps) {
      showRawAlert({
        title: tInventory('modals.buyItemModal.notEnoughCapsTitle'),
        message: formatInventoryText(tInventory('modals.buyItemModal.notEnoughCapsMessage'), { total, caps }),
      });
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
