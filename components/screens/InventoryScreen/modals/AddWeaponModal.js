import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, FlatList, SafeAreaView } from 'react-native';
import { tInventory } from '../logic/inventoryI18n';
import { useLocale } from '../../../../i18n/locale';

const AddWeaponModal = ({ visible, onClose, weapons, onSelectWeapon }) => {
  useLocale();

  const handleSelect = (weapon) => {
    onSelectWeapon(weapon);
    onClose();
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity style={styles.itemContainer} onPress={() => handleSelect(item)}>
      <Text style={styles.itemName}>{item.name}</Text>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <SafeAreaView style={styles.modalContent}>
          <Text style={styles.title}>{tInventory('modals.addWeaponModal.title')}</Text>
          <FlatList
            data={weapons}
            renderItem={renderItem}
            keyExtractor={(item, index) => `${item.name}-${index}`}
          />
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>{tInventory('modals.addWeaponModal.close')}</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.5)', paddingHorizontal: 16, paddingVertical: 24 },
  modalContent: { width: '100%', maxWidth: 560, height: '80%', backgroundColor: 'white', borderRadius: 10, padding: 20 },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  itemContainer: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
  itemName: { fontSize: 16 },
  closeButton: { backgroundColor: '#DC3545', padding: 10, borderRadius: 5, marginTop: 20, alignItems: 'center' },
  closeButtonText: { color: 'white', fontWeight: 'bold' },
});

export default AddWeaponModal;
