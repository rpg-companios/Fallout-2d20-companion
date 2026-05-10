// OriginModal.js
import React from 'react';
import { tCharacterScreen } from '../logic/characterScreenI18n';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  ScrollView, 
  Image
} from 'react-native';
import styles from '../../../../styles/OriginModal.styles';

const OriginModal = ({ 
  isVisible, 
  origins, 
  selectedOrigin, 
  onSelectOrigin, 
  onClose,
  onConfirm
}) => {
  if (!isVisible) return null;
  
  return (
    <View style={styles.modalOverlay}>
      <View style={styles.modalContainer}>
        <Text style={styles.modalTitle}>{tCharacterScreen('modals.origin.title', 'Select origin')}</Text>
        
        <ScrollView style={styles.originsList}>
          {origins.map(origin => (
            <TouchableOpacity
              key={origin.id}
              style={[
                styles.originItem,
                selectedOrigin?.id === origin.id && styles.selectedOriginItem
              ]}
              onPress={() => onSelectOrigin(origin)}
            >
              <Image source={origin.image} style={styles.originItemImage} resizeMode="contain" />
              <Text style={styles.originItemText}>{origin.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        
        <View style={styles.modalButtons}>
          <TouchableOpacity 
            style={[styles.modalButton, styles.cancelButton]} 
            onPress={onClose}
          >
            <Text style={styles.buttonText}>{tCharacterScreen('buttons.cancel', 'Cancel')}</Text>
          </TouchableOpacity>
          
          {selectedOrigin && (
            <TouchableOpacity 
              style={[styles.modalButton, styles.selectButton]} 
              onPress={onConfirm}
            >
              <Text style={styles.buttonText}>{tCharacterScreen('buttons.select', 'Select')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

export default OriginModal;
