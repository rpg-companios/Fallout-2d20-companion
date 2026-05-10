import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView } from 'react-native';
import styles from '../../../styles/PerkSelectModal.styles';
import { tPerksAndTraits } from './perksAndTraitsScreenI18n';

const PerkSelectModal = ({ visible, onClose, annotatedPerks, onChoosePerk }) => {
  const [expandedIndex, setExpandedIndex] = useState(null);
  const [selectedPerks, setSelectedPerks] = useState([]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <Text style={styles.modalTitle}>{tPerksAndTraits('modal.title')}</Text>

          <ScrollView style={{ maxHeight: 420 }}>
            {(annotatedPerks || []).map((entry, index) => {
              const { perk, available, unmet } = entry;
              const isExpanded = expandedIndex === index;
              const isSelected = selectedPerks.includes(perk);
              
              // Для выбранных перков - если они не развернуты вручную, показываем их свернутыми
              // Для непр-selected перков - обычное поведение
              const shouldShowExpanded = isExpanded && !isSelected;
              
              return (
                <View
                  key={`${perk.perk_name}-${perk.rank}-${index}`}
                  style={[styles.perkItem, !available && styles.perkDisabled]}
                >
                  <TouchableOpacity
                    onPress={() => {
                      // При клике на заголовок перка - переключаем его состояние развертывания
                      // Для выбранных перков - разворачиваем/сворачиваем по желанию пользователя
                      setExpandedIndex(isExpanded ? null : index);
                    }}
                    style={[styles.perkHeader, isSelected && styles.selectedPerk]}
                  >
                    <Text style={[styles.perkName, !available && styles.perkNameDisabled, isSelected && styles.selectedPerkName]}>
                      {perk.perk_name}
                    </Text>
                  </TouchableOpacity>
                  {shouldShowExpanded && (
                    <View style={styles.perkBody}>
                      <Text style={styles.perkDescription}>{perk.description}</Text>
                      {!available && unmet && (
                        <View style={styles.unmetContainer}>
                          {unmet.level && (
                            <Text style={styles.unmetText}>
                              {tPerksAndTraits('modal.requiresLevel')
                                .replace('{required}', unmet.level.required)
                                .replace('{current}', unmet.level.current)}
                            </Text>
                          )}
                          {unmet.attributes && Object.entries(unmet.attributes).map(([code, info]) => (
                            <Text key={`${perk.perk_name}-${code}`} style={styles.unmetText}>
                              {tPerksAndTraits('modal.requiresAttribute')
                                .replace('{code}', code)
                                .replace('{required}', info.required)
                                .replace('{current}', info.current)}
                            </Text>
                          ))}
                        </View>
                      )}
                      <TouchableOpacity
                        onPress={() => {
                          if (selectedPerks.includes(perk)) {
                            // Отменить выбор
                            setSelectedPerks(selectedPerks.filter(p => p !== perk));
                          } else {
                            // Выбрать перк
                            setSelectedPerks([...selectedPerks, perk]);
                          }
                        }}
                        style={[
                          styles.chooseButton,
                          !available && styles.chooseButtonDisabled,
                          isSelected && styles.selectedChooseButton
                        ]}
                        disabled={!available}
                      >
                        <Text style={styles.chooseButtonText}>
                          {isSelected ? tPerksAndTraits('modal.buttons.cancelChoice') : tPerksAndTraits('modal.buttons.choose')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.modalButtons}>
            <TouchableOpacity 
              style={[styles.modalButton, styles.confirmButton]} 
              onPress={() => {
                if (selectedPerks.length > 0) {
                  // Выбираем только первый перк, так как в нашем случае выбирается один перк за раз
                  const chosenPerk = selectedPerks[0];
                  onChoosePerk && onChoosePerk(chosenPerk);
                }
                onClose();
              }}
              disabled={selectedPerks.length === 0}
            >
              <Text style={styles.modalButtonText}>{tPerksAndTraits('modal.buttons.confirm')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={onClose}>
              <Text style={styles.modalButtonText}>{tPerksAndTraits('modal.buttons.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default PerkSelectModal;
